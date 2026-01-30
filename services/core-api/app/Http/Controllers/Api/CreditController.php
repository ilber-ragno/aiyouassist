<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CreditPackage;
use App\Models\CreditSetting;
use App\Models\CreditTransaction;
use App\Models\TenantCredit;
use App\Services\CreditService;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CreditController extends Controller
{
    public function __construct(
        protected CreditService $creditService,
        protected ExecutionLogService $logService
    ) {}

    /**
     * Get current balance and recent transactions.
     */
    public function balance(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;
        $credit = $this->creditService->getOrCreateCredit($tenant);
        $settings = CreditSetting::current();

        $recentTransactions = CreditTransaction::where('tenant_id', $tenant->id)
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get();

        $planBalance = (float) ($credit->plan_balance_brl ?? 0);
        $addonBalance = (float) ($credit->addon_balance_brl ?? 0);
        $totalBalance = $planBalance + $addonBalance;
        $planGranted = (float) ($credit->plan_credits_granted_brl ?? 0);

        // Get plan info for included credits
        $subscription = $tenant->subscription;
        $plan = $subscription?->plan;
        $planIncluded = (float) ($plan->included_credits_brl ?? 0);

        return response()->json([
            'balance_brl' => $totalBalance,
            'plan_balance_brl' => $planBalance,
            'addon_balance_brl' => $addonBalance,
            'plan_credits_granted_brl' => $planGranted,
            'plan_included_brl' => $planIncluded,
            'plan_credits_exhausted' => $planBalance <= 0 && $planIncluded > 0,
            'needs_addon_purchase' => $totalBalance <= 0 && $planBalance <= 0,
            'plan_resets_at' => $subscription?->current_period_end?->toIso8601String(),
            'total_purchased_brl' => (float) $credit->total_purchased_brl,
            'total_consumed_brl' => (float) $credit->total_consumed_brl,
            'low_balance' => $totalBalance <= (float) $settings->min_balance_warning_brl,
            'recent_transactions' => $recentTransactions,
        ]);
    }

    /**
     * Paginated transaction history.
     */
    public function transactions(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;

        $query = CreditTransaction::where('tenant_id', $tenant->id)
            ->orderBy('created_at', 'desc');

        if ($request->has('type')) {
            $query->where('type', $request->input('type'));
        }

        $transactions = $query->paginate(20);

        return response()->json($transactions);
    }

    /**
     * List available credit packages.
     */
    public function packages(): JsonResponse
    {
        $packages = CreditPackage::active()->ordered()->get();
        return response()->json(['packages' => $packages]);
    }

    /**
     * Purchase a credit package (creates Asaas payment).
     */
    public function purchase(Request $request, CreditPackage $package): JsonResponse
    {
        if (!$package->is_active) {
            return response()->json(['error' => 'Pacote não disponível'], 422);
        }

        $tenant = $request->user()->tenant;

        $validated = $request->validate([
            'billing_type' => 'sometimes|string|in:PIX,BOLETO,CREDIT_CARD',
        ]);

        $billingType = $validated['billing_type'] ?? 'UNDEFINED';

        // Log purchase attempt
        $this->logService->credit("Compra iniciada: {$package->name}", [
            'package_id' => $package->id,
            'package_name' => $package->name,
            'price_brl' => (float) $package->price_brl,
            'credit_amount_brl' => (float) $package->credit_amount_brl,
            'billing_type' => $billingType,
            'user' => $request->user()->name,
        ]);

        // Create a pending credit transaction for tracking
        $credit = $this->creditService->getOrCreateCredit($tenant);
        $transaction = CreditTransaction::create([
            'tenant_id' => $tenant->id,
            'type' => 'purchase',
            'amount_brl' => 0, // Will be updated on payment confirmation
            'balance_after_brl' => $credit->balance_brl,
            'description' => "Compra: {$package->name} (aguardando pagamento)",
            'reference_type' => 'credit_package',
            'reference_id' => $package->id,
            'metadata' => [
                'package_name' => $package->name,
                'package_price' => (float) $package->price_brl,
                'credit_amount' => (float) $package->credit_amount_brl,
                'billing_type' => $billingType,
                'status' => 'pending',
            ],
        ]);

        // Create Asaas payment
        try {
            $asaasService = app(\App\Services\Billing\AsaasService::class);
            $payment = $asaasService->createPayment(
                $tenant->billing_customer_id,
                (float) $package->price_brl,
                "AiYou Créditos: {$package->name}",
                "credit_{$transaction->id}",
                $billingType
            );

            // Update transaction with Asaas payment ID
            $transaction->update([
                'metadata' => array_merge($transaction->metadata ?? [], [
                    'asaas_payment_id' => $payment['id'] ?? null,
                    'invoice_url' => $payment['invoiceUrl'] ?? null,
                    'pix_payload' => $payment['pix']['payload'] ?? null,
                    'bank_slip_url' => $payment['bankSlipUrl'] ?? null,
                ]),
            ]);

            $this->logService->credit("Pagamento criado no Asaas: {$package->name}", [
                'asaas_payment_id' => $payment['id'] ?? null,
                'price_brl' => (float) $package->price_brl,
                'billing_type' => $billingType,
                'transaction_id' => $transaction->id,
            ]);

            return response()->json([
                'transaction_id' => $transaction->id,
                'payment' => [
                    'id' => $payment['id'] ?? null,
                    'invoice_url' => $payment['invoiceUrl'] ?? null,
                    'pix_payload' => $payment['pix']['payload'] ?? null,
                    'bank_slip_url' => $payment['bankSlipUrl'] ?? null,
                    'billing_type' => $billingType,
                ],
            ]);
        } catch (\Exception $e) {
            // Delete the pending transaction on error
            $transaction->delete();
            $this->logService->credit("Erro ao criar pagamento: {$package->name}", [
                'error' => $e->getMessage(),
                'package_id' => $package->id,
                'price_brl' => (float) $package->price_brl,
            ], 'error');
            return response()->json([
                'error' => 'Erro ao criar pagamento: ' . $e->getMessage(),
            ], 500);
        }
    }

    // =========================================================================
    // Internal endpoints (called by ai-orchestrator)
    // =========================================================================

    /**
     * Check tenant credit balance (internal - no auth, uses X-Internal-Key).
     */
    public function internalCheckBalance(string $tenantId): JsonResponse
    {
        $internalKey = request()->header('X-Internal-Key');
        $expectedKey = config('services.claudbot.internal_key');
        if (!$internalKey || $internalKey !== $expectedKey) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $balance = $this->creditService->getBalance($tenantId);
        $settings = CreditSetting::current();

        return response()->json([
            'balance_brl' => $balance,
            'sufficient' => !$settings->block_on_zero_balance || $balance > 0,
            'block_on_zero' => $settings->block_on_zero_balance,
        ]);
    }

    /**
     * Deduct credits after AI usage (internal - no auth, uses X-Internal-Key).
     */
    public function internalDeduct(Request $request): JsonResponse
    {
        $internalKey = $request->header('X-Internal-Key');
        $expectedKey = config('services.claudbot.internal_key');
        if (!$internalKey || $internalKey !== $expectedKey) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'tenant_id' => 'required|string',
            'cost_usd' => 'required|numeric|min:0',
            'total_tokens' => 'required|integer|min:0',
            'model' => 'required|string',
            'ai_decision_id' => 'nullable|string',
        ]);

        $transaction = $this->creditService->deductCredits(
            $validated['tenant_id'],
            $validated['cost_usd'],
            $validated['total_tokens'],
            $validated['model'],
            $validated['ai_decision_id'] ?? null
        );

        $balance = $this->creditService->getBalance($validated['tenant_id']);

        return response()->json([
            'deducted' => $transaction !== null,
            'balance_brl' => $balance,
            'transaction_id' => $transaction?->id,
        ]);
    }
}
