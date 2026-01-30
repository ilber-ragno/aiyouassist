<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WebhookManagementController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $endpoints = WebhookEndpoint::orderBy('created_at', 'desc')->get();

        return response()->json(['endpoints' => $endpoints]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => 'required|url|max:2048',
            'description' => 'nullable|string|max:500',
            'events' => 'required|array|min:1',
            'events.*' => 'string',
            'retry_policy' => 'nullable|array',
        ]);

        $endpoint = WebhookEndpoint::create([
            'tenant_id' => $request->user()->tenant_id,
            'url' => $validated['url'],
            'description' => $validated['description'] ?? null,
            'events' => $validated['events'],
            'secret_encrypted' => encrypt(Str::random(32)),
            'retry_policy' => $validated['retry_policy'] ?? ['max_retries' => 3, 'retry_delay_seconds' => 60],
        ]);

        $this->logService->audit('webhook.endpoint_created', [
            'endpoint_id' => $endpoint->id,
            'url' => $endpoint->url,
        ]);

        return response()->json([
            'endpoint' => $endpoint,
            'secret' => decrypt($endpoint->secret_encrypted),
        ], 201);
    }

    public function show(WebhookEndpoint $endpoint): JsonResponse
    {
        return response()->json([
            'endpoint' => $endpoint,
            'recent_deliveries' => $endpoint->deliveries()
                ->orderBy('created_at', 'desc')
                ->limit(10)
                ->get(),
        ]);
    }

    public function update(Request $request, WebhookEndpoint $endpoint): JsonResponse
    {
        $validated = $request->validate([
            'url' => 'sometimes|url|max:2048',
            'description' => 'nullable|string|max:500',
            'events' => 'sometimes|array|min:1',
            'events.*' => 'string',
            'is_active' => 'sometimes|boolean',
            'retry_policy' => 'nullable|array',
        ]);

        $endpoint->update($validated);

        $this->logService->audit('webhook.endpoint_updated', [
            'endpoint_id' => $endpoint->id,
        ]);

        return response()->json(['endpoint' => $endpoint]);
    }

    public function destroy(WebhookEndpoint $endpoint): JsonResponse
    {
        $this->logService->audit('webhook.endpoint_deleted', [
            'endpoint_id' => $endpoint->id,
            'url' => $endpoint->url,
        ]);

        $endpoint->delete();

        return response()->json(['message' => 'Webhook endpoint deleted']);
    }

    public function test(WebhookEndpoint $endpoint): JsonResponse
    {
        // Send a test webhook delivery
        $delivery = WebhookDelivery::create([
            'tenant_id' => $endpoint->tenant_id,
            'webhook_endpoint_id' => $endpoint->id,
            'event_type' => 'test.ping',
            'payload' => ['test' => true, 'timestamp' => now()->toIso8601String()],
            'status' => 'pending',
        ]);

        // TODO: Actually send the HTTP request to the endpoint URL
        $delivery->update([
            'status' => 'sent',
            'response_status' => 200,
            'duration_ms' => 0,
        ]);

        $this->logService->webhook('webhook.test', [
            'endpoint_id' => $endpoint->id,
            'delivery_id' => $delivery->id,
        ]);

        return response()->json([
            'success' => true,
            'delivery' => $delivery,
        ]);
    }

    public function replay(WebhookEndpoint $endpoint, string $delivery): JsonResponse
    {
        $original = WebhookDelivery::where('id', $delivery)
            ->where('webhook_endpoint_id', $endpoint->id)
            ->firstOrFail();

        $replay = WebhookDelivery::create([
            'tenant_id' => $endpoint->tenant_id,
            'webhook_endpoint_id' => $endpoint->id,
            'event_type' => $original->event_type,
            'payload' => $original->payload,
            'status' => 'pending',
        ]);

        $this->logService->webhook('webhook.replay', [
            'endpoint_id' => $endpoint->id,
            'original_delivery_id' => $delivery,
            'replay_delivery_id' => $replay->id,
        ]);

        return response()->json([
            'message' => 'Delivery replayed',
            'delivery' => $replay,
        ]);
    }

    public function deliveries(WebhookEndpoint $endpoint): JsonResponse
    {
        $deliveries = $endpoint->deliveries()
            ->orderBy('created_at', 'desc')
            ->paginate(request()->input('per_page', 20));

        return response()->json(['deliveries' => $deliveries]);
    }

    /**
     * Return system webhook URLs that external services should call
     */
    public function systemUrls(): JsonResponse
    {
        $baseUrl = rtrim(config('app.url', 'https://meuaiyou.cloud'), '/');

        return response()->json([
            'urls' => [
                [
                    'name' => 'Asaas (Pagamentos)',
                    'url' => "{$baseUrl}/api/webhooks/asaas",
                    'description' => 'URL para configurar no painel do Asaas em Integrações > Webhooks',
                    'events' => ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED'],
                ],
                [
                    'name' => 'WhatsApp Service',
                    'url' => "{$baseUrl}/api/webhooks/whatsapp-service",
                    'description' => 'URL interna do serviço WhatsApp (MoltBot/ClaudBot)',
                    'events' => ['message.received', 'session.status', 'qr.updated'],
                ],
                [
                    'name' => 'Stripe (Pagamentos)',
                    'url' => "{$baseUrl}/api/webhooks/stripe",
                    'description' => 'URL para configurar no dashboard do Stripe em Developers > Webhooks',
                    'events' => ['invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted'],
                ],
                [
                    'name' => 'ClaudBot (IA)',
                    'url' => "{$baseUrl}/api/webhooks/claudbot",
                    'description' => 'Webhook interno para respostas do orquestrador de IA',
                    'events' => ['ai.response', 'ai.escalation'],
                ],
            ],
        ]);
    }
}
