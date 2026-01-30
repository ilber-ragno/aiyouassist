<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiOrchestratorService
{
    protected string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = config('services.ai_orchestrator.url', 'http://ai-orchestrator:8003');
    }

    /**
     * Send a message to the AI orchestrator for processing.
     *
     * @param array $params Keys: tenant_id, conversation_id, message, agent_settings, conversation_history, llm_provider_id
     * @return array Response with action, content, confidence, should_escalate, usage, etc.
     */
    protected function resolveBaseUrl(): string
    {
        $url = $this->baseUrl;
        $parsed = parse_url($url);
        $host = $parsed['host'] ?? null;

        if (!$host || filter_var($host, FILTER_VALIDATE_IP)) {
            return $url;
        }

        // Resolve hostname via shell to bypass PHP built-in server DNS cache
        $ip = trim(shell_exec("getent hosts {$host} 2>/dev/null | cut -d' ' -f1") ?? '');
        if ($ip && $ip !== $host) {
            return str_replace($host, $ip, $url);
        }

        return $url;
    }

    public function process(array $params): array
    {
        $response = Http::baseUrl($this->resolveBaseUrl())
            ->timeout(90)
            ->post('/api/process', $params);

        if (!$response->successful()) {
            Log::error('AI Orchestrator error', [
                'status' => $response->status(),
                'body' => $response->body(),
                'tenant_id' => $params['tenant_id'] ?? null,
            ]);

            throw new \Exception(
                'AI Orchestrator error: ' . ($response->json('error') ?? $response->status())
            );
        }

        return $response->json() ?? [];
    }
}
