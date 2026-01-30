<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsappSession;
use App\Services\ClaudBotService;
use App\Services\ExecutionLogService;
use App\Services\TelegramService;
use App\Services\WebchatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

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
            $this->logService->webhook('Webhook ClaudBot: assinatura inválida', [
                'ip' => $request->ip(),
            ], 'warning');
            return response()->json(['error' => 'Invalid signature'], 401);
        }

        try {
            $claudBot->processWebhook($request->all());

            $this->logService->webhook('Webhook ClaudBot processado', [
                'event' => $request->input('event', 'unknown'),
            ]);

            return response()->json(['status' => 'processed']);
        } catch (\Exception $e) {
            Log::error('ClaudBot webhook processing error', [
                'error' => $e->getMessage(),
                'payload' => $request->all(),
            ]);
            $this->logService->webhook('Erro ao processar webhook ClaudBot', [
                'error' => $e->getMessage(),
            ], 'error');

            return response()->json(['error' => 'Processing failed'], 500);
        }
    }

    /**
     * Handle internal webhooks from whatsapp-service
     * (service-to-service, verified by internal key)
     */
    public function whatsappService(Request $request): JsonResponse
    {
        // Verify internal key
        $internalKey = $request->header('X-Internal-Key');
        $expectedKey = config('services.claudbot.internal_key', '');

        if ($expectedKey && !hash_equals($expectedKey, $internalKey ?? '')) {
            Log::warning('Invalid whatsapp-service internal key');
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $event = $request->input('event');
        $sessionId = $request->input('session_id');

        if (!$sessionId) {
            return response()->json(['error' => 'Missing session_id'], 400);
        }

        // Find session without tenant scope (internal service call)
        $session = WhatsappSession::withoutGlobalScope('tenant')->find($sessionId);

        if (!$session) {
            Log::warning('WhatsApp session not found for webhook', ['session_id' => $sessionId]);
            return response()->json(['error' => 'Session not found'], 404);
        }

        $tenantId = $session->tenant_id;

        try {
            switch ($event) {
                case 'session.qr_updated':
                    $qrCode = $request->input('qr_code');
                    if ($qrCode) {
                        $session->setQrCode($qrCode, 60);
                        Log::info('QR code updated via whatsapp-service webhook', ['session_id' => $sessionId]);
                        $this->logService->message('QR Code atualizado', [
                            'session_id' => $sessionId,
                            'session_name' => $session->name ?? $sessionId,
                        ], 'info', $tenantId);
                    }
                    break;

                case 'session.connected':
                    $phoneNumber = $request->input('phone_number', '');
                    $session->markConnected($phoneNumber);
                    Log::info('Session connected via whatsapp-service webhook', ['session_id' => $sessionId]);
                    $this->logService->message('Sessão WhatsApp conectada', [
                        'session_id' => $sessionId,
                        'session_name' => $session->name ?? $sessionId,
                        'phone_number' => $phoneNumber,
                    ], 'info', $tenantId);
                    break;

                case 'session.disconnected':
                    $reason = $request->input('reason');
                    $session->markDisconnected($reason);
                    Log::info('Session disconnected via whatsapp-service webhook', ['session_id' => $sessionId]);
                    $this->logService->message('Sessão WhatsApp desconectada', [
                        'session_id' => $sessionId,
                        'session_name' => $session->name ?? $sessionId,
                        'reason' => $reason,
                    ], 'warning', $tenantId);
                    break;

                case 'message.received':
                    $claudBot = app(ClaudBotService::class);
                    $claudBot->handleMessageReceived(array_merge(
                        $request->all(),
                        ['session_id' => $session->id, 'tenant_id' => $session->tenant_id]
                    ));
                    Log::info('Message received via whatsapp-service webhook', [
                        'session_id' => $sessionId,
                        'from' => $request->input('from'),
                    ]);
                    $this->logService->message('Mensagem recebida via WhatsApp', [
                        'session_id' => $sessionId,
                        'from' => $request->input('from'),
                        'content_preview' => mb_substr($request->input('body', ''), 0, 80),
                    ], 'info', $tenantId);
                    break;

                default:
                    Log::info('Unknown whatsapp-service event', ['event' => $event, 'session_id' => $sessionId]);
                    $this->logService->webhook("Evento WhatsApp desconhecido: {$event}", [
                        'session_id' => $sessionId,
                    ], 'warning', $tenantId);
            }

            return response()->json(['status' => 'processed']);
        } catch (\Exception $e) {
            Log::error('WhatsApp service webhook error', [
                'error' => $e->getMessage(),
                'event' => $event,
                'session_id' => $sessionId,
            ]);
            $this->logService->message('Erro ao processar evento WhatsApp', [
                'event' => $event,
                'session_id' => $sessionId,
                'error' => $e->getMessage(),
            ], 'error', $tenantId);

            return response()->json(['error' => 'Processing failed'], 500);
        }
    }

    /**
     * Handle internal webhooks from telegram-service
     */
    public function telegramService(Request $request): JsonResponse
    {
        // Verify internal key
        $internalKey = $request->header('X-Internal-Key');
        $expectedKey = config('services.telegram.internal_key', config('services.claudbot.internal_key', ''));

        if ($expectedKey && !hash_equals($expectedKey, $internalKey ?? '')) {
            Log::warning('Invalid telegram-service internal key');
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $event = $request->input('event');

        try {
            switch ($event) {
                case 'message.received':
                    $telegramSvc = app(TelegramService::class);
                    $telegramSvc->handleMessageReceived($request->all());
                    Log::info('Telegram message received', [
                        'botId' => $request->input('botId'),
                        'chatId' => $request->input('chatId'),
                    ]);
                    break;

                case 'bot.connected':
                    $bot = \App\Models\TelegramBot::withoutGlobalScope('tenant')
                        ->find($request->input('botId'));
                    if ($bot) {
                        $bot->markConnected();
                        $this->logService->message('Bot Telegram conectado', [
                            'bot_id' => $bot->id,
                            'username' => $bot->bot_username,
                        ], 'info', $bot->tenant_id);
                    }
                    break;

                case 'bot.disconnected':
                    $bot = \App\Models\TelegramBot::withoutGlobalScope('tenant')
                        ->find($request->input('botId'));
                    if ($bot) {
                        $bot->markDisconnected();
                        $this->logService->message('Bot Telegram desconectado', [
                            'bot_id' => $bot->id,
                            'username' => $bot->bot_username,
                        ], 'warning', $bot->tenant_id);
                    }
                    break;

                case 'bot.error':
                    $bot = \App\Models\TelegramBot::withoutGlobalScope('tenant')
                        ->find($request->input('botId'));
                    if ($bot) {
                        $bot->markError($request->input('error', 'Unknown error'));
                        $this->logService->message('Erro no bot Telegram', [
                            'bot_id' => $bot->id,
                            'error' => $request->input('error'),
                        ], 'error', $bot->tenant_id);
                    }
                    break;

                default:
                    Log::info('Unknown telegram-service event', ['event' => $event]);
            }

            return response()->json(['status' => 'processed']);
        } catch (\Exception $e) {
            Log::error('Telegram service webhook error', [
                'error' => $e->getMessage(),
                'event' => $event,
            ]);
            return response()->json(['error' => 'Processing failed'], 500);
        }
    }

    /**
     * Handle internal webhooks from webchat-service
     */
    public function webchatService(Request $request): JsonResponse
    {
        // Verify internal key
        $internalKey = $request->header('X-Internal-Key');
        $expectedKey = config('services.webchat.internal_key', config('services.claudbot.internal_key', ''));

        if ($expectedKey && !hash_equals($expectedKey, $internalKey ?? '')) {
            Log::warning('Invalid webchat-service internal key');
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $event = $request->input('event');

        try {
            switch ($event) {
                case 'message.received':
                    $webchatSvc = app(WebchatService::class);
                    $webchatSvc->handleMessageReceived($request->all());
                    Log::info('Webchat message received', [
                        'widgetKey' => $request->input('widgetKey'),
                        'sessionId' => $request->input('sessionId'),
                    ]);
                    break;

                default:
                    Log::info('Unknown webchat-service event', ['event' => $event]);
            }

            return response()->json(['status' => 'processed']);
        } catch (\Exception $e) {
            Log::error('Webchat service webhook error', [
                'error' => $e->getMessage(),
                'event' => $event,
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
            $this->logService->webhook('Webhook Stripe: assinatura inválida', [
                'error' => $e->getMessage(),
            ], 'warning');
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

        $this->logService->webhook("Webhook Stripe recebido: {$event->type}", [
            'event_id' => $event->id,
            'event_type' => $event->type,
            'webhook_event_id' => $webhookEvent->id,
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
            $this->logService->webhook('Webhook Asaas: token inválido', [
                'ip' => $request->ip(),
            ], 'warning');
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

        $this->logService->webhook("Webhook Asaas recebido: {$event}", [
            'event_type' => $event,
            'payment_id' => $paymentId,
            'webhook_event_id' => $webhookEvent->id,
            'external_reference' => $payload['payment']['externalReference'] ?? null,
        ]);

        // Dispatch job to process
        dispatch(new \App\Jobs\ProcessAsaasWebhook($webhookEvent));

        return response()->json(['status' => 'queued']);
    }
}
