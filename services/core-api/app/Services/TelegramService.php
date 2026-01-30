<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\TelegramBot;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramService
{
    protected string $baseUrl;
    protected string $internalKey;

    public function __construct()
    {
        $this->baseUrl = config('services.telegram.url', 'http://telegram-service:8005');
        $this->internalKey = config('services.telegram.internal_key', '');
    }

    /**
     * Test a bot token without saving.
     */
    public function testBotToken(string $token): array
    {
        $response = Http::timeout(10)
            ->withHeaders(['X-Internal-Key' => $this->internalKey])
            ->post("{$this->baseUrl}/api/bots/test", ['token' => $token]);

        if (!$response->successful()) {
            throw new \Exception($response->json('error', 'Invalid token'));
        }

        return $response->json();
    }

    /**
     * Register and start a bot in the telegram-service.
     */
    public function registerBot(TelegramBot $bot): array
    {
        $response = Http::timeout(15)
            ->withHeaders([
                'X-Internal-Key' => $this->internalKey,
                'X-Tenant-ID' => $bot->tenant_id,
            ])
            ->post("{$this->baseUrl}/api/bots", [
                'token' => $bot->bot_token_encrypted,
                'tenant_id' => $bot->tenant_id,
            ]);

        if (!$response->successful()) {
            throw new \Exception($response->json('error', 'Failed to register bot'));
        }

        return $response->json();
    }

    /**
     * Start polling for a bot.
     */
    public function startBot(TelegramBot $bot): void
    {
        $response = Http::timeout(10)
            ->withHeaders(['X-Internal-Key' => $this->internalKey])
            ->post("{$this->baseUrl}/api/bots/{$bot->id}/start");

        if (!$response->successful()) {
            throw new \Exception($response->json('error', 'Failed to start bot'));
        }
    }

    /**
     * Stop polling for a bot.
     */
    public function stopBot(TelegramBot $bot): void
    {
        $response = Http::timeout(10)
            ->withHeaders(['X-Internal-Key' => $this->internalKey])
            ->post("{$this->baseUrl}/api/bots/{$bot->id}/stop");

        if (!$response->successful()) {
            throw new \Exception($response->json('error', 'Failed to stop bot'));
        }
    }

    /**
     * Delete a bot from telegram-service.
     */
    public function deleteBot(TelegramBot $bot): void
    {
        Http::timeout(10)
            ->withHeaders(['X-Internal-Key' => $this->internalKey])
            ->delete("{$this->baseUrl}/api/bots/{$bot->id}");
    }

    /**
     * Send a text message via Telegram.
     */
    public function sendMessage(TelegramBot $bot, string $chatId, string $text): array
    {
        $response = Http::timeout(15)
            ->withHeaders(['X-Internal-Key' => $this->internalKey])
            ->post("{$this->baseUrl}/api/send", [
                'bot_id' => $bot->id,
                'chat_id' => $chatId,
                'text' => $text,
            ]);

        if (!$response->successful()) {
            throw new \Exception($response->json('error', 'Failed to send message'));
        }

        return $response->json();
    }

    /**
     * Handle incoming message from telegram-service webhook.
     */
    public function handleMessageReceived(array $payload): void
    {
        $bot = TelegramBot::withoutGlobalScope('tenant')->find($payload['botId']);
        if (!$bot) {
            Log::warning('Telegram bot not found for message', ['botId' => $payload['botId']]);
            return;
        }

        $chatId = $payload['chatId'];
        $fromName = trim(($payload['from']['firstName'] ?? '') . ' ' . ($payload['from']['lastName'] ?? ''));
        $fromUsername = $payload['from']['username'] ?? '';
        $contactName = $fromName ?: ($fromUsername ? "@{$fromUsername}" : "Telegram User");

        // Find or create conversation
        $conversation = Conversation::withoutGlobalScope('tenant')->firstOrCreate(
            [
                'tenant_id' => $bot->tenant_id,
                'telegram_bot_id' => $bot->id,
                'channel_contact_id' => $chatId,
                'channel' => 'telegram',
            ],
            [
                'contact_name' => $contactName,
                'contact_phone' => $fromUsername ? "@{$fromUsername}" : "tg:{$chatId}",
                'status' => Conversation::STATUS_ACTIVE,
            ]
        );

        // Update contact info
        if ($contactName !== $conversation->contact_name) {
            $conversation->update(['contact_name' => $contactName]);
        }

        // Create message
        $message = $conversation->messages()->create([
            'tenant_id' => $bot->tenant_id,
            'direction' => Message::DIRECTION_INBOUND,
            'sender_type' => Message::SENDER_CONTACT,
            'content_type' => Message::TYPE_TEXT,
            'content' => $payload['text'] ?? '',
            'status' => Message::STATUS_DELIVERED,
            'metadata' => [
                'telegram_message_id' => $payload['messageId'] ?? null,
                'telegram_chat_id' => $chatId,
                'telegram_from' => $payload['from'] ?? null,
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
