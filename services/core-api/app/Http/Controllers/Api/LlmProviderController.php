<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LlmProvider;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class LlmProviderController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    /**
     * List all LLM providers with spending data
     */
    public function index(Request $request): JsonResponse
    {
        $providers = LlmProvider::active()
            ->byPriority()
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
     * Credit monitoring dashboard
     */
    public function dashboard(Request $request): JsonResponse
    {
        $providers = LlmProvider::byPriority()->get();

        $totalBudget = 0;
        $totalSpent = 0;
        $alerts = [];
        $providerData = [];

        foreach ($providers as $provider) {
            $data = $provider->toArrayWithSpending();
            $providerData[] = $data;

            if ($data['budget_limit_usd']) {
                $totalBudget += $data['budget_limit_usd'];
            }
            $totalSpent += $data['spent_usd'];

            if ($provider->isBudgetExhausted()) {
                $alerts[] = [
                    'provider_id' => $provider->id,
                    'provider_name' => $provider->name,
                    'type' => 'budget_exhausted',
                    'message' => "Orcamento esgotado para {$provider->name}",
                    'usage_pct' => $data['usage_pct'] ?? 100,
                ];
            } elseif ($provider->isAboveAlertThreshold()) {
                $alerts[] = [
                    'provider_id' => $provider->id,
                    'provider_name' => $provider->name,
                    'type' => 'threshold_warning',
                    'message' => "{$data['usage_pct']}% do orcamento consumido em {$provider->name}",
                    'usage_pct' => $data['usage_pct'],
                ];
            }
        }

        // Daily spending across all providers (last 30 days)
        $dailySpending = DB::table('ai_decisions')
            ->selectRaw("DATE(created_at) as date, COALESCE(SUM(cost_usd), 0) as cost_usd, COUNT(*) as requests")
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('created_at', '>=', now()->subDays(30))
            ->groupByRaw('DATE(created_at)')
            ->orderBy('date')
            ->get()
            ->map(fn($row) => [
                'date' => $row->date,
                'cost_usd' => round((float) $row->cost_usd, 4),
                'requests' => (int) $row->requests,
            ]);

        return response()->json([
            'summary' => [
                'total_budget_usd' => round($totalBudget, 2),
                'total_spent_usd' => round($totalSpent, 2),
                'total_remaining_usd' => round(max(0, $totalBudget - $totalSpent), 2),
                'total_providers' => $providers->count(),
                'active_providers' => $providers->where('is_active', true)->count(),
                'alerts' => $alerts,
            ],
            'providers' => $providerData,
            'daily_spending' => $dailySpending,
        ]);
    }

    /**
     * Create a new LLM provider
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

        $tenant = $request->user()->tenant;

        // Validate model belongs to provider (skip for dynamic_models providers like OpenRouter)
        $providerConfig = LlmProvider::PROVIDERS[$validated['provider_type']] ?? null;
        $isDynamic = $providerConfig['dynamic_models'] ?? false;
        if ($providerConfig && !$isDynamic && !in_array($validated['model'], $providerConfig['models'])) {
            return response()->json([
                'error' => 'Modelo invalido para este provedor',
                'available_models' => $providerConfig['models'],
            ], 422);
        }

        // Check name uniqueness within tenant
        $exists = LlmProvider::where('name', $validated['name'])->exists();
        if ($exists) {
            return response()->json(['error' => 'Ja existe um provedor com este nome'], 422);
        }

        // If setting as default, unset current default
        if ($validated['is_default'] ?? false) {
            LlmProvider::where('is_default', true)->update(['is_default' => false]);
        }

        // If this is the first provider, make it default
        $isFirst = LlmProvider::count() === 0;

        $provider = LlmProvider::create([
            'tenant_id' => $tenant->id,
            'name' => $validated['name'],
            'provider_type' => $validated['provider_type'],
            'api_key_encrypted' => encrypt($validated['api_key']),
            'model' => $validated['model'],
            'budget_limit_usd' => $validated['budget_limit_usd'] ?? null,
            'alert_threshold_pct' => $validated['alert_threshold_pct'] ?? 80,
            'is_default' => ($validated['is_default'] ?? false) || $isFirst,
        ]);

        $this->logService->audit('llm_provider.created', [
            'provider_id' => $provider->id,
            'name' => $provider->name,
            'provider_type' => $provider->provider_type,
            'model' => $provider->model,
        ]);

        return response()->json([
            'message' => 'Provedor de IA criado com sucesso',
            'provider' => $provider->toArrayWithSpending(),
        ], 201);
    }

    /**
     * Show provider details with usage stats
     */
    public function show(LlmProvider $provider): JsonResponse
    {
        return response()->json([
            'provider' => $provider->toArrayWithSpending(),
            'daily_spending' => $provider->getDailySpending(30),
            'pricing' => LlmProvider::PRICING[$provider->model] ?? null,
        ]);
    }

    /**
     * Update provider
     */
    public function update(Request $request, LlmProvider $provider): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'nullable|string|max:100',
            'model' => 'nullable|string|max:100',
            'api_key' => 'nullable|string',
            'budget_limit_usd' => 'nullable|numeric|min:0',
            'alert_threshold_pct' => 'nullable|integer|min:1|max:100',
            'is_active' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:0',
        ]);

        // Validate model if changed (skip for dynamic_models providers like OpenRouter)
        if (isset($validated['model'])) {
            $providerConfig = LlmProvider::PROVIDERS[$provider->provider_type] ?? null;
            $isDynamic = $providerConfig['dynamic_models'] ?? false;
            if ($providerConfig && !$isDynamic && !in_array($validated['model'], $providerConfig['models'])) {
                return response()->json([
                    'error' => 'Modelo invalido para este provedor',
                    'available_models' => $providerConfig['models'],
                ], 422);
            }
        }

        // Check name uniqueness if changed
        if (isset($validated['name']) && $validated['name'] !== $provider->name) {
            $exists = LlmProvider::where('name', $validated['name'])
                ->where('id', '!=', $provider->id)
                ->exists();
            if ($exists) {
                return response()->json(['error' => 'Ja existe um provedor com este nome'], 422);
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

        $this->logService->audit('llm_provider.updated', [
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
     * Delete provider
     */
    public function destroy(LlmProvider $provider): JsonResponse
    {
        if ($provider->is_default) {
            return response()->json(['error' => 'Nao e possivel excluir o provedor padrao. Defina outro como padrao primeiro.'], 422);
        }

        $provider->delete();

        $this->logService->audit('llm_provider.deleted', [
            'provider_id' => $provider->id,
            'name' => $provider->name,
        ]);

        return response()->json(['message' => 'Provedor excluido com sucesso']);
    }

    /**
     * Test API key connection
     */
    public function test(LlmProvider $provider): JsonResponse
    {
        try {
            $apiKey = $provider->getDecryptedApiKey();
            $result = $this->testProviderConnection($provider->provider_type, $apiKey, $provider->model);

            $provider->update(['last_validated_at' => now()]);

            return response()->json([
                'success' => true,
                'message' => 'Conexao com ' . (LlmProvider::PROVIDERS[$provider->provider_type]['name'] ?? $provider->provider_type) . ' estabelecida com sucesso',
                'details' => $result,
            ]);
        } catch (\Exception $e) {
            Log::warning('LLM provider test failed', [
                'provider_id' => $provider->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Falha na conexao: ' . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Set provider as default
     */
    public function setDefault(LlmProvider $provider): JsonResponse
    {
        if (!$provider->is_active) {
            return response()->json(['error' => 'Nao e possivel definir provedor inativo como padrao'], 422);
        }

        // Unset current default
        LlmProvider::where('is_default', true)
            ->where('id', '!=', $provider->id)
            ->update(['is_default' => false]);

        $provider->update(['is_default' => true]);

        $this->logService->audit('llm_provider.set_default', [
            'provider_id' => $provider->id,
            'name' => $provider->name,
        ]);

        return response()->json([
            'message' => "{$provider->name} definido como provedor padrao",
            'provider' => $provider->fresh()->toArrayWithSpending(),
        ]);
    }

    /**
     * Fetch available models from OpenRouter API
     */
    public function openrouterModels(Request $request): JsonResponse
    {
        try {
            $apiKey = $request->input('api_key');

            $headers = [
                'Content-Type' => 'application/json',
                'HTTP-Referer' => config('app.url', 'https://meuaiyou.cloud'),
                'X-Title' => 'AiYou Assist',
            ];

            if ($apiKey) {
                $headers['Authorization'] = "Bearer {$apiKey}";
            }

            $response = Http::withHeaders($headers)
                ->timeout(15)
                ->get('https://openrouter.ai/api/v1/models');

            if (!$response->successful()) {
                return response()->json([
                    'error' => 'Falha ao buscar modelos do OpenRouter',
                    'details' => $response->json('error') ?? $response->body(),
                ], 422);
            }

            $models = collect($response->json('data', []))
                ->map(fn($m) => [
                    'id' => $m['id'],
                    'name' => $m['name'] ?? $m['id'],
                    'context_length' => $m['context_length'] ?? null,
                    'pricing' => [
                        'input' => isset($m['pricing']['prompt']) ? (float) $m['pricing']['prompt'] * 1000000 : null,
                        'output' => isset($m['pricing']['completion']) ? (float) $m['pricing']['completion'] * 1000000 : null,
                    ],
                    'top_provider' => $m['top_provider']['max_completion_tokens'] ?? null,
                ])
                ->sortBy('name')
                ->values();

            return response()->json([
                'models' => $models,
                'total' => $models->count(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Erro ao buscar modelos: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Internal endpoint: get default provider for tenant (used by AI orchestrator)
     */
    public function internalGetDefault(string $tenantId): JsonResponse
    {
        // Verify internal key
        $internalKey = request()->header('X-Internal-Key');
        $expectedKey = config('services.claudbot.internal_key');

        if (!$internalKey || $internalKey !== $expectedKey) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $provider = LlmProvider::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where('is_default', true)
            ->whereNull('deleted_at')
            ->first();

        if (!$provider) {
            // Fallback to any active provider for this tenant
            $provider = LlmProvider::withoutGlobalScope('tenant')
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->whereNull('deleted_at')
                ->orderBy('priority')
                ->first();
        }

        if (!$provider) {
            // Fallback to global default provider (tenant_id IS NULL)
            $provider = LlmProvider::withoutGlobalScope('tenant')
                ->whereNull('tenant_id')
                ->where('is_active', true)
                ->where('is_default', true)
                ->whereNull('deleted_at')
                ->first();
        }

        if (!$provider) {
            // Fallback to any active global provider
            $provider = LlmProvider::withoutGlobalScope('tenant')
                ->whereNull('tenant_id')
                ->where('is_active', true)
                ->whereNull('deleted_at')
                ->orderBy('priority')
                ->first();
        }

        if (!$provider) {
            return response()->json(['error' => 'No provider configured'], 404);
        }

        // Check budget
        if ($provider->isBudgetExhausted()) {
            return response()->json([
                'error' => 'budget_exhausted',
                'message' => "Orcamento esgotado para {$provider->name}",
            ], 429);
        }

        return response()->json([
            'provider' => [
                'id' => $provider->id,
                'provider_type' => $provider->provider_type,
                'model' => $provider->model,
                'api_key' => $provider->getDecryptedApiKey(),
                'budget_limit_usd' => $provider->budget_limit_usd ? (float) $provider->budget_limit_usd : null,
                'spent_usd' => $provider->getMonthlySpentUsd(),
            ],
        ]);
    }

    /**
     * Test connection to a specific provider
     */
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

            case 'groq':
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$apiKey}",
                    'Content-Type' => 'application/json',
                ])->timeout(15)->post('https://api.groq.com/openai/v1/chat/completions', [
                    'model' => $model,
                    'max_tokens' => 10,
                    'messages' => [['role' => 'user', 'content' => 'Hi']],
                ]);
                break;

            case 'mistral':
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$apiKey}",
                    'Content-Type' => 'application/json',
                ])->timeout(15)->post('https://api.mistral.ai/v1/chat/completions', [
                    'model' => $model,
                    'max_tokens' => 10,
                    'messages' => [['role' => 'user', 'content' => 'Hi']],
                ]);
                break;

            case 'google':
                $response = Http::timeout(15)->post(
                    "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
                    ['contents' => [['parts' => [['text' => 'Hi']]]]]
                );
                break;

            case 'cohere':
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$apiKey}",
                    'Content-Type' => 'application/json',
                ])->timeout(15)->post('https://api.cohere.com/v2/chat', [
                    'model' => $model,
                    'messages' => [['role' => 'user', 'content' => 'Hi']],
                    'max_tokens' => 10,
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
                throw new \Exception("Provedor '{$providerType}' nao suportado para teste");
        }

        if (!$response->successful()) {
            $error = $response->json('error.message') ?? $response->json('message') ?? $response->body();
            throw new \Exception("API retornou erro: {$error}");
        }

        return ['status' => 'ok', 'response_code' => $response->status()];
    }
}
