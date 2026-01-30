<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExecutionLogService;
use App\Services\Billing\BillingProviderFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class SettingsController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    /**
     * Get all settings
     */
    public function index(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;

        return response()->json([
            'company' => [
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'settings' => $tenant->settings ?? [],
            ],
            'notifications' => $tenant->getSetting('notifications', [
                'email_alerts' => true,
                'webhook_failures' => true,
                'usage_warnings' => true,
            ]),
        ]);
    }

    /**
     * Update company data
     */
    public function updateCompany(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
        ]);

        $tenant = $request->user()->tenant;
        $tenant->update($validated);

        $this->logService->audit('settings.company_updated', $validated);

        return response()->json([
            'message' => 'Company settings updated',
            'company' => [
                'name' => $tenant->name,
                'slug' => $tenant->slug,
            ],
        ]);
    }

    /**
     * Update notification preferences
     */
    public function updateNotifications(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email_alerts' => 'sometimes|boolean',
            'webhook_failures' => 'sometimes|boolean',
            'usage_warnings' => 'sometimes|boolean',
        ]);

        $tenant = $request->user()->tenant;
        $tenant->setSetting('notifications', $validated);
        $tenant->save();

        $this->logService->audit('settings.notifications_updated', $validated);

        return response()->json([
            'message' => 'Notification settings updated',
        ]);
    }

    /**
     * Get masked credentials
     */
    public function credentials(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;
        $settings = $tenant->settings ?? [];

        $creds = [];
        $credKeys = ['asaas_key', 'stripe_key', 'webhook_secret'];

        foreach ($credKeys as $key) {
            $value = data_get($settings, "credentials.{$key}");
            if ($value) {
                try {
                    $decrypted = decrypt($value);
                    $creds[$key] = str_repeat('*', max(0, strlen($decrypted) - 4)) . substr($decrypted, -4);
                } catch (\Exception $e) {
                    $creds[$key] = '****configurado';
                }
            } else {
                $creds[$key] = null;
            }
        }

        return response()->json([
            'credentials' => $creds,
            'billing_provider' => $tenant->billing_provider ?? 'asaas',
        ]);
    }

    /**
     * Update credentials
     */
    public function updateCredentials(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'asaas_key' => 'nullable|string',
            'stripe_key' => 'nullable|string',
            'webhook_secret' => 'nullable|string',
            'billing_provider' => 'nullable|in:asaas,stripe',
        ]);

        $tenant = $request->user()->tenant;

        foreach (['asaas_key', 'stripe_key', 'webhook_secret'] as $key) {
            if (isset($validated[$key]) && $validated[$key] !== null && !str_starts_with($validated[$key], '****')) {
                $tenant->setSetting("credentials.{$key}", encrypt($validated[$key]));
            }
        }

        if (isset($validated['billing_provider'])) {
            $tenant->billing_provider = $validated['billing_provider'];
        }

        $tenant->save();

        $this->logService->audit('settings.credentials_updated', [
            'keys' => array_keys(array_filter($validated, fn($v) => $v !== null)),
        ]);

        return response()->json(['message' => 'Credenciais atualizadas']);
    }

    /**
     * Test billing credentials
     */
    public function testCredentials(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;
        $provider = $request->input('provider', $tenant->billing_provider ?? 'asaas');

        try {
            $settings = $tenant->settings ?? [];
            $keyField = $provider === 'stripe' ? 'stripe_key' : 'asaas_key';
            $encryptedKey = data_get($settings, "credentials.{$keyField}");

            if (!$encryptedKey) {
                return response()->json([
                    'success' => false,
                    'message' => 'Chave de API nao configurada',
                ], 422);
            }

            $apiKey = decrypt($encryptedKey);

            if ($provider === 'asaas') {
                $response = Http::withHeaders(['access_token' => $apiKey])
                    ->get(config('services.asaas.url', 'https://api.asaas.com/v3') . '/finance/balance');
                $success = $response->successful();
            } else {
                \Stripe\Stripe::setApiKey($apiKey);
                \Stripe\Balance::retrieve();
                $success = true;
            }

            return response()->json([
                'success' => $success,
                'message' => $success ? 'Conexao OK' : 'Falha na conexao',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Erro: ' . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Get AI settings
     */
    public function aiSettings(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;
        $settings = $tenant->settings ?? [];

        $aiProvider = data_get($settings, 'ai.provider', 'anthropic');
        $aiModel = data_get($settings, 'ai.model', 'claude-sonnet-4-20250514');
        $aiKeyEncrypted = data_get($settings, 'ai.api_key');

        $maskedKey = null;
        if ($aiKeyEncrypted) {
            try {
                $decrypted = decrypt($aiKeyEncrypted);
                $maskedKey = substr($decrypted, 0, 8) . '...' . substr($decrypted, -4);
            } catch (\Exception $e) {
                $maskedKey = '****configurado';
            }
        }

        return response()->json([
            'ai' => [
                'provider' => $aiProvider,
                'model' => $aiModel,
                'api_key_masked' => $maskedKey,
                'has_key' => !empty($aiKeyEncrypted),
            ],
            'available_providers' => [
                ['id' => 'anthropic', 'name' => 'Claude (Anthropic)', 'models' => [
                    'claude-sonnet-4-20250514',
                    'claude-opus-4-20250514',
                    'claude-haiku-3-20250314',
                ]],
                ['id' => 'openai', 'name' => 'ChatGPT (OpenAI)', 'models' => [
                    'gpt-4o',
                    'gpt-4o-mini',
                    'gpt-4-turbo',
                ]],
            ],
        ]);
    }

    /**
     * Update AI settings
     */
    public function updateAiSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider' => 'required|in:anthropic,openai',
            'model' => 'required|string|max:100',
            'api_key' => 'nullable|string',
        ]);

        $tenant = $request->user()->tenant;

        $tenant->setSetting('ai.provider', $validated['provider']);
        $tenant->setSetting('ai.model', $validated['model']);

        if (!empty($validated['api_key']) && !str_starts_with($validated['api_key'], '****')) {
            $tenant->setSetting('ai.api_key', encrypt($validated['api_key']));
        }

        $tenant->save();

        $this->logService->audit('settings.ai_updated', [
            'provider' => $validated['provider'],
            'model' => $validated['model'],
        ]);

        return response()->json(['message' => 'Configuracoes de IA atualizadas']);
    }

    /**
     * Test AI connection
     */
    public function testAiConnection(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;
        $settings = $tenant->settings ?? [];

        $provider = data_get($settings, 'ai.provider', 'anthropic');
        $model = data_get($settings, 'ai.model', 'claude-sonnet-4-20250514');
        $encryptedKey = data_get($settings, 'ai.api_key');

        if (!$encryptedKey) {
            return response()->json([
                'success' => false,
                'message' => 'Chave de API nao configurada. Configure sua API key primeiro.',
            ], 422);
        }

        try {
            $apiKey = decrypt($encryptedKey);

            if ($provider === 'anthropic') {
                $response = Http::withHeaders([
                    'x-api-key' => $apiKey,
                    'anthropic-version' => '2023-06-01',
                    'content-type' => 'application/json',
                ])->post('https://api.anthropic.com/v1/messages', [
                    'model' => $model,
                    'max_tokens' => 50,
                    'messages' => [
                        ['role' => 'user', 'content' => 'Responda apenas: OK'],
                    ],
                ]);

                if ($response->successful()) {
                    return response()->json([
                        'success' => true,
                        'message' => 'Conexao com Claude OK! Modelo: ' . $model,
                        'response' => $response->json('content.0.text'),
                    ]);
                }

                return response()->json([
                    'success' => false,
                    'message' => 'Erro na API Anthropic: ' . ($response->json('error.message') ?? $response->status()),
                ], 422);
            } else {
                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $apiKey,
                    'Content-Type' => 'application/json',
                ])->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $model,
                    'max_tokens' => 50,
                    'messages' => [
                        ['role' => 'user', 'content' => 'Responda apenas: OK'],
                    ],
                ]);

                if ($response->successful()) {
                    return response()->json([
                        'success' => true,
                        'message' => 'Conexao com OpenAI OK! Modelo: ' . $model,
                        'response' => $response->json('choices.0.message.content'),
                    ]);
                }

                return response()->json([
                    'success' => false,
                    'message' => 'Erro na API OpenAI: ' . ($response->json('error.message') ?? $response->status()),
                ], 422);
            }
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Erro: ' . $e->getMessage(),
            ], 422);
        }
    }
}
