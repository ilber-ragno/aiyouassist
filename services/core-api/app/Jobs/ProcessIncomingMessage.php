<?php

namespace App\Jobs;

use App\Models\AgentSetting;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\AiOrchestratorService;
use App\Services\ClaudBotService;
use App\Services\ExecutionLogService;
use App\Services\TelegramService;
use App\Services\WebchatService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class ProcessIncomingMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 30;

    public function __construct(
        protected Conversation $conversation,
        protected Message $message
    ) {}

    public function handle(): void
    {
        $logService = app(ExecutionLogService::class);
        $tenantId = $this->conversation->tenant_id;

        // 1. Guard: only process if conversation is with AI
        $this->conversation->refresh();
        if (!$this->conversation->isWithAi()) {
            Log::info('Skipping AI processing - conversation not with AI', [
                'conversation_id' => $this->conversation->id,
                'status' => $this->conversation->status,
            ]);
            return;
        }

        // 2. Rate limit: prevent flooding
        $rateLimitKey = "ai_processing:{$this->conversation->id}";
        if (Cache::has($rateLimitKey)) {
            Log::info('Skipping AI processing - rate limited', [
                'conversation_id' => $this->conversation->id,
            ]);
            return;
        }
        Cache::put($rateLimitKey, true, 5);

        // 3. Idempotency: check if already replied
        $alreadyReplied = $this->conversation->messages()
            ->where('sender_type', Message::SENDER_AI)
            ->where('created_at', '>', $this->message->created_at)
            ->exists();

        if ($alreadyReplied) {
            return;
        }

        // 4. Load agent settings for tenant
        $agentSetting = AgentSetting::where('tenant_id', $this->conversation->tenant_id)
            ->where('is_active', true)
            ->first();

        // 5. Load conversation history (last 20 messages)
        $history = $this->conversation->messages()
            ->orderBy('created_at', 'desc')
            ->take(20)
            ->get()
            ->reverse()
            ->map(fn (Message $m) => [
                'direction' => $m->direction,
                'content' => $m->content,
                'sender_type' => $m->sender_type,
                'created_at' => $m->created_at->toISOString(),
            ])
            ->values()
            ->toArray();

        // Log: AI processing started
        $logService->ai('Processando mensagem com IA', [
            'conversation_id' => $this->conversation->id,
            'contact_phone' => $this->conversation->contact_phone,
            'contact_name' => $this->conversation->contact_name,
            'message_preview' => mb_substr($this->message->content, 0, 100),
            'history_count' => count($history),
        ], 'info', $tenantId);

        // 6. Call AI orchestrator
        $orchestrator = app(AiOrchestratorService::class);

        $aiResponse = $orchestrator->process([
            'tenant_id' => $this->conversation->tenant_id,
            'conversation_id' => $this->conversation->id,
            'message' => $this->message->content,
            'agent_settings' => $agentSetting ? [
                'persona' => $agentSetting->persona,
                'tone' => $agentSetting->tone,
                'language' => $agentSetting->language,
                'response_mode' => $agentSetting->response_mode ?? 'all',
                'whitelisted_phones' => $agentSetting->whitelisted_phones ?? [],
                'operating_hours' => $agentSetting->operating_hours,
                'forbidden_topics' => $agentSetting->forbidden_topics,
                'escalation_rules' => $agentSetting->escalation_rules,
                'allowed_tools' => $agentSetting->allowed_tools,
                'max_response_tokens' => $agentSetting->max_response_tokens,
                'confidence_threshold' => $agentSetting->confidence_threshold,
            ] : null,
            'conversation_history' => $history,
            'contact_phone' => $this->conversation->contact_phone,
            'contact_name' => $this->conversation->contact_name,
        ]);

        // 7. Process AI response
        $action = $aiResponse['action'] ?? 'error';
        $content = $aiResponse['content'] ?? '';

        Log::info('AI response received', [
            'conversation_id' => $this->conversation->id,
            'action' => $action,
            'confidence' => $aiResponse['confidence'] ?? null,
        ]);

        // Log: AI response received
        $logService->ai("Resposta IA: {$action}", [
            'conversation_id' => $this->conversation->id,
            'contact_phone' => $this->conversation->contact_phone,
            'action' => $action,
            'confidence' => $aiResponse['confidence'] ?? null,
            'model' => $aiResponse['provider']['model'] ?? $aiResponse['model'] ?? null,
            'tokens_used' => ($aiResponse['usage']['input_tokens'] ?? 0) + ($aiResponse['usage']['output_tokens'] ?? 0),
            'cost_usd' => $aiResponse['usage']['total_cost'] ?? null,
            'response_preview' => mb_substr($content, 0, 120),
        ], 'info', $tenantId);

        switch ($action) {
            case 'ignore':
                Log::info('AI ignoring message (response_mode filter)', [
                    'conversation_id' => $this->conversation->id,
                ]);
                $logService->ai('Mensagem ignorada (filtro de modo)', [
                    'conversation_id' => $this->conversation->id,
                    'contact_phone' => $this->conversation->contact_phone,
                ], 'info', $tenantId);
                return;

            case 'respond':
                $this->sendAiReply($content, $logService, $tenantId);

                // Check if should escalate despite responding
                if ($aiResponse['should_escalate'] ?? false) {
                    $this->conversation->escalate($aiResponse['escalation_reason'] ?? 'Low confidence');
                    $logService->ai('Conversa escalada (baixa confiança)', [
                        'conversation_id' => $this->conversation->id,
                        'contact_phone' => $this->conversation->contact_phone,
                        'reason' => $aiResponse['escalation_reason'] ?? 'Low confidence',
                    ], 'warning', $tenantId);
                }
                break;

            case 'escalate':
                if ($content) {
                    $this->sendAiReply($content, $logService, $tenantId);
                }
                $this->conversation->escalate($aiResponse['reason'] ?? 'AI escalated');
                $logService->ai('Conversa escalada para humano', [
                    'conversation_id' => $this->conversation->id,
                    'contact_phone' => $this->conversation->contact_phone,
                    'reason' => $aiResponse['reason'] ?? 'AI escalated',
                ], 'warning', $tenantId);
                break;

            case 'blocked':
                $this->sendAiReply($content ?: 'Desculpe, nao posso ajudar com isso no momento.', $logService, $tenantId);
                $logService->ai('Mensagem bloqueada pela IA', [
                    'conversation_id' => $this->conversation->id,
                    'contact_phone' => $this->conversation->contact_phone,
                ], 'warning', $tenantId);
                break;

            case 'out_of_hours':
                $this->sendAiReply($content ?: 'Desculpe, nao posso ajudar com isso no momento.', $logService, $tenantId);
                $logService->ai('Mensagem fora do horário de atendimento', [
                    'conversation_id' => $this->conversation->id,
                    'contact_phone' => $this->conversation->contact_phone,
                ], 'info', $tenantId);
                break;

            case 'budget_exhausted':
                $this->sendAiReply('Estou com dificuldades tecnicas. Um atendente humano vai te ajudar em breve.', $logService, $tenantId);
                $this->conversation->escalate('AI budget exhausted');
                $logService->ai('Créditos esgotados - conversa escalada', [
                    'conversation_id' => $this->conversation->id,
                    'contact_phone' => $this->conversation->contact_phone,
                ], 'error', $tenantId);
                break;

            case 'error':
            default:
                Log::error('AI processing error', [
                    'conversation_id' => $this->conversation->id,
                    'response' => $aiResponse,
                ]);
                $this->sendAiReply('Desculpe, estou com dificuldades. Um atendente vai te ajudar.', $logService, $tenantId);
                $this->conversation->escalate('AI error: ' . ($content ?: 'unknown'));
                $logService->ai('Erro no processamento IA', [
                    'conversation_id' => $this->conversation->id,
                    'contact_phone' => $this->conversation->contact_phone,
                    'error' => $content ?: 'unknown',
                    'raw_response' => array_slice($aiResponse, 0, 5),
                ], 'error', $tenantId);
                break;
        }
    }

    /**
     * Send AI reply: store in DB and send via the appropriate channel.
     */
    protected function sendAiReply(string $content, ?ExecutionLogService $logService = null, ?string $tenantId = null): void
    {
        if (empty(trim($content))) {
            return;
        }

        // Store outbound message
        $outbound = $this->conversation->messages()->create([
            'tenant_id' => $this->conversation->tenant_id,
            'direction' => Message::DIRECTION_OUTBOUND,
            'sender_type' => Message::SENDER_AI,
            'content_type' => Message::TYPE_TEXT,
            'content' => $content,
            'status' => Message::STATUS_PENDING,
        ]);

        $channel = $this->conversation->channel ?? 'whatsapp';

        try {
            if ($channel === 'telegram') {
                $this->sendViaTelegram($outbound, $content, $logService, $tenantId);
            } elseif ($channel === 'webchat') {
                $this->sendViaWebchat($outbound, $content, $logService, $tenantId);
            } else {
                $this->sendViaWhatsapp($outbound, $content, $logService, $tenantId);
            }
        } catch (\Exception $e) {
            Log::error("Failed to send AI reply via {$channel}", [
                'conversation_id' => $this->conversation->id,
                'error' => $e->getMessage(),
            ]);
            $outbound->markFailed();
            $logService?->message("Falha ao enviar mensagem via {$channel}", [
                'conversation_id' => $this->conversation->id,
                'contact_phone' => $this->conversation->contact_phone,
                'channel' => $channel,
                'error' => $e->getMessage(),
            ], 'error', $tenantId);
        }
    }

    protected function sendViaWhatsapp(Message $outbound, string $content, ?ExecutionLogService $logService, ?string $tenantId): void
    {
        $claudBot = app(ClaudBotService::class);

        $session = $this->conversation->whatsappSession;
        if (!$session) {
            Log::error('No WhatsApp session for conversation', [
                'conversation_id' => $this->conversation->id,
            ]);
            $outbound->markFailed();
            $logService?->message('Falha ao enviar: sessão WhatsApp não encontrada', [
                'conversation_id' => $this->conversation->id,
                'contact_phone' => $this->conversation->contact_phone,
            ], 'error', $tenantId);
            return;
        }

        $claudBot->sendMessage(
            $session,
            $this->conversation->contact_phone,
            $content
        );

        $outbound->update(['status' => Message::STATUS_SENT]);

        $logService?->message('Mensagem enviada via WhatsApp', [
            'conversation_id' => $this->conversation->id,
            'contact_phone' => $this->conversation->contact_phone,
            'message_id' => $outbound->id,
            'sender_type' => 'ai',
            'content_preview' => mb_substr($content, 0, 80),
        ], 'info', $tenantId);
    }

    protected function sendViaTelegram(Message $outbound, string $content, ?ExecutionLogService $logService, ?string $tenantId): void
    {
        $telegramService = app(TelegramService::class);

        $bot = $this->conversation->telegramBot;
        $chatId = $this->conversation->channel_contact_id;

        if (!$bot || !$chatId) {
            Log::error('No Telegram bot or chat ID for conversation', [
                'conversation_id' => $this->conversation->id,
            ]);
            $outbound->markFailed();
            $logService?->message('Falha ao enviar: bot Telegram não encontrado', [
                'conversation_id' => $this->conversation->id,
            ], 'error', $tenantId);
            return;
        }

        $telegramService->sendMessage($bot, $chatId, $content);

        $outbound->update(['status' => Message::STATUS_SENT]);

        $logService?->message('Mensagem enviada via Telegram', [
            'conversation_id' => $this->conversation->id,
            'contact_name' => $this->conversation->contact_name,
            'message_id' => $outbound->id,
            'sender_type' => 'ai',
            'content_preview' => mb_substr($content, 0, 80),
        ], 'info', $tenantId);
    }

    protected function sendViaWebchat(Message $outbound, string $content, ?ExecutionLogService $logService, ?string $tenantId): void
    {
        $webchatService = app(WebchatService::class);

        $sessionId = $this->conversation->channel_contact_id;
        $metadata = $this->conversation->metadata ?? [];
        $widgetKey = $metadata['widget_key'] ?? null;

        if (!$sessionId || !$widgetKey) {
            Log::error('No webchat session or widget key for conversation', [
                'conversation_id' => $this->conversation->id,
            ]);
            $outbound->markFailed();
            $logService?->message('Falha ao enviar: sessão webchat não encontrada', [
                'conversation_id' => $this->conversation->id,
            ], 'error', $tenantId);
            return;
        }

        $webchatService->sendMessage($sessionId, $widgetKey, $content);

        $outbound->update(['status' => Message::STATUS_SENT]);

        $logService?->message('Mensagem enviada via Webchat', [
            'conversation_id' => $this->conversation->id,
            'contact_name' => $this->conversation->contact_name,
            'message_id' => $outbound->id,
            'sender_type' => 'ai',
            'content_preview' => mb_substr($content, 0, 80),
        ], 'info', $tenantId);
    }

    /**
     * Handle failed job - escalate to human.
     */
    public function failed(\Throwable $exception): void
    {
        Log::error('ProcessIncomingMessage failed permanently', [
            'conversation_id' => $this->conversation->id,
            'message_id' => $this->message->id,
            'error' => $exception->getMessage(),
        ]);

        try {
            $logService = app(ExecutionLogService::class);
            $logService->ai('Falha permanente no processamento IA', [
                'conversation_id' => $this->conversation->id,
                'message_id' => $this->message->id,
                'contact_phone' => $this->conversation->contact_phone,
                'error' => $exception->getMessage(),
            ], 'critical', $this->conversation->tenant_id);
        } catch (\Exception $e) {
            // Ignore logging errors in failure handler
        }

        try {
            $this->conversation->escalate('AI processing failed: ' . $exception->getMessage());
        } catch (\Exception $e) {
            Log::error('Failed to escalate after job failure', ['error' => $e->getMessage()]);
        }
    }
}
