<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * HTTP client for the ClawdBot Connector service (port 8002)
 * Replaces direct ClaudBot CLI interaction
 */
class ClawdBotConnectorService
{
    protected string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = config('services.claudbot.url', 'http://whatsapp-service:8002');
    }

    public function health(): array
    {
        return $this->get('/health');
    }

    public function status(): array
    {
        return $this->get('/api/status');
    }

    public function sessions(): array
    {
        return $this->get('/api/sessions');
    }

    public function channelsStatus(): array
    {
        return $this->get('/api/channels/status');
    }

    public function getConfig(): array
    {
        return $this->get('/api/config');
    }

    public function patchConfig(array $config): array
    {
        return $this->post('/api/config/patch', $config);
    }

    public function sendMessage(array $payload): array
    {
        return $this->post('/api/send', $payload);
    }

    protected function get(string $endpoint): array
    {
        try {
            $response = Http::baseUrl($this->baseUrl)
                ->timeout(10)
                ->get($endpoint);

            return $response->successful() ? ($response->json() ?? []) : ['error' => $response->status()];
        } catch (\Exception $e) {
            Log::warning('ClawdBot connector request failed', [
                'endpoint' => $endpoint,
                'error' => $e->getMessage(),
            ]);
            return ['error' => $e->getMessage()];
        }
    }

    protected function post(string $endpoint, array $data = []): array
    {
        try {
            $response = Http::baseUrl($this->baseUrl)
                ->timeout(15)
                ->post($endpoint, $data);

            return $response->successful() ? ($response->json() ?? []) : ['error' => $response->status()];
        } catch (\Exception $e) {
            Log::warning('ClawdBot connector request failed', [
                'endpoint' => $endpoint,
                'error' => $e->getMessage(),
            ]);
            return ['error' => $e->getMessage()];
        }
    }
}
