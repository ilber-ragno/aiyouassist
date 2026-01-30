<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgentSetting;
use App\Models\LlmProvider;
use App\Services\AiOrchestratorService;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgentSettingController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}
    /**
     * Get agent settings for current tenant (auto-creates default if none exist)
     */
    public function show(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;

        $setting = AgentSetting::firstOrCreate(
            ['tenant_id' => $tenant->id],
            [
                'name' => 'Default Agent',
                'persona' => null,
                'tone' => 'professional',
                'language' => 'pt-BR',
                'response_mode' => 'all',
                'whitelisted_phones' => [],
                'operating_hours' => [],
                'forbidden_topics' => [],
                'escalation_rules' => ['keywords' => [], 'min_confidence' => 0.5],
                'max_response_tokens' => 1024,
                'confidence_threshold' => 0.7,
                'is_active' => true,
            ]
        );

        $providers = LlmProvider::active()->byPriority()->get()->map(fn($p) => [
            'id' => $p->id,
            'name' => $p->name,
            'provider_type' => $p->provider_type,
            'model' => $p->model,
            'is_default' => $p->is_default,
        ]);

        return response()->json([
            'agent' => $setting,
            'providers' => $providers,
        ]);
    }

    /**
     * Update agent settings
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'persona' => 'nullable|string|max:2000',
            'tone' => 'sometimes|string|in:professional,friendly,casual,formal',
            'language' => 'sometimes|string|in:pt-BR,en,es',
            'response_mode' => 'sometimes|string|in:all,owner_only,whitelist',
            'whitelisted_phones' => 'nullable|array',
            'whitelisted_phones.*' => 'string',
            'operating_hours' => 'nullable|array',
            'forbidden_topics' => 'nullable|array',
            'forbidden_topics.*' => 'string',
            'escalation_rules' => 'nullable|array',
            'max_response_tokens' => 'sometimes|integer|min:256|max:4096',
            'confidence_threshold' => 'sometimes|numeric|min:0.1|max:1.0',
            'is_active' => 'sometimes|boolean',
        ]);

        $tenant = $request->user()->tenant;

        $setting = AgentSetting::firstOrCreate(
            ['tenant_id' => $tenant->id],
            ['name' => 'Default Agent']
        );

        $setting->update($validated);

        $this->logService->ai('Configurações do agente atualizadas', [
            'changes' => array_keys($validated),
            'agent_name' => $setting->name,
        ]);

        return response()->json([
            'message' => 'Configuracoes do agente atualizadas',
            'agent' => $setting->fresh(),
        ]);
    }

    /**
     * Test agent prompt with a sample message
     */
    public function testPrompt(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'required|string|max:500',
        ]);

        $tenant = $request->user()->tenant;
        $setting = AgentSetting::where('tenant_id', $tenant->id)->first();

        if (!$setting) {
            return response()->json(['error' => 'Nenhuma configuracao de agente encontrada'], 404);
        }

        $defaultProvider = LlmProvider::active()->default()->first();
        if (!$defaultProvider) {
            return response()->json(['error' => 'Nenhum provedor de IA padrao configurado'], 422);
        }

        try {
            $orchestrator = app(AiOrchestratorService::class);
            $result = $orchestrator->process([
                'tenant_id' => $tenant->id,
                'conversation_id' => null,
                'message' => $validated['message'],
                'agent_settings' => $setting->toArray(),
                'conversation_history' => [],
                'llm_provider_id' => $defaultProvider->id,
                'contact_phone' => 'test',
                'is_test' => true,
                // Pass provider directly to avoid callback deadlock with single-threaded server
                'provider_override' => [
                    'id' => $defaultProvider->id,
                    'provider_type' => $defaultProvider->provider_type,
                    'model' => $defaultProvider->model,
                    'api_key' => $defaultProvider->getDecryptedApiKey(),
                ],
            ]);

            $this->logService->ai('Teste de prompt executado', [
                'model' => $result['provider']['model'] ?? null,
                'action' => $result['action'] ?? 'respond',
                'input_tokens' => $result['usage']['input_tokens'] ?? null,
                'output_tokens' => $result['usage']['output_tokens'] ?? null,
                'message_preview' => mb_substr($validated['message'], 0, 80),
            ]);

            return response()->json([
                'response' => $result['content'] ?? 'Sem resposta',
                'action' => $result['action'] ?? 'respond',
                'model_used' => $result['provider']['model'] ?? null,
                'tokens' => [
                    'input' => $result['usage']['input_tokens'] ?? null,
                    'output' => $result['usage']['output_tokens'] ?? null,
                ],
                'cost_usd' => $result['usage']['cost_usd'] ?? null,
            ]);
        } catch (\Exception $e) {
            $this->logService->ai('Erro no teste de prompt', [
                'error' => $e->getMessage(),
            ], 'error');
            return response()->json([
                'error' => 'Erro ao testar: ' . $e->getMessage(),
            ], 500);
        }
    }
}
