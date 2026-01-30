<?php

namespace App\Services;

use App\Models\CreditSetting;
use App\Models\CreditTransaction;
use App\Models\Tenant;
use App\Models\TenantCredit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CreditService
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    /**
     * Get or create tenant credit record.
     */
    public function getOrCreateCredit(Tenant $tenant): TenantCredit
    {
        return TenantCredit::firstOrCreate(
            ['tenant_id' => $tenant->id],
            [
                'balance_brl' => 0,
                'total_purchased_brl' => 0,
                'total_consumed_brl' => 0,
                'plan_balance_brl' => 0,
                'addon_balance_brl' => 0,
                'plan_credits_granted_brl' => 0,
            ]
        );
    }

    /**
     * Get current total balance for a tenant (plan + addon).
     */
    public function getBalance(string $tenantId): float
    {
        $credit = TenantCredit::where('tenant_id', $tenantId)->first();
        if (!$credit) {
            return 0.0;
        }
        return (float) $credit->plan_balance_brl + (float) $credit->addon_balance_brl;
    }

    /**
     * Check if tenant has sufficient balance.
     */
    public function hasSufficientBalance(string $tenantId, float $minAmount = 0.01): bool
    {
        $settings = CreditSetting::current();
        if (!$settings->block_on_zero_balance) {
            return true;
        }
        return $this->getBalance($tenantId) >= $minAmount;
    }

    /**
     * Add credits to a tenant (purchase, manual, refund → addon_balance).
     */
    public function addCredits(
        Tenant $tenant,
        float $amount,
        string $type,
        string $description,
        ?string $referenceType = null,
        ?string $referenceId = null,
        ?array $metadata = null
    ): CreditTransaction {
        $transaction = DB::transaction(function () use ($tenant, $amount, $type, $description, $referenceType, $referenceId, $metadata) {
            $credit = $this->getOrCreateCredit($tenant);

            $creditSource = 'addon';

            if ($type === 'plan_replenishment') {
                // Plan credits go to plan_balance
                $credit->plan_balance_brl = (float) $credit->plan_balance_brl + $amount;
                $credit->plan_credits_granted_brl = $amount;
                $credit->plan_credits_reset_at = now();
                $creditSource = 'plan';
            } else {
                // All other credits go to addon_balance
                $credit->addon_balance_brl = (float) $credit->addon_balance_brl + $amount;
            }

            // Keep balance_brl in sync (backward compat)
            $credit->balance_brl = (float) $credit->plan_balance_brl + (float) $credit->addon_balance_brl;

            if (in_array($type, ['purchase', 'manual_credit'])) {
                $credit->total_purchased_brl = (float) $credit->total_purchased_brl + $amount;
            }
            $credit->updated_at = now();
            $credit->save();

            return CreditTransaction::create([
                'tenant_id' => $tenant->id,
                'type' => $type,
                'amount_brl' => $amount,
                'balance_after_brl' => $credit->balance_brl,
                'description' => $description,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'metadata' => $metadata,
                'credit_source' => $creditSource,
            ]);
        });

        $typeLabel = match ($type) {
            'purchase' => 'Compra de créditos',
            'manual_credit' => 'Crédito manual',
            'refund' => 'Reembolso',
            'plan_replenishment' => 'Reposição do plano',
            default => "Crédito ({$type})",
        };
        $this->logService->credit("{$typeLabel}: R$ " . number_format($amount, 2, ',', '.'), [
            'tenant_name' => $tenant->name,
            'amount_brl' => $amount,
            'type' => $type,
            'balance_after_brl' => (float) $transaction->balance_after_brl,
            'description' => $description,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
        ], 'info', $tenant->id);

        return $transaction;
    }

    /**
     * Deduct credits after AI usage.
     * Deducts from plan_balance first, then addon_balance.
     */
    public function deductCredits(
        string $tenantId,
        float $costUsd,
        int $totalTokens,
        string $model,
        ?string $aiDecisionId = null
    ): ?CreditTransaction {
        $settings = CreditSetting::current();
        $chargeBrl = $this->calculateChargeableCost($costUsd, $totalTokens, $settings);

        if ($chargeBrl <= 0) {
            return null;
        }

        $transaction = DB::transaction(function () use ($tenantId, $chargeBrl, $costUsd, $totalTokens, $model, $aiDecisionId, $settings) {
            $credit = TenantCredit::where('tenant_id', $tenantId)->lockForUpdate()->first();

            if (!$credit) {
                $credit = TenantCredit::create([
                    'tenant_id' => $tenantId,
                    'balance_brl' => 0,
                    'total_purchased_brl' => 0,
                    'total_consumed_brl' => 0,
                    'plan_balance_brl' => 0,
                    'addon_balance_brl' => 0,
                    'plan_credits_granted_brl' => 0,
                ]);
            }

            $planBal = (float) $credit->plan_balance_brl;
            $addonBal = (float) $credit->addon_balance_brl;
            $creditSource = 'plan';

            if ($planBal >= $chargeBrl) {
                // Fully covered by plan credits
                $credit->plan_balance_brl = $planBal - $chargeBrl;
            } else {
                // Plan credits insufficient, use plan + addon
                $remainder = $chargeBrl - $planBal;
                $credit->plan_balance_brl = 0;
                $credit->addon_balance_brl = $addonBal - $remainder;
                $creditSource = $planBal > 0 ? 'plan+addon' : 'addon';
            }

            // Keep balance_brl in sync
            $credit->balance_brl = (float) $credit->plan_balance_brl + (float) $credit->addon_balance_brl;
            $credit->total_consumed_brl = (float) $credit->total_consumed_brl + $chargeBrl;
            $credit->updated_at = now();
            $credit->save();

            return CreditTransaction::create([
                'tenant_id' => $tenantId,
                'type' => 'deduction',
                'amount_brl' => -$chargeBrl,
                'balance_after_brl' => $credit->balance_brl,
                'description' => "Uso de IA: {$model}",
                'reference_type' => 'ai_decision',
                'reference_id' => $aiDecisionId,
                'credit_source' => $creditSource,
                'metadata' => [
                    'cost_usd' => $costUsd,
                    'cost_brl' => round($costUsd * (float) $settings->usd_to_brl_rate, 4),
                    'charge_brl' => $chargeBrl,
                    'markup_type' => $settings->markup_type,
                    'markup_value' => (float) $settings->markup_value,
                    'usd_to_brl_rate' => (float) $settings->usd_to_brl_rate,
                    'total_tokens' => $totalTokens,
                    'model' => $model,
                    'credit_source' => $creditSource,
                ],
            ]);
        });

        $this->logService->credit("Dedução IA ({$model}): R$ " . number_format($chargeBrl, 4, ',', '.'), [
            'model' => $model,
            'tokens' => $totalTokens,
            'cost_usd' => $costUsd,
            'charge_brl' => $chargeBrl,
            'balance_after_brl' => (float) $transaction->balance_after_brl,
        ], 'info', $tenantId);

        // Warn if balance is low
        $balanceAfter = (float) $transaction->balance_after_brl;
        $minWarning = (float) $settings->min_balance_warning_brl;
        if ($balanceAfter <= $minWarning && $balanceAfter > 0) {
            $this->logService->credit('Saldo de créditos baixo', [
                'balance_brl' => $balanceAfter,
                'min_warning_brl' => $minWarning,
            ], 'warning', $tenantId);
        } elseif ($balanceAfter <= 0) {
            $this->logService->credit('Saldo de créditos esgotado', [
                'balance_brl' => $balanceAfter,
            ], 'error', $tenantId);
        }

        return $transaction;
    }

    /**
     * Replenish plan credits for a tenant based on their current plan.
     */
    public function replenishPlanCredits(Tenant $tenant): ?CreditTransaction
    {
        $plan = $tenant->getCurrentPlan();
        if (!$plan || (float) ($plan->included_credits_brl ?? 0) <= 0) {
            return null;
        }

        $amount = (float) $plan->included_credits_brl;

        return $this->addCredits(
            $tenant,
            $amount,
            'plan_replenishment',
            "Reposição mensal do plano {$plan->name}: R$ " . number_format($amount, 2, ',', '.'),
            'plan',
            $plan->id,
            [
                'plan_name' => $plan->name,
                'plan_id' => $plan->id,
                'included_credits_brl' => $amount,
            ]
        );
    }

    /**
     * Calculate the BRL amount to charge (cost + markup).
     */
    public function calculateChargeableCost(float $costUsd, int $totalTokens, ?CreditSetting $settings = null): float
    {
        $settings = $settings ?? CreditSetting::current();
        $costBrl = $costUsd * (float) $settings->usd_to_brl_rate;

        if ($settings->markup_type === 'percentage') {
            $charge = $costBrl * (1 + (float) $settings->markup_value / 100);
        } else {
            // fixed_per_1k
            $charge = $costBrl + ($totalTokens / 1000) * (float) $settings->markup_value;
        }

        return round($charge, 4);
    }
}
