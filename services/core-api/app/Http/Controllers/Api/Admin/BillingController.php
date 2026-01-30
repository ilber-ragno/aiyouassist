<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\BillingEvent;
use App\Models\CreditTransaction;
use App\Models\Invoice;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\TenantCredit;
use App\Services\Billing\BillingProviderFactory;
use App\Services\CreditService;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class BillingController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService,
        protected CreditService $creditService
    ) {}

    /**
     * Billing overview dashboard
     */
    public function overview(): JsonResponse
    {
        $totalSubscribers = Subscription::withoutGlobalScope('tenant')
            ->whereIn('status', ['active', 'trial', 'past_due'])
            ->count();

        $activeSubscribers = Subscription::withoutGlobalScope('tenant')
            ->where('status', 'active')
            ->count();

        $trialSubscribers = Subscription::withoutGlobalScope('tenant')
            ->where('status', 'trial')
            ->count();

        $pastDueSubscribers = Subscription::withoutGlobalScope('tenant')
            ->where('status', 'past_due')
            ->count();

        $blockedTenants = Tenant::where('is_blocked', true)->count();

        // MRR calculation
        $mrr = Subscription::withoutGlobalScope('tenant')
            ->where('status', 'active')
            ->join('plans', 'subscriptions.plan_id', '=', 'plans.id')
            ->sum('plans.price_monthly');

        // Revenue this month
        $revenueThisMonth = Invoice::withoutGlobalScope('tenant')
            ->where('status', 'paid')
            ->whereMonth('paid_at', now()->month)
            ->whereYear('paid_at', now()->year)
            ->sum('amount');

        return response()->json([
            'total_subscribers' => $totalSubscribers,
            'active_subscribers' => $activeSubscribers,
            'trial_subscribers' => $trialSubscribers,
            'past_due_subscribers' => $pastDueSubscribers,
            'blocked_tenants' => $blockedTenants,
            'mrr' => round($mrr, 2),
            'revenue_this_month' => round($revenueThisMonth, 2),
        ]);
    }

    /**
     * List all subscribers with billing status
     */
    public function subscribers(Request $request): JsonResponse
    {
        $query = Tenant::query()
            ->with(['subscription.plan'])
            ->withCount('users');

        $filter = $request->input('filter');
        if ($filter === 'paid' || $filter === 'active') {
            $query->whereHas('subscription', fn($q) => $q->where('status', 'active'));
        } elseif ($filter === 'overdue' || $filter === 'past_due') {
            $query->whereHas('subscription', fn($q) => $q->where('status', 'past_due'));
        } elseif ($filter === 'blocked') {
            $query->where('is_blocked', true);
        } elseif ($filter === 'trial') {
            $query->whereHas('subscription', fn($q) => $q->where('status', 'trial'));
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                  ->orWhere('slug', 'ilike', "%{$search}%");
            });
        }

        $subscribers = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 20));

        return response()->json($subscribers);
    }

    /**
     * Subscriber detail with invoices and events
     */
    public function subscriberDetail(string $tenantId): JsonResponse
    {
        $tenant = Tenant::with(['subscription.plan'])->findOrFail($tenantId);

        $invoices = Invoice::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        $events = BillingEvent::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json([
            'tenant' => $tenant,
            'invoices' => $invoices,
            'events' => $events,
        ]);
    }

    /**
     * Comprehensive financial detail for a subscriber
     */
    public function subscriberFinancialDetail(string $tenantId): JsonResponse
    {
        $tenant = Tenant::with(['subscription.plan'])->findOrFail($tenantId);

        // Credit balance
        $credit = TenantCredit::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->first();

        // Invoices (paginated)
        $invoices = Invoice::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        // Credit transactions
        $creditTransactions = CreditTransaction::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        // Total revenue from this tenant
        $totalRevenue = Invoice::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('status', 'paid')
            ->sum('amount');

        // Credit purchases total
        $totalCreditPurchases = CreditTransaction::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('type', 'purchase')
            ->where('amount_brl', '>', 0)
            ->sum('amount_brl');

        return response()->json([
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'is_blocked' => $tenant->is_blocked,
                'blocked_reason' => $tenant->blocked_reason,
                'blocked_at' => $tenant->blocked_at,
                'created_at' => $tenant->created_at,
            ],
            'subscription' => $tenant->subscription ? [
                'id' => $tenant->subscription->id,
                'plan' => $tenant->subscription->plan,
                'status' => $tenant->subscription->status,
                'payment_provider' => $tenant->subscription->payment_provider,
                'current_period_start' => $tenant->subscription->current_period_start,
                'current_period_end' => $tenant->subscription->current_period_end,
            ] : null,
            'credits' => [
                'plan_balance_brl' => (float) ($credit->plan_balance_brl ?? 0),
                'addon_balance_brl' => (float) ($credit->addon_balance_brl ?? 0),
                'total_balance_brl' => (float) ($credit->plan_balance_brl ?? 0) + (float) ($credit->addon_balance_brl ?? 0),
                'plan_credits_granted_brl' => (float) ($credit->plan_credits_granted_brl ?? 0),
                'total_purchased_brl' => (float) ($credit->total_purchased_brl ?? 0),
                'total_consumed_brl' => (float) ($credit->total_consumed_brl ?? 0),
            ],
            'invoices' => $invoices,
            'credit_transactions' => $creditTransactions,
            'total_revenue' => round((float) $totalRevenue, 2),
            'total_credit_purchases' => round((float) $totalCreditPurchases, 2),
        ]);
    }

    /**
     * Manually approve (mark as paid) a pending invoice
     */
    public function approvePayment(Request $request, string $invoiceId): JsonResponse
    {
        $invoice = Invoice::withoutGlobalScope('tenant')->findOrFail($invoiceId);

        if ($invoice->status !== 'pending') {
            return response()->json(['error' => 'Apenas faturas pendentes podem ser aprovadas'], 422);
        }

        $invoice->markAsPaid();

        // If this is a subscription payment, update subscription and unblock tenant
        if ($invoice->subscription_id) {
            $subscription = $invoice->subscription;
            if ($subscription) {
                $subscription->update(['status' => 'active']);
                $tenant = Tenant::find($subscription->tenant_id);
                if ($tenant && $tenant->is_blocked) {
                    $tenant->update([
                        'is_blocked' => false,
                        'blocked_reason' => null,
                        'blocked_at' => null,
                    ]);
                }
            }
        }

        $this->logService->audit('admin.billing.approve_payment', [
            'invoice_id' => $invoiceId,
            'tenant_id' => $invoice->tenant_id,
            'amount' => (float) $invoice->amount,
            'approved_by' => auth()->id(),
        ]);

        return response()->json([
            'message' => 'Pagamento aprovado com sucesso',
            'invoice' => $invoice->fresh(),
        ]);
    }

    /**
     * Grant credits to a tenant (from billing dashboard)
     */
    public function grantCredits(Request $request, string $tenantId): JsonResponse
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'description' => 'required|string|max:500',
        ]);

        $tenant = Tenant::findOrFail($tenantId);

        $transaction = $this->creditService->addCredits(
            $tenant,
            $validated['amount'],
            'manual_credit',
            $validated['description'],
            'admin_grant',
            auth()->id()
        );

        $this->logService->audit('admin.billing.grant_credits', [
            'tenant_id' => $tenantId,
            'amount_brl' => $validated['amount'],
            'description' => $validated['description'],
            'granted_by' => auth()->id(),
        ]);

        return response()->json([
            'message' => "R$ " . number_format($validated['amount'], 2, ',', '.') . " concedidos com sucesso",
            'transaction' => $transaction,
        ]);
    }

    /**
     * Block a tenant manually
     */
    public function blockTenant(Request $request, string $tenantId): JsonResponse
    {
        $tenant = Tenant::findOrFail($tenantId);

        $tenant->update([
            'is_blocked' => true,
            'blocked_reason' => $request->input('reason', 'Bloqueio manual pelo admin'),
            'blocked_at' => now(),
        ]);

        $this->logService->audit('admin.billing.block_tenant', [
            'tenant_id' => $tenantId,
            'reason' => $request->input('reason'),
        ]);

        return response()->json([
            'message' => 'Tenant bloqueado com sucesso',
            'tenant' => $tenant->fresh(),
        ]);
    }

    /**
     * Unblock a tenant manually
     */
    public function unblockTenant(string $tenantId): JsonResponse
    {
        $tenant = Tenant::findOrFail($tenantId);

        $tenant->update([
            'is_blocked' => false,
            'blocked_reason' => null,
            'blocked_at' => null,
        ]);

        $this->logService->audit('admin.billing.unblock_tenant', [
            'tenant_id' => $tenantId,
        ]);

        return response()->json([
            'message' => 'Tenant desbloqueado com sucesso',
            'tenant' => $tenant->fresh(),
        ]);
    }

    /**
     * Send invoice link to tenant
     */
    public function sendInvoiceLink(Request $request, string $tenantId): JsonResponse
    {
        $tenant = Tenant::with('subscription')->findOrFail($tenantId);
        $subscription = $tenant->subscription;

        if (!$subscription) {
            return response()->json(['error' => 'Tenant sem assinatura ativa'], 404);
        }

        try {
            $provider = BillingProviderFactory::resolve($subscription->payment_provider);

            if ($subscription->payment_provider === 'asaas') {
                $payments = $provider->listPayments($subscription->external_id);
                $pendingPayment = collect($payments['data'] ?? [])
                    ->firstWhere('status', 'PENDING');

                if ($pendingPayment) {
                    $invoiceUrl = $pendingPayment['invoiceUrl'] ?? $pendingPayment['bankSlipUrl'] ?? null;

                    return response()->json([
                        'message' => 'Link da fatura gerado',
                        'invoice_url' => $invoiceUrl,
                        'payment_id' => $pendingPayment['id'],
                    ]);
                }

                return response()->json(['error' => 'Nenhuma fatura pendente encontrada'], 404);
            }

            return response()->json(['error' => 'Envio de fatura nao suportado para este provider'], 400);
        } catch (\Exception $e) {
            Log::error('Failed to send invoice link', [
                'tenant_id' => $tenantId,
                'error' => $e->getMessage(),
            ]);

            return response()->json(['error' => 'Erro ao gerar link da fatura'], 500);
        }
    }

    /**
     * List all invoices (admin view)
     */
    public function allInvoices(Request $request): JsonResponse
    {
        $query = Invoice::withoutGlobalScope('tenant')
            ->with(['subscription.tenant', 'subscription.plan']);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($dateFrom = $request->input('date_from')) {
            $query->where('created_at', '>=', $dateFrom);
        }

        if ($dateTo = $request->input('date_to')) {
            $query->where('created_at', '<=', $dateTo);
        }

        $invoices = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 20));

        return response()->json($invoices);
    }

    /**
     * List billing events (webhook log)
     */
    public function billingEvents(Request $request): JsonResponse
    {
        $query = BillingEvent::withoutGlobalScope('tenant');

        if ($provider = $request->input('provider')) {
            $query->where('provider', $provider);
        }

        if ($eventType = $request->input('event_type')) {
            $query->where('event_type', $eventType);
        }

        $events = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 50));

        return response()->json($events);
    }
}
