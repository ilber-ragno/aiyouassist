<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\WhatsappSession;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Service para integração com ClaudBot/Moltbot
 * Gerencia sessões WhatsApp via Baileys
 */
class ClaudBotService
{
    protected string $baseUrl;
    protected string $apiToken;

    public function __construct()
    {
        $this->baseUrl = config('services.claudbot.url', 'http://localhost:19000');
        $this->apiToken = config('services.claudbot.token', '');
    }

    /**
     * Request QR code for session
     */
    public function requestQrCode(WhatsappSession $session): array
    {
        $response = $this->request('POST', '/api/sessions', [
            'session_id' => $session->id,
            'tenant_id' => $session->tenant_id,
            'session_name' => $session->session_name,
            'webhook_url' => config('app.url') . '/api/webhooks/claudbot',
        ]);

        return [
            'qr_code' => $response['qr_code'] ?? null,
            'expires_in' => $response['expires_in'] ?? 60,
        ];
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
     * Send message via WhatsApp
     */
    public function sendMessage(WhatsappSession $session, string $to, string $content, string $type = 'text'): array
    {
        $payload = [
            'session_id' => $session->id,
            'to' => $to,
            'type' => $type,
            'content' => $content,
        ];

        return $this->request('POST', '/api/messages/send', $payload);
    }

    /**
     * Send media message
     */
    public function sendMedia(WhatsappSession $session, string $to, string $mediaUrl, string $type, ?string $caption = null): array
    {
        $payload = [
            'session_id' => $session->id,
            'to' => $to,
            'type' => $type,
            'media_url' => $mediaUrl,
            'caption' => $caption,
        ];

        return $this->request('POST', '/api/messages/send', $payload);
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

    protected function handleMessageReceived(array $payload): void
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
        $conversation->messages()->create([
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

        // TODO: Dispatch job to process message with AI
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
