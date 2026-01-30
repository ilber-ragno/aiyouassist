<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Plan;
use App\Models\Subscription;
use App\Services\Billing\BillingProviderFactory;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SubscriptionController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    /**
     * Show current subscription details
     */
    public function show(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;
        $subscription = $tenant->subscription;
        $plan = $subscription?->plan;

        return response()->json([
            'subscription' => $subscription ? [
                'id' => $subscription->id,
                'status' => $subscription->status,
                'payment_provider' => $subscription->payment_provider,
                'current_period_start' => $subscription->current_period_start,
                'current_period_end' => $subscription->current_period_end,
                'cancelled_at' => $subscription->cancelled_at,
                'days_until_renewal' => $subscription->daysUntilRenewal(),
            ] : null,
            'plan' => $plan ? [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'price_monthly' => $plan->price_monthly,
                'price_yearly' => $plan->price_yearly,
                'features' => $plan->features,
            ] : null,
            'usage' => [
                'users' => $tenant->users()->count(),
                'whatsapp_connections' => $tenant->whatsappSessions()->count(),
            ],
            'limits' => [
                'users' => $tenant->getLimit('users'),
                'whatsapp_connections' => $tenant->getLimit('whatsapp_connections'),
                'messages_monthly' => $tenant->getLimit('messages_monthly'),
            ],
            'is_blocked' => $tenant->is_blocked ?? false,
            'blocked_reason' => $tenant->blocked_reason,
        ]);
    }

    /**
     * List invoices
     */
    public function invoices(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;
        $subscription = $tenant->subscription;

        if (!$subscription) {
            return response()->json(['invoices' => []]);
        }

        $invoices = $subscription->invoices()
            ->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 20));

        return response()->json([
            'invoices' => $invoices,
        ]);
    }

    /**
     * Change plan - creates new subscription on provider, cancels old
     */
    public function changePlan(Request $request): JsonResponse
    {
        $request->validate([
            'plan_id' => 'required|uuid|exists:plans,id',
            'billing_type' => 'nullable|string|in:BOLETO,CREDIT_CARD,PIX,UNDEFINED',
        ]);

        $tenant = $request->user()->tenant;
        $currentSubscription = $tenant->subscription;
        $newPlan = Plan::findOrFail($request->plan_id);

        if ($currentSubscription && $currentSubscription->plan_id === $newPlan->id) {
            return response()->json(['error' => 'Voce ja esta neste plano'], 422);
        }

        try {
            $provider = $currentSubscription
                ? $currentSubscription->payment_provider
                : ($tenant->billing_provider ?? 'asaas');

            $billingService = BillingProviderFactory::resolve($provider);

            // Ensure tenant has a customer on the provider
            $customerId = $tenant->billing_customer_id;
            if (!$customerId) {
                if ($provider === 'asaas') {
                    $customer = $billingService->createCustomer($tenant);
                    $customerId = $customer['id'];
                } else {
                    $customer = $billingService->createCustomer($tenant);
                    $customerId = $customer->id;
                }
                $tenant->update(['billing_customer_id' => $customerId]);
            }

            // Cancel old subscription on provider
            if ($currentSubscription && $currentSubscription->external_id) {
                try {
                    $billingService->cancelSubscription($currentSubscription->external_id);
                } catch (\Exception $e) {
                    Log::warning('Failed to cancel old subscription on provider', [
                        'error' => $e->getMessage(),
                    ]);
                }
                $currentSubscription->cancel();
            }

            // Create new subscription on provider
            if ($provider === 'asaas') {
                $externalSub = $billingService->createSubscription($customerId, [
                    'value' => $newPlan->price_monthly,
                    'cycle' => 'MONTHLY',
                    'description' => "Plano {$newPlan->name} - AiYou Assist",
                    'external_reference' => $tenant->id,
                ], $request->input('billing_type', 'UNDEFINED'));

                $externalId = $externalSub['id'];
            } else {
                // Stripe - requires price_id in plan features
                $priceId = data_get($newPlan->features, 'stripe_price_id');
                if (!$priceId) {
                    return response()->json(['error' => 'Plano sem configuracao Stripe'], 422);
                }
                $externalSub = $billingService->createSubscription($customerId, $priceId);
                $externalId = $externalSub->id;
            }

            // Create local subscription record
            $subscription = Subscription::create([
                'tenant_id' => $tenant->id,
                'plan_id' => $newPlan->id,
                'status' => Subscription::STATUS_ACTIVE,
                'payment_provider' => $provider,
                'external_id' => $externalId,
                'current_period_start' => now(),
                'current_period_end' => now()->addMonth(),
            ]);

            $this->logService->audit('subscription.change_plan', [
                'plan_id' => $newPlan->id,
                'plan_name' => $newPlan->name,
                'provider' => $provider,
            ]);

            return response()->json([
                'message' => 'Plano alterado com sucesso',
                'subscription' => $subscription->load('plan'),
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to change plan', [
                'tenant_id' => $tenant->id,
                'plan_id' => $request->plan_id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Erro ao alterar plano. Tente novamente.',
            ], 500);
        }
    }

    /**
     * Cancel subscription
     */
    public function cancel(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;
        $subscription = $tenant->subscription;

        if (!$subscription) {
            return response()->json(['error' => 'Nenhuma assinatura ativa'], 404);
        }

        if ($subscription->isCancelled()) {
            return response()->json(['error' => 'Assinatura ja cancelada'], 422);
        }

        try {
            // Cancel on provider
            if ($subscription->external_id) {
                $billingService = BillingProviderFactory::resolve($subscription->payment_provider);
                $billingService->cancelSubscription($subscription->external_id);
            }

            // Cancel locally
            $subscription->cancel();

            $this->logService->audit('subscription.cancel', [
                'reason' => $request->input('reason'),
                'subscription_id' => $subscription->id,
            ]);

            return response()->json([
                'message' => 'Assinatura cancelada com sucesso',
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to cancel subscription', [
                'tenant_id' => $tenant->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Erro ao cancelar assinatura. Tente novamente.',
            ], 500);
        }
    }

    /**
     * Create subscription (checkout flow)
     */
    public function createSubscription(Request $request): JsonResponse
    {
        $request->validate([
            'plan_id' => 'required|uuid|exists:plans,id',
            'billing_type' => 'nullable|string|in:BOLETO,CREDIT_CARD,PIX,UNDEFINED',
            'cpf_cnpj' => 'nullable|string|max:20',
        ]);

        $tenant = $request->user()->tenant;
        $plan = Plan::findOrFail($request->plan_id);

        // Check if already has active subscription
        $existing = $tenant->subscription;
        if ($existing && $existing->isActive() && $existing->status !== Subscription::STATUS_TRIAL) {
            return response()->json(['error' => 'Voce ja possui uma assinatura ativa. Use "Alterar Plano" para trocar.'], 422);
        }

        $provider = $tenant->billing_provider ?? 'asaas';

        // Save CPF/CNPJ to tenant settings (needed by Asaas)
        if ($request->filled('cpf_cnpj')) {
            $tenant->setSetting('cpf_cnpj', $request->input('cpf_cnpj'));
            $tenant->save();
        }

        try {
            $billingService = BillingProviderFactory::resolve($provider);

            // Create customer on provider if needed
            $customerId = $tenant->billing_customer_id;
            if (!$customerId) {
                if ($provider === 'asaas') {
                    $customerData = $billingService->createCustomer($tenant);
                    $customerId = $customerData['id'];
                } else {
                    $customerData = $billingService->createCustomer($tenant);
                    $customerId = $customerData->id;
                }
                $tenant->update(['billing_customer_id' => $customerId]);
            }

            // Cancel trial subscription if exists
            if ($existing && $existing->status === Subscription::STATUS_TRIAL) {
                $existing->update(['status' => Subscription::STATUS_CANCELLED, 'cancelled_at' => now()]);
            }

            $responseData = ['message' => 'Assinatura criada com sucesso'];

            if ($provider === 'asaas') {
                $billingType = $request->input('billing_type', 'PIX');

                $externalSub = $billingService->createSubscription($customerId, [
                    'value' => $plan->price_monthly,
                    'cycle' => 'MONTHLY',
                    'description' => "Plano {$plan->name} - AiYou Assist",
                    'external_reference' => $tenant->id,
                ], $billingType);

                $externalId = $externalSub['id'];

                // Try to get first payment info for PIX/boleto
                try {
                    $payments = $billingService->listPayments($externalId);
                    $firstPayment = $payments['data'][0] ?? null;

                    if ($firstPayment) {
                        // Create invoice record
                        Invoice::create([
                            'tenant_id' => $tenant->id,
                            'subscription_id' => null, // will be linked below
                            'external_id' => $firstPayment['id'],
                            'status' => 'pending',
                            'amount' => $firstPayment['value'],
                            'currency' => 'BRL',
                            'due_date' => $firstPayment['dueDate'],
                            'invoice_url' => $firstPayment['invoiceUrl'] ?? null,
                        ]);

                        if ($billingType === 'PIX') {
                            try {
                                $pixData = $billingService->getPixQrCode($firstPayment['id']);
                                $responseData['pix'] = [
                                    'payload' => $pixData['payload'] ?? null,
                                    'expiration_date' => $pixData['expirationDate'] ?? null,
                                ];
                            } catch (\Exception $e) {
                                Log::warning('Failed to get PIX QR code', ['error' => $e->getMessage()]);
                            }
                        }

                        if ($firstPayment['invoiceUrl'] ?? null) {
                            $responseData['invoice_url'] = $firstPayment['invoiceUrl'];
                        }
                    }
                } catch (\Exception $e) {
                    Log::warning('Failed to get first payment', ['error' => $e->getMessage()]);
                }
            } else {
                // Stripe - create checkout session
                $priceId = data_get($plan->features, 'stripe_price_id');
                if (!$priceId) {
                    return response()->json(['error' => 'Plano sem configuracao Stripe'], 422);
                }

                $externalSub = $billingService->createSubscription($customerId, $priceId);
                $externalId = $externalSub->id;

                // For Stripe, we'd create a checkout session
                // but for now just return the subscription
                $responseData['redirect_url'] = $externalSub->latest_invoice?->hosted_invoice_url;
            }

            // Create local subscription
            $subscription = Subscription::create([
                'tenant_id' => $tenant->id,
                'plan_id' => $plan->id,
                'status' => Subscription::STATUS_ACTIVE,
                'payment_provider' => $provider,
                'external_id' => $externalId,
                'current_period_start' => now(),
                'current_period_end' => now()->addMonth(),
            ]);

            // Update tenant status
            $tenant->update(['status' => 'active']);

            $this->logService->audit('subscription.created', [
                'plan_id' => $plan->id,
                'plan_name' => $plan->name,
                'provider' => $provider,
                'billing_type' => $request->input('billing_type'),
            ]);

            return response()->json($responseData, 201);
        } catch (\Exception $e) {
            Log::error('Failed to create subscription', [
                'tenant_id' => $tenant->id,
                'plan_id' => $request->plan_id,
                'error' => $e->getMessage(),
            ]);

            return response()->json(['error' => 'Erro ao criar assinatura: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Get invoice payment link
     */
    public function invoiceLink(string $invoiceId): JsonResponse
    {
        $invoice = Invoice::findOrFail($invoiceId);
        $subscription = $invoice->subscription;

        if (!$subscription) {
            return response()->json(['error' => 'Fatura sem assinatura vinculada'], 404);
        }

        // If we already have the URL stored
        if ($invoice->invoice_url) {
            return response()->json([
                'invoice_url' => $invoice->invoice_url,
            ]);
        }

        // Try to fetch from provider
        try {
            if ($subscription->payment_provider === 'asaas' && $invoice->external_id) {
                $billingService = BillingProviderFactory::resolve('asaas');
                $result = $billingService->getInvoiceUrl($invoice->external_id);

                $url = $result['identificationField'] ?? null;
                if ($url) {
                    $invoice->update(['invoice_url' => $url]);
                }

                // Also try to get PIX QR code
                $pixData = null;
                try {
                    $pixResult = $billingService->getPixQrCode($invoice->external_id);
                    $pixData = [
                        'payload' => $pixResult['payload'] ?? null,
                        'expiration_date' => $pixResult['expirationDate'] ?? null,
                    ];
                } catch (\Exception $e) {
                    // PIX may not be available for all billing types
                }

                return response()->json([
                    'invoice_url' => $url,
                    'pix' => $pixData,
                ]);
            }

            return response()->json(['error' => 'Link nao disponivel'], 404);
        } catch (\Exception $e) {
            Log::error('Failed to get invoice link', [
                'invoice_id' => $invoiceId,
                'error' => $e->getMessage(),
            ]);

            return response()->json(['error' => 'Erro ao buscar link da fatura'], 500);
        }
    }
}
