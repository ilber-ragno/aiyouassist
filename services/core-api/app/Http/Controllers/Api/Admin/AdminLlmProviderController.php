<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\LlmProvider;
use App\Models\Tenant;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AdminLlmProviderController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    /**
     * List global providers (tenant_id IS NULL)
     */
    public function index(): JsonResponse
    {
        $providers = LlmProvider::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->orderBy('priority')
            ->orderBy('created_at')
            ->get()
            ->map(fn(LlmProvider $p) => $p->toArrayWithSpending());

        $availableProviders = collect(LlmProvider::PROVIDERS)->map(fn($cfg, $id) => [
            'id' => $id,
            'name' => $cfg['name'],
            'models' => $cfg['models'],
            'dynamic_models' => $cfg['dynamic_models'] ?? false,
        ])->values();

        return response()->json([
            'providers' => $providers,
            'available_providers' => $availableProviders,
        ]);
    }

    /**
     * Create a global provider
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'provider_type' => 'required|string|in:anthropic,openai,groq,mistral,cohere,google,openrouter',
            'model' => 'required|string|max:100',
            'api_key' => 'required|string',
            'budget_limit_usd' => 'nullable|numeric|min:0',
            'alert_threshold_pct' => 'nullable|integer|min:1|max:100',
            'is_default' => 'nullable|boolean',
        ]);

        $providerConfig = LlmProvider::PROVIDERS[$validated['provider_type']] ?? null;
        $isDynamic = $providerConfig['dynamic_models'] ?? false;
        if ($providerConfig && !$isDynamic && !in_array($validated['model'], $providerConfig['models'])) {
            return response()->json([
                'error' => 'Modelo inválido para este provedor',
                'available_models' => $providerConfig['models'],
            ], 422);
        }

        // Check name uniqueness among global providers
        $exists = LlmProvider::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->where('name', $validated['name'])
            ->exists();
        if ($exists) {
            return response()->json(['error' => 'Já existe um provedor global com este nome'], 422);
        }

        // If setting as default, unset current default among global providers
        if ($validated['is_default'] ?? false) {
            LlmProvider::withoutGlobalScope('tenant')
                ->whereNull('tenant_id')
                ->where('is_default', true)
                ->update(['is_default' => false]);
        }

        $isFirst = LlmProvider::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->count() === 0;

        $provider = new LlmProvider([
            'name' => $validated['name'],
            'provider_type' => $validated['provider_type'],
            'api_key_encrypted' => encrypt($validated['api_key']),
            'model' => $validated['model'],
            'budget_limit_usd' => $validated['budget_limit_usd'] ?? null,
            'alert_threshold_pct' => $validated['alert_threshold_pct'] ?? 80,
            'is_default' => ($validated['is_default'] ?? false) || $isFirst,
        ]);
        // tenant_id stays NULL for global providers
        $provider->tenant_id = null;
        $provider->save();

        $this->logService->audit('admin.llm_provider.created', [
            'provider_id' => $provider->id,
            'name' => $provider->name,
            'provider_type' => $provider->provider_type,
            'model' => $provider->model,
            'scope' => 'global',
        ]);

        return response()->json([
            'message' => 'Provedor global criado com sucesso',
            'provider' => $provider->toArrayWithSpending(),
        ], 201);
    }

    /**
     * Update a global provider
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $provider = LlmProvider::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => 'nullable|string|max:100',
            'model' => 'nullable|string|max:100',
            'api_key' => 'nullable|string',
            'budget_limit_usd' => 'nullable|numeric|min:0',
            'alert_threshold_pct' => 'nullable|integer|min:1|max:100',
            'is_active' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:0',
        ]);

        if (isset($validated['model'])) {
            $providerConfig = LlmProvider::PROVIDERS[$provider->provider_type] ?? null;
            $isDynamic = $providerConfig['dynamic_models'] ?? false;
            if ($providerConfig && !$isDynamic && !in_array($validated['model'], $providerConfig['models'])) {
                return response()->json([
                    'error' => 'Modelo inválido para este provedor',
                    'available_models' => $providerConfig['models'],
                ], 422);
            }
        }

        $updateData = array_filter([
            'name' => $validated['name'] ?? null,
            'model' => $validated['model'] ?? null,
            'budget_limit_usd' => array_key_exists('budget_limit_usd', $validated) ? $validated['budget_limit_usd'] : null,
            'alert_threshold_pct' => $validated['alert_threshold_pct'] ?? null,
            'is_active' => $validated['is_active'] ?? null,
            'priority' => $validated['priority'] ?? null,
        ], fn($v) => $v !== null);

        if (!empty($validated['api_key']) && !str_starts_with($validated['api_key'], '****')) {
            $updateData['api_key_encrypted'] = encrypt($validated['api_key']);
        }

        $provider->update($updateData);

        $this->logService->audit('admin.llm_provider.updated', [
            'provider_id' => $provider->id,
            'name' => $provider->name,
            'changes' => array_keys($updateData),
        ]);

        return response()->json([
            'message' => 'Provedor atualizado com sucesso',
            'provider' => $provider->fresh()->toArrayWithSpending(),
        ]);
    }

    /**
     * Delete a global provider
     */
    public function destroy(string $id): JsonResponse
    {
        $provider = LlmProvider::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->findOrFail($id);

        $provider->delete();

        $this->logService->audit('admin.llm_provider.deleted', [
            'provider_id' => $provider->id,
            'name' => $provider->name,
        ]);

        return response()->json(['message' => 'Provedor global excluído com sucesso']);
    }

    /**
     * Set a global provider as default
     */
    public function setDefault(string $id): JsonResponse
    {
        $provider = LlmProvider::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->findOrFail($id);

        if (!$provider->is_active) {
            return response()->json(['error' => 'Não é possível definir provedor inativo como padrão'], 422);
        }

        LlmProvider::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->where('is_default', true)
            ->where('id', '!=', $provider->id)
            ->update(['is_default' => false]);

        $provider->update(['is_default' => true]);

        $this->logService->audit('admin.llm_provider.set_default', [
            'provider_id' => $provider->id,
            'name' => $provider->name,
        ]);

        return response()->json([
            'message' => "{$provider->name} definido como provedor padrão global",
            'provider' => $provider->fresh()->toArrayWithSpending(),
        ]);
    }

    /**
     * Test a global provider connection
     */
    public function test(string $id): JsonResponse
    {
        $provider = LlmProvider::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->findOrFail($id);

        try {
            $apiKey = $provider->getDecryptedApiKey();
            $result = $this->testProviderConnection($provider->provider_type, $apiKey, $provider->model);

            $provider->update(['last_validated_at' => now()]);

            return response()->json([
                'success' => true,
                'message' => 'Conexão com ' . (LlmProvider::PROVIDERS[$provider->provider_type]['name'] ?? $provider->provider_type) . ' estabelecida com sucesso',
                'details' => $result,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Falha na conexão: ' . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * List tenants with their provider configuration status
     */
    public function tenantOverrides(): JsonResponse
    {
        $tenants = Tenant::withCount(['llmProviders' => function ($q) {
            // This already uses tenant scope, which is what we want for per-tenant providers
        }])->get(['id', 'name', 'slug', 'status']);

        // Get tenants with their own providers
        $tenantsWithProviders = LlmProvider::withoutGlobalScope('tenant')
            ->whereNotNull('tenant_id')
            ->where('is_active', true)
            ->whereNull('deleted_at')
            ->selectRaw('tenant_id, COUNT(*) as provider_count')
            ->groupBy('tenant_id')
            ->pluck('provider_count', 'tenant_id');

        $result = $tenants->map(fn($t) => [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'status' => $t->status,
            'has_own_providers' => ($tenantsWithProviders[$t->id] ?? 0) > 0,
            'own_provider_count' => $tenantsWithProviders[$t->id] ?? 0,
            'uses_global' => ($tenantsWithProviders[$t->id] ?? 0) === 0,
        ]);

        return response()->json(['tenants' => $result]);
    }

    private function testProviderConnection(string $providerType, string $apiKey, string $model): array
    {
        switch ($providerType) {
            case 'anthropic':
                $response = Http::withHeaders([
                    'x-api-key' => $apiKey,
                    'anthropic-version' => '2023-06-01',
                    'content-type' => 'application/json',
                ])->timeout(15)->post('https://api.anthropic.com/v1/messages', [
                    'model' => $model,
                    'max_tokens' => 10,
                    'messages' => [['role' => 'user', 'content' => 'Hi']],
                ]);
                break;

            case 'openai':
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$apiKey}",
                    'Content-Type' => 'application/json',
                ])->timeout(15)->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $model,
                    'max_tokens' => 10,
                    'messages' => [['role' => 'user', 'content' => 'Hi']],
                ]);
                break;

            case 'openrouter':
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$apiKey}",
                    'Content-Type' => 'application/json',
                    'HTTP-Referer' => config('app.url', 'https://meuaiyou.cloud'),
                    'X-Title' => 'AiYou Assist',
                ])->timeout(30)->post('https://openrouter.ai/api/v1/chat/completions', [
                    'model' => $model,
                    'max_tokens' => 10,
                    'messages' => [['role' => 'user', 'content' => 'Hi']],
                ]);
                break;

            default:
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$apiKey}",
                    'Content-Type' => 'application/json',
                ])->timeout(15)->post($this->getApiUrl($providerType), [
                    'model' => $model,
                    'max_tokens' => 10,
                    'messages' => [['role' => 'user', 'content' => 'Hi']],
                ]);
        }

        if (!$response->successful()) {
            $error = $response->json('error.message') ?? $response->json('message') ?? $response->body();
            throw new \Exception("API retornou erro: {$error}");
        }

        return ['status' => 'ok', 'response_code' => $response->status()];
    }

    private function getApiUrl(string $providerType): string
    {
        return match ($providerType) {
            'groq' => 'https://api.groq.com/openai/v1/chat/completions',
            'mistral' => 'https://api.mistral.ai/v1/chat/completions',
            'cohere' => 'https://api.cohere.com/v2/chat',
            default => throw new \Exception("Provedor '{$providerType}' não suportado para teste"),
        };
    }
}
