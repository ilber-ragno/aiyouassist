<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\WebchatWidget;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WebchatService
{
    protected string $baseUrl;
    protected string $internalKey;

    public function __construct()
    {
        $this->baseUrl = config('services.webchat.url', 'http://webchat-service:8006');
        $this->internalKey = config('services.webchat.internal_key', '');
    }

    /**
     * Send a text message to a webchat session.
     */
    public function sendMessage(string $sessionId, string $widgetKey, string $text): array
    {
        $response = Http::timeout(15)
            ->withHeaders(['X-Internal-Key' => $this->internalKey])
            ->post("{$this->baseUrl}/api/send", [
                'session_id' => $sessionId,
                'widget_key' => $widgetKey,
                'text' => $text,
            ]);

        if (!$response->successful()) {
            throw new \Exception($response->json('error', 'Failed to send webchat message'));
        }

        return $response->json();
    }

    /**
     * Handle incoming message from webchat-service webhook.
     */
    public function handleMessageReceived(array $payload): void
    {
        $widget = WebchatWidget::withoutGlobalScope('tenant')
            ->where('widget_key', $payload['widgetKey'])
            ->first();

        if (!$widget) {
            Log::warning('Webchat widget not found for message', ['widgetKey' => $payload['widgetKey'] ?? null]);
            return;
        }

        $sessionId = $payload['sessionId'];
        $visitorName = $payload['visitorName'] ?? 'Visitante Web';

        // Find or create conversation
        $conversation = Conversation::withoutGlobalScope('tenant')->firstOrCreate(
            [
                'tenant_id' => $widget->tenant_id,
                'channel_contact_id' => $sessionId,
                'channel' => 'webchat',
            ],
            [
                'contact_name' => $visitorName,
                'contact_phone' => "web:{$sessionId}",
                'status' => Conversation::STATUS_ACTIVE,
                'metadata' => ['widget_key' => $widget->widget_key],
            ]
        );

        // Update contact info if changed
        if ($visitorName !== 'Visitante Web' && $visitorName !== $conversation->contact_name) {
            $conversation->update(['contact_name' => $visitorName]);
        }

        // Store widget_key in metadata if missing
        $metadata = $conversation->metadata ?? [];
        if (empty($metadata['widget_key'])) {
            $metadata['widget_key'] = $widget->widget_key;
            $conversation->update(['metadata' => $metadata]);
        }

        // Create message
        $message = $conversation->messages()->create([
            'tenant_id' => $widget->tenant_id,
            'direction' => Message::DIRECTION_INBOUND,
            'sender_type' => Message::SENDER_CONTACT,
            'content_type' => Message::TYPE_TEXT,
            'content' => $payload['text'] ?? '',
            'status' => Message::STATUS_DELIVERED,
            'metadata' => [
                'webchat_session_id' => $sessionId,
                'widget_key' => $widget->widget_key,
            ],
        ]);

        // Update conversation timestamp
        $conversation->update(['last_message_at' => now()]);

        // Dispatch AI processing
        if (in_array($conversation->status, [Conversation::STATUS_ACTIVE, 'active'])) {
            dispatch(new \App\Jobs\ProcessIncomingMessage($conversation, $message))
                ->onQueue('ai-processing');
        }
    }
}
