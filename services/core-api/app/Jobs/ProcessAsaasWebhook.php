<?php

namespace App\Jobs;

use App\Models\BillingEvent;
use App\Models\CreditTransaction;
use App\Models\Invoice;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\WebhookEvent;
use App\Services\CreditService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ProcessAsaasWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;

    public function __construct(
        protected WebhookEvent $webhookEvent
    ) {}

    public function handle(): void
    {
        $payload = $this->webhookEvent->payload;
        $event = $this->webhookEvent->event_type;
        $payment = $payload['payment'] ?? [];
        $paymentId = $payment['id'] ?? null;
        $subscriptionExternalId = $payment['subscription'] ?? null;

        Log::info('Processing Asaas webhook', [
            'event' => $event,
            'payment_id' => $paymentId,
        ]);

        $externalReference = $payment['externalReference'] ?? null;

        // Check if this is a credit package purchase (not a subscription payment)
        if ($externalReference && str_starts_with($externalReference, 'credit_')) {
            $this->handleCreditPayment($event, $payment, $externalReference);

            $this->webhookEvent->update([
                'processed' => true,
                'processed_at' => now(),
            ]);
            return;
        }

        // Find the subscription by external_id
        $subscription = $subscriptionExternalId
            ? Subscription::withoutGlobalScope('tenant')
                ->where('external_id', $subscriptionExternalId)
                ->where('payment_provider', 'asaas')
                ->first()
            : null;

        if (!$subscription && $paymentId) {
            // Try to find by invoice external_id
            $invoice = Invoice::withoutGlobalScope('tenant')
                ->where('external_id', $paymentId)
                ->first();
            $subscription = $invoice?->subscription;
        }

        $tenant = $subscription?->tenant;

        // Log billing event
        if ($tenant) {
            BillingEvent::withoutGlobalScope('tenant')->create([
                'tenant_id' => $tenant->id,
                'event_type' => $event,
                'provider' => 'asaas',
                'external_id' => $paymentId,
                'payload' => $payload,
                'processed_at' => now(),
                'idempotency_key' => $this->webhookEvent->idempotency_key,
            ]);
        }

        match ($event) {
            'PAYMENT_CREATED' => $this->handlePaymentCreated($subscription, $payment),
            'PAYMENT_CONFIRMED' => $this->handlePaymentConfirmed($subscription, $payment),
            'PAYMENT_RECEIVED' => $this->handlePaymentReceived($subscription, $tenant, $payment),
            'PAYMENT_OVERDUE' => $this->handlePaymentOverdue($subscription, $tenant, $payment),
            'PAYMENT_DELETED' => $this->handlePaymentDeleted($subscription, $payment),
            'PAYMENT_REFUNDED' => $this->handlePaymentRefunded($subscription, $payment),
            'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' => $this->handleCaptureRefused($subscription, $payment),
            default => Log::info("Asaas: Unhandled event type: {$event}"),
        };

        // Mark webhook as processed
        $this->webhookEvent->update([
            'processed' => true,
            'processed_at' => now(),
        ]);
    }

    private function handlePaymentCreated(?Subscription $subscription, array $payment): void
    {
        if (!$subscription) {
            return;
        }

        Invoice::withoutGlobalScope('tenant')->updateOrCreate(
            ['external_id' => $payment['id']],
            [
                'tenant_id' => $subscription->tenant_id,
                'subscription_id' => $subscription->id,
                'status' => Invoice::STATUS_PENDING,
                'amount' => $payment['value'] ?? 0,
                'currency' => 'BRL',
                'due_date' => $payment['dueDate'] ?? null,
                'invoice_url' => $payment['invoiceUrl'] ?? $payment['bankSlipUrl'] ?? null,
            ]
        );
    }

    private function handlePaymentConfirmed(?Subscription $subscription, array $payment): void
    {
        if (!$subscription) {
            return;
        }

        $invoice = Invoice::withoutGlobalScope('tenant')
            ->where('external_id', $payment['id'])
            ->first();

        if ($invoice) {
            $invoice->update([
                'status' => Invoice::STATUS_PAID,
                'paid_at' => now(),
            ]);
        }
    }

    private function handlePaymentReceived(?Subscription $subscription, ?Tenant $tenant, array $payment): void
    {
        if (!$subscription) {
            return;
        }

        // Update invoice
        $invoice = Invoice::withoutGlobalScope('tenant')
            ->where('external_id', $payment['id'])
            ->first();

        if ($invoice) {
            $invoice->update([
                'status' => Invoice::STATUS_PAID,
                'paid_at' => $payment['paymentDate'] ?? now(),
            ]);
        }

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
    }

    private function handlePaymentOverdue(?Subscription $subscription, ?Tenant $tenant, array $payment): void
    {
        if (!$subscription) {
            return;
        }

        // Update invoice
        $invoice = Invoice::withoutGlobalScope('tenant')
            ->where('external_id', $payment['id'])
            ->first();

        if ($invoice) {
            $invoice->update(['status' => Invoice::STATUS_FAILED]);
        }

        // Mark subscription as past_due
        $subscription->update(['status' => Subscription::STATUS_PAST_DUE]);

        // Block tenant after overdue (configurable days, default 7)
        if ($tenant) {
            $overdueBlockDays = (int) config('services.asaas.overdue_block_days', 7);
            $dueDate = $invoice?->due_date;

            if ($dueDate && $dueDate->diffInDays(now()) >= $overdueBlockDays) {
                $tenant->update([
                    'is_blocked' => true,
                    'blocked_reason' => 'Pagamento em atraso',
                    'blocked_at' => now(),
                ]);
            }
        }
    }

    private function handlePaymentDeleted(?Subscription $subscription, array $payment): void
    {
        $invoice = Invoice::withoutGlobalScope('tenant')
            ->where('external_id', $payment['id'])
            ->first();

        $invoice?->update(['status' => Invoice::STATUS_CANCELLED]);
    }

    private function handlePaymentRefunded(?Subscription $subscription, array $payment): void
    {
        $invoice = Invoice::withoutGlobalScope('tenant')
            ->where('external_id', $payment['id'])
            ->first();

        $invoice?->update(['status' => Invoice::STATUS_REFUNDED]);
    }

    private function handleCaptureRefused(?Subscription $subscription, array $payment): void
    {
        Log::warning('Asaas: Credit card capture refused', [
            'payment_id' => $payment['id'] ?? null,
            'subscription_id' => $subscription?->id,
        ]);
    }

    private function handleCreditPayment(string $event, array $payment, string $externalReference): void
    {
        // Extract the CreditTransaction ID from "credit_{uuid}"
        $transactionId = str_replace('credit_', '', $externalReference);

        $transaction = CreditTransaction::find($transactionId);

        if (!$transaction) {
            Log::warning('Asaas credit webhook: transaction not found', [
                'external_reference' => $externalReference,
                'transaction_id' => $transactionId,
                'event' => $event,
            ]);
            return;
        }

        $tenant = Tenant::find($transaction->tenant_id);
        if (!$tenant) {
            Log::warning('Asaas credit webhook: tenant not found', [
                'tenant_id' => $transaction->tenant_id,
                'transaction_id' => $transactionId,
            ]);
            return;
        }

        // Log billing event
        BillingEvent::withoutGlobalScope('tenant')->create([
            'tenant_id' => $tenant->id,
            'event_type' => $event,
            'provider' => 'asaas',
            'external_id' => $payment['id'] ?? null,
            'payload' => ['payment' => $payment],
            'processed_at' => now(),
            'idempotency_key' => $this->webhookEvent->idempotency_key,
        ]);

        $metadata = $transaction->metadata ?? [];

        match ($event) {
            'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED' => $this->creditPaymentConfirmed($transaction, $tenant, $metadata, $payment),
            'PAYMENT_OVERDUE' => $this->creditPaymentFailed($transaction, 'overdue', $metadata),
            'PAYMENT_DELETED' => $this->creditPaymentFailed($transaction, 'deleted', $metadata),
            'PAYMENT_REFUNDED' => $this->creditPaymentRefunded($transaction, $tenant, $metadata),
            default => Log::info("Asaas credit: unhandled event {$event}", ['transaction_id' => $transactionId]),
        };
    }

    private function creditPaymentConfirmed(CreditTransaction $transaction, Tenant $tenant, array $metadata, array $payment): void
    {
        // Prevent double-crediting
        if (($metadata['status'] ?? '') === 'completed') {
            Log::info('Asaas credit: already completed, skipping', ['transaction_id' => $transaction->id]);
            return;
        }

        $creditAmount = (float) ($metadata['credit_amount'] ?? 0);

        if ($creditAmount <= 0) {
            Log::error('Asaas credit: credit_amount is zero or missing', [
                'transaction_id' => $transaction->id,
                'metadata' => $metadata,
            ]);
            return;
        }

        // Add credits via CreditService
        $creditService = app(CreditService::class);
        $creditService->addCredits(
            $tenant,
            $creditAmount,
            'purchase',
            "Compra de créditos: " . ($metadata['package_name'] ?? 'Pacote'),
            'credit_package',
            $transaction->reference_id,
            [
                'original_transaction_id' => $transaction->id,
                'asaas_payment_id' => $payment['id'] ?? null,
                'package_price' => $metadata['package_price'] ?? null,
            ]
        );

        // Update the original pending transaction to mark as completed
        $transaction->update([
            'metadata' => array_merge($metadata, [
                'status' => 'completed',
                'paid_at' => now()->toIso8601String(),
                'asaas_payment_id' => $payment['id'] ?? ($metadata['asaas_payment_id'] ?? null),
            ]),
        ]);

        Log::info('Asaas credit: payment confirmed and credits added', [
            'transaction_id' => $transaction->id,
            'tenant_id' => $tenant->id,
            'credit_amount' => $creditAmount,
        ]);
    }

    private function creditPaymentFailed(CreditTransaction $transaction, string $reason, array $metadata): void
    {
        $transaction->update([
            'metadata' => array_merge($metadata, [
                'status' => 'failed',
                'failure_reason' => $reason,
                'failed_at' => now()->toIso8601String(),
            ]),
            'description' => "Compra cancelada: " . ($metadata['package_name'] ?? 'Pacote') . " ({$reason})",
        ]);

        Log::info("Asaas credit: payment {$reason}", ['transaction_id' => $transaction->id]);
    }

    private function creditPaymentRefunded(CreditTransaction $transaction, Tenant $tenant, array $metadata): void
    {
        $creditAmount = (float) ($metadata['credit_amount'] ?? 0);

        // Only reverse if it was previously completed
        if (($metadata['status'] ?? '') === 'completed' && $creditAmount > 0) {
            $creditService = app(CreditService::class);
            $creditService->addCredits(
                $tenant,
                -$creditAmount,
                'refund',
                "Reembolso: " . ($metadata['package_name'] ?? 'Pacote'),
                'credit_package',
                $transaction->reference_id,
                ['original_transaction_id' => $transaction->id]
            );
        }

        $transaction->update([
            'metadata' => array_merge($metadata, [
                'status' => 'refunded',
                'refunded_at' => now()->toIso8601String(),
            ]),
            'description' => "Reembolso: " . ($metadata['package_name'] ?? 'Pacote'),
        ]);

        Log::info('Asaas credit: payment refunded', ['transaction_id' => $transaction->id]);
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('ProcessAsaasWebhook job failed', [
            'webhook_event_id' => $this->webhookEvent->id,
            'error' => $exception->getMessage(),
        ]);

        $this->webhookEvent->update([
            'error' => $exception->getMessage(),
        ]);
    }
}
