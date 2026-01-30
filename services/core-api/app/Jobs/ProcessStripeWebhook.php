<?php

namespace App\Jobs;

use App\Models\BillingEvent;
use App\Models\Invoice;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\WebhookEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ProcessStripeWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;

    public function __construct(
        protected WebhookEvent $webhookEvent
    ) {}

    public function handle(): void
    {
        $event = $this->webhookEvent->event_type;
        $payload = $this->webhookEvent->payload;

        Log::info('Processing Stripe webhook', [
            'event' => $event,
            'external_id' => $this->webhookEvent->external_id,
        ]);

        match ($event) {
            'invoice.paid' => $this->handleInvoicePaid($payload),
            'invoice.payment_failed' => $this->handleInvoicePaymentFailed($payload),
            'customer.subscription.deleted' => $this->handleSubscriptionDeleted($payload),
            'customer.subscription.updated' => $this->handleSubscriptionUpdated($payload),
            default => Log::info("Stripe: Unhandled event type: {$event}"),
        };

        // Mark webhook as processed
        $this->webhookEvent->update([
            'processed' => true,
            'processed_at' => now(),
        ]);
    }

    private function handleInvoicePaid(array $data): void
    {
        $stripeSubscriptionId = $data['subscription'] ?? null;
        $stripeInvoiceId = $data['id'] ?? null;

        $subscription = $this->findSubscription($stripeSubscriptionId);
        if (!$subscription) {
            return;
        }

        $tenant = $subscription->tenant;

        // Create/update invoice
        Invoice::withoutGlobalScope('tenant')->updateOrCreate(
            ['external_id' => $stripeInvoiceId],
            [
                'tenant_id' => $subscription->tenant_id,
                'subscription_id' => $subscription->id,
                'status' => Invoice::STATUS_PAID,
                'amount' => ($data['amount_paid'] ?? 0) / 100, // Stripe uses cents
                'currency' => strtoupper($data['currency'] ?? 'BRL'),
                'paid_at' => now(),
                'invoice_url' => $data['hosted_invoice_url'] ?? null,
            ]
        );

        // Activate subscription
        $subscription->update(['status' => Subscription::STATUS_ACTIVE]);

        // Unblock tenant
        if ($tenant && $tenant->is_blocked) {
            $tenant->update([
                'is_blocked' => false,
                'blocked_reason' => null,
                'blocked_at' => null,
            ]);
        }

        // Log billing event
        $this->logBillingEvent($tenant, 'invoice.paid', $data);
    }

    private function handleInvoicePaymentFailed(array $data): void
    {
        $stripeSubscriptionId = $data['subscription'] ?? null;
        $stripeInvoiceId = $data['id'] ?? null;

        $subscription = $this->findSubscription($stripeSubscriptionId);
        if (!$subscription) {
            return;
        }

        // Update invoice
        Invoice::withoutGlobalScope('tenant')->updateOrCreate(
            ['external_id' => $stripeInvoiceId],
            [
                'tenant_id' => $subscription->tenant_id,
                'subscription_id' => $subscription->id,
                'status' => Invoice::STATUS_FAILED,
                'amount' => ($data['amount_due'] ?? 0) / 100,
                'currency' => strtoupper($data['currency'] ?? 'BRL'),
                'invoice_url' => $data['hosted_invoice_url'] ?? null,
            ]
        );

        // Mark subscription as past_due
        $subscription->update(['status' => Subscription::STATUS_PAST_DUE]);

        $this->logBillingEvent($subscription->tenant, 'invoice.payment_failed', $data);
    }

    private function handleSubscriptionDeleted(array $data): void
    {
        $subscription = $this->findSubscription($data['id'] ?? null);
        if (!$subscription) {
            return;
        }

        $subscription->update([
            'status' => Subscription::STATUS_CANCELLED,
            'cancelled_at' => now(),
        ]);

        $this->logBillingEvent($subscription->tenant, 'customer.subscription.deleted', $data);
    }

    private function handleSubscriptionUpdated(array $data): void
    {
        $subscription = $this->findSubscription($data['id'] ?? null);
        if (!$subscription) {
            return;
        }

        $stripeStatus = $data['status'] ?? null;
        $localStatus = match ($stripeStatus) {
            'active' => Subscription::STATUS_ACTIVE,
            'past_due' => Subscription::STATUS_PAST_DUE,
            'canceled' => Subscription::STATUS_CANCELLED,
            'trialing' => Subscription::STATUS_TRIAL,
            'paused' => Subscription::STATUS_PAUSED,
            default => null,
        };

        if ($localStatus) {
            $subscription->update(['status' => $localStatus]);
        }

        $this->logBillingEvent($subscription->tenant, 'customer.subscription.updated', $data);
    }

    private function findSubscription(?string $externalId): ?Subscription
    {
        if (!$externalId) {
            return null;
        }

        return Subscription::withoutGlobalScope('tenant')
            ->where('external_id', $externalId)
            ->where('payment_provider', 'stripe')
            ->first();
    }

    private function logBillingEvent(?Tenant $tenant, string $eventType, array $data): void
    {
        if (!$tenant) {
            return;
        }

        BillingEvent::withoutGlobalScope('tenant')->create([
            'tenant_id' => $tenant->id,
            'event_type' => $eventType,
            'provider' => 'stripe',
            'external_id' => $data['id'] ?? null,
            'payload' => $data,
            'processed_at' => now(),
            'idempotency_key' => $this->webhookEvent->idempotency_key,
        ]);
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('ProcessStripeWebhook job failed', [
            'webhook_event_id' => $this->webhookEvent->id,
            'error' => $exception->getMessage(),
        ]);

        $this->webhookEvent->update([
            'error' => $exception->getMessage(),
        ]);
    }
}
