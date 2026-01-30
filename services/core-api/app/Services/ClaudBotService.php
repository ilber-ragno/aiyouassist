<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\WhatsappSession;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Service para integração com ClawdBot Gateway
 * Gerencia sessões WhatsApp
 */
class ClaudBotService
{
    protected string $baseUrl;
    protected string $apiToken = '';

    public function __construct()
    {
        $this->baseUrl = config('services.claudbot.url', 'http://localhost:19000');
        $this->apiToken = config('services.claudbot.token') ?? '';
    }

    /**
     * Request QR code for session via moltbot gateway
     *
     * Flow:
     * 1. Ensure session exists in connector's store
     * 2. Trigger WhatsApp channel login via moltbot (Baileys QR)
     * 3. QR code arrives asynchronously via gateway events
     * 4. Frontend polls /status to get the QR when it arrives
     */
    public function requestQrCode(WhatsappSession $session): array
    {
        // Ensure session record exists in the connector
        try {
            $this->request('POST', '/api/sessions', [
                'session_id' => $session->id,
                'tenant_id' => $session->tenant_id,
                'session_name' => $session->session_name,
            ]);
        } catch (\Exception $e) {
            // Session may already exist - that's fine
            Log::info('Session create (may already exist)', ['error' => $e->getMessage()]);
        }

        // Request QR code from moltbot gateway via connector
        $response = $this->request('POST', "/api/sessions/{$session->id}/qr");

        return [
            'qr_code' => $response['qr_code'] ?? null,
            'expires_in' => $response['expires_in'] ?? 60,
        ];
    }

    /**
     * Trigger WhatsApp channel login directly (admin use)
     * With Baileys direct, requires session_id.
     */
    public function channelLogin(string $sessionId): array
    {
        return $this->request('POST', '/api/channels/login', [
            'session_id' => $sessionId,
        ]);
    }

    /**
     * Logout from WhatsApp channel
     */
    public function channelLogout(string $sessionId): array
    {
        return $this->request('POST', '/api/channels/logout', [
            'session_id' => $sessionId,
        ]);
    }

    /**
     * Get full gateway diagnostics
     */
    public function getGatewayInfo(): array
    {
        return $this->request('GET', '/api/gateway/info');
    }

    /**
     * List gateway sessions
     */
    public function getGatewaySessions(): array
    {
        return $this->request('GET', '/api/gateway/sessions');
    }

    /**
     * Get gateway config
     */
    public function getGatewayConfig(): array
    {
        return $this->request('GET', '/api/config');
    }

    /**
     * Update gateway config
     */
    public function updateGatewayConfig(array $config): array
    {
        return $this->request('POST', '/api/config/patch', $config);
    }

    /**
     * Disconnect session
     */
    public function disconnect(WhatsappSession $session): void
    {
        $this->request('DELETE', "/api/sessions/{$session->id}");
    }

    /**
     * Refresh session status from ClaudBot
     */
    public function refreshSessionStatus(WhatsappSession $session): void
    {
        try {
            $response = $this->request('GET', "/api/sessions/{$session->id}");

            if (isset($response['status'])) {
                $status = $this->mapClaudBotStatus($response['status']);

                if ($status === WhatsappSession::STATUS_CONNECTED && isset($response['phone_number'])) {
                    $session->markConnected($response['phone_number']);
                } elseif ($status !== $session->status) {
                    $session->update([
                        'status' => $status,
                        'last_error' => $response['error'] ?? null,
                    ]);
                }

                // Update QR if available
                if (isset($response['qr_code']) && $status === WhatsappSession::STATUS_WAITING_QR) {
                    $session->setQrCode($response['qr_code']);
                }
            }
        } catch (\Exception $e) {
            Log::warning('Failed to refresh ClaudBot session status', [
                'session_id' => $session->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Send message via WhatsApp (through moltbot gateway)
     */
    public function sendMessage(WhatsappSession $session, string $to, string $content, string $type = 'text'): array
    {
        return $this->request('POST', '/api/send', [
            'to' => $to,
            'message' => $content,
            'type' => $type,
            'channel' => 'whatsapp',
            'session_id' => $session->id,
        ]);
    }

    /**
     * Send media message
     */
    public function sendMedia(WhatsappSession $session, string $to, string $mediaUrl, string $type, ?string $caption = null): array
    {
        return $this->request('POST', '/api/send', [
            'to' => $to,
            'message' => $caption ?? '',
            'type' => $type,
            'media_url' => $mediaUrl,
            'channel' => 'whatsapp',
            'session_id' => $session->id,
        ]);
    }

    /**
     * Process incoming webhook from ClaudBot
     */
    public function processWebhook(array $payload): void
    {
        $eventType = $payload['event'] ?? null;

        match ($eventType) {
            'session.connected' => $this->handleSessionConnected($payload),
            'session.disconnected' => $this->handleSessionDisconnected($payload),
            'session.qr_updated' => $this->handleQrUpdated($payload),
            'message.received' => $this->handleMessageReceived($payload),
            'message.sent' => $this->handleMessageSent($payload),
            'message.delivered' => $this->handleMessageDelivered($payload),
            'message.read' => $this->handleMessageRead($payload),
            default => Log::info('Unknown ClaudBot webhook event', $payload),
        };
    }

    protected function handleSessionConnected(array $payload): void
    {
        $session = WhatsappSession::find($payload['session_id']);
        if ($session) {
            $session->markConnected($payload['phone_number'] ?? '');
        }
    }

    protected function handleSessionDisconnected(array $payload): void
    {
        $session = WhatsappSession::find($payload['session_id']);
        if ($session) {
            $session->markDisconnected($payload['reason'] ?? null);
        }
    }

    protected function handleQrUpdated(array $payload): void
    {
        $session = WhatsappSession::find($payload['session_id']);
        if ($session && isset($payload['qr_code'])) {
            $session->setQrCode($payload['qr_code']);
        }
    }

    public function handleMessageReceived(array $payload): void
    {
        $session = WhatsappSession::find($payload['session_id']);
        if (!$session) {
            return;
        }

        // Find or create conversation
        $conversation = Conversation::firstOrCreate(
            [
                'tenant_id' => $session->tenant_id,
                'whatsapp_session_id' => $session->id,
                'contact_phone' => $payload['from'],
            ],
            [
                'contact_name' => $payload['push_name'] ?? null,
                'contact_profile_pic' => $payload['profile_pic'] ?? null,
                'status' => Conversation::STATUS_ACTIVE,
            ]
        );

        // Update contact info if available
        if (isset($payload['push_name']) && $payload['push_name'] !== $conversation->contact_name) {
            $conversation->update(['contact_name' => $payload['push_name']]);
        }

        // Create message
        $message = $conversation->messages()->create([
            'tenant_id' => $session->tenant_id,
            'direction' => Message::DIRECTION_INBOUND,
            'sender_type' => Message::SENDER_CONTACT,
            'content_type' => $this->mapMessageType($payload['type'] ?? 'text'),
            'content' => $payload['content'] ?? $payload['body'] ?? '',
            'media_url' => $payload['media_url'] ?? null,
            'whatsapp_message_id' => $payload['message_id'] ?? null,
            'status' => Message::STATUS_DELIVERED,
            'metadata' => [
                'raw' => $payload,
            ],
        ]);

        // Update conversation timestamp
        $conversation->update(['last_message_at' => now()]);

        // Dispatch job to process message with AI (only if conversation is active / with AI)
        if (in_array($conversation->status, [Conversation::STATUS_ACTIVE, 'active'])) {
            dispatch(new \App\Jobs\ProcessIncomingMessage($conversation, $message))
                ->onQueue('ai-processing');
        }
    }

    protected function handleMessageSent(array $payload): void
    {
        if (!isset($payload['message_id'])) {
            return;
        }

        Message::where('whatsapp_message_id', $payload['message_id'])
            ->update(['status' => Message::STATUS_SENT]);
    }

    protected function handleMessageDelivered(array $payload): void
    {
        if (!isset($payload['message_id'])) {
            return;
        }

        Message::where('whatsapp_message_id', $payload['message_id'])
            ->update(['status' => Message::STATUS_DELIVERED]);
    }

    protected function handleMessageRead(array $payload): void
    {
        if (!isset($payload['message_id'])) {
            return;
        }

        Message::where('whatsapp_message_id', $payload['message_id'])
            ->update(['status' => Message::STATUS_READ]);
    }

    protected function request(string $method, string $endpoint, array $data = []): array
    {
        $response = Http::baseUrl($this->baseUrl)
            ->withToken($this->apiToken)
            ->timeout(30)
            ->$method($endpoint, $data);

        if (!$response->successful()) {
            throw new \Exception(
                "ClaudBot API error: " . ($response->json('error') ?? $response->status())
            );
        }

        return $response->json() ?? [];
    }

    protected function mapClaudBotStatus(string $status): string
    {
        return match ($status) {
            'connected', 'open' => WhatsappSession::STATUS_CONNECTED,
            'qr', 'waiting_qr' => WhatsappSession::STATUS_WAITING_QR,
            'reconnecting' => WhatsappSession::STATUS_RECONNECTING,
            'banned' => WhatsappSession::STATUS_BANNED,
            'error' => WhatsappSession::STATUS_ERROR,
            default => WhatsappSession::STATUS_DISCONNECTED,
        };
    }

    protected function mapMessageType(string $type): string
    {
        return match ($type) {
            'image', 'imageMessage' => Message::TYPE_IMAGE,
            'audio', 'audioMessage' => Message::TYPE_AUDIO,
            'video', 'videoMessage' => Message::TYPE_VIDEO,
            'document', 'documentMessage' => Message::TYPE_DOCUMENT,
            'sticker', 'stickerMessage' => Message::TYPE_STICKER,
            'location', 'locationMessage' => Message::TYPE_LOCATION,
            default => Message::TYPE_TEXT,
        };
    }
}
