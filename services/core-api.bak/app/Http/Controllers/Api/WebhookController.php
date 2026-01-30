<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ClaudBotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    /**
     * Handle ClaudBot webhooks
     */
    public function claudbot(Request $request, ClaudBotService $claudBot): JsonResponse
    {
        // Verify signature
        $signature = $request->header('X-ClaudBot-Signature');
        $expectedSignature = hash_hmac('sha256', $request->getContent(), config('services.claudbot.webhook_secret'));

        if (!hash_equals($expectedSignature, $signature ?? '')) {
            Log::warning('Invalid ClaudBot webhook signature');
            return response()->json(['error' => 'Invalid signature'], 401);
        }

        try {
            $claudBot->processWebhook($request->all());

            return response()->json(['status' => 'processed']);
        } catch (\Exception $e) {
            Log::error('ClaudBot webhook processing error', [
                'error' => $e->getMessage(),
                'payload' => $request->all(),
            ]);

            return response()->json(['error' => 'Processing failed'], 500);
        }
    }

    /**
     * Handle Stripe webhooks
     */
    public function stripe(Request $request): JsonResponse
    {
        $payload = $request->getContent();
        $signature = $request->header('Stripe-Signature');

        try {
            $event = \Stripe\Webhook::constructEvent(
                $payload,
                $signature,
                config('services.stripe.webhook_secret')
            );
        } catch (\Exception $e) {
            Log::warning('Invalid Stripe webhook signature', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'Invalid signature'], 401);
        }

        // Check idempotency
        $idempotencyKey = "stripe_{$event->id}";
        if (\App\Models\WebhookEvent::where('idempotency_key', $idempotencyKey)->exists()) {
            return response()->json(['status' => 'already_processed']);
        }

        // Store webhook event
        $webhookEvent = \App\Models\WebhookEvent::create([
            'provider' => 'stripe',
            'event_type' => $event->type,
            'external_id' => $event->id,
            'payload' => $event->data->object,
            'signature' => $signature,
            'signature_valid' => true,
            'idempotency_key' => $idempotencyKey,
        ]);

        // Dispatch job to process
        dispatch(new \App\Jobs\ProcessStripeWebhook($webhookEvent));

        return response()->json(['status' => 'queued']);
    }

    /**
     * Handle Asaas webhooks
     */
    public function asaas(Request $request): JsonResponse
    {
        $accessToken = $request->header('asaas-access-token');

        if ($accessToken !== config('services.asaas.webhook_secret')) {
            Log::warning('Invalid Asaas webhook token');
            return response()->json(['error' => 'Invalid token'], 401);
        }

        $payload = $request->all();
        $event = $payload['event'] ?? null;
        $paymentId = $payload['payment']['id'] ?? null;

        // Check idempotency
        $idempotencyKey = "asaas_{$event}_{$paymentId}";
        if (\App\Models\WebhookEvent::where('idempotency_key', $idempotencyKey)->exists()) {
            return response()->json(['status' => 'already_processed']);
        }

        // Store webhook event
        $webhookEvent = \App\Models\WebhookEvent::create([
            'provider' => 'asaas',
            'event_type' => $event,
            'external_id' => $paymentId,
            'payload' => $payload,
            'signature_valid' => true,
            'idempotency_key' => $idempotencyKey,
        ]);

        // Dispatch job to process
        dispatch(new \App\Jobs\ProcessAsaasWebhook($webhookEvent));

        return response()->json(['status' => 'queued']);
    }
}
