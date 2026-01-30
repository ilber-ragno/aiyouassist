<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Services\CreditService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ReplenishPlanCredits extends Command
{
    protected $signature = 'credits:replenish-plans';
    protected $description = 'Replenish plan credits for subscriptions that have been renewed';

    public function handle(CreditService $creditService): int
    {
        $this->info('Checking subscriptions for plan credit replenishment...');

        // Find active subscriptions whose period has ended (renewal due)
        $subscriptions = Subscription::withoutGlobalScope('tenant')
            ->whereIn('status', ['active', 'trial'])
            ->where('current_period_end', '<=', now())
            ->with(['tenant', 'plan'])
            ->get();

        $replenished = 0;

        foreach ($subscriptions as $subscription) {
            $tenant = $subscription->tenant;
            $plan = $subscription->plan;

            if (!$tenant || !$plan) {
                continue;
            }

            $includedCredits = (float) ($plan->included_credits_brl ?? 0);
            if ($includedCredits <= 0) {
                continue;
            }

            // Check if already replenished this period
            $credit = $tenant->credit;
            if ($credit && $credit->plan_credits_reset_at) {
                $resetAt = $credit->plan_credits_reset_at;
                // Don't replenish if already done within the last 25 days
                if ($resetAt->diffInDays(now()) < 25) {
                    continue;
                }
            }

            try {
                $creditService->replenishPlanCredits($tenant);
                $replenished++;
                $this->info("  Replenished {$tenant->name}: R$ {$includedCredits}");
            } catch (\Exception $e) {
                Log::error("Failed to replenish plan credits for tenant {$tenant->id}", [
                    'error' => $e->getMessage(),
                ]);
                $this->error("  Failed: {$tenant->name} - {$e->getMessage()}");
            }
        }

        $this->info("Done. Replenished {$replenished} tenants.");
        return Command::SUCCESS;
    }
}
