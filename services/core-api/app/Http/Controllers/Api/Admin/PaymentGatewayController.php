<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\PaymentGatewaySetting;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class PaymentGatewayController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    /**
     * List all configured gateways (masked keys)
     */
    public function index(): JsonResponse
    {
        $gateways = PaymentGatewaySetting::all();

        // Ensure Asaas and Stripe entries exist
        $providers = ['asaas', 'stripe'];
        foreach ($providers as $provider) {
            if (!$gateways->where('provider', $provider)->first()) {
                $gateways->push(PaymentGatewaySetting::create([
                    'provider' => $provider,
                    'is_active' => false,
                    'sandbox' => false,
                    'metadata' => [],
                ]));
            }
        }

        $result = $gateways->map(fn($gw) => [
            'id' => $gw->id,
            'provider' => $gw->provider,
            'is_active' => $gw->is_active,
            'has_api_key' => !empty($gw->api_key_encrypted),
            'api_key_masked' => $gw->getMaskedApiKey(),
            'has_webhook_secret' => !empty($gw->webhook_secret_encrypted),
            'webhook_secret_masked' => $gw->getMaskedWebhookSecret(),
            'sandbox' => $gw->sandbox,
            'metadata' => $gw->metadata ?? [],
            'updated_at' => $gw->updated_at,
        ]);

        return response()->json(['gateways' => $result]);
    }

    /**
     * Update gateway configuration
     */
    public function update(Request $request, string $provider): JsonResponse
    {
        $validated = $request->validate([
            'api_key' => 'nullable|string',
            'webhook_secret' => 'nullable|string',
            'is_active' => 'nullable|boolean',
            'sandbox' => 'nullable|boolean',
        ]);

        $gateway = PaymentGatewaySetting::firstOrCreate(
            ['provider' => $provider],
            ['is_active' => false, 'sandbox' => false, 'metadata' => []]
        );

        $updates = [];

        if (!empty($validated['api_key'])) {
            $updates['api_key_encrypted'] = encrypt($validated['api_key']);
        }
        if (!empty($validated['webhook_secret'])) {
            $updates['webhook_secret_encrypted'] = encrypt($validated['webhook_secret']);
        }
        if (isset($validated['is_active'])) {
            $updates['is_active'] = $validated['is_active'];
        }
        if (isset($validated['sandbox'])) {
            $updates['sandbox'] = $validated['sandbox'];
        }

        $updates['updated_at'] = now();
        $gateway->update($updates);

        $this->logService->audit('admin.payment_gateway.updated', [
            'provider' => $provider,
            'changes' => array_keys($updates),
        ]);

        return response()->json([
            'message' => 'Gateway atualizado com sucesso',
            'gateway' => [
                'id' => $gateway->id,
                'provider' => $gateway->provider,
                'is_active' => $gateway->is_active,
                'has_api_key' => !empty($gateway->api_key_encrypted),
                'api_key_masked' => $gateway->getMaskedApiKey(),
                'has_webhook_secret' => !empty($gateway->webhook_secret_encrypted),
                'webhook_secret_masked' => $gateway->getMaskedWebhookSecret(),
                'sandbox' => $gateway->sandbox,
            ],
        ]);
    }

    /**
     * Test gateway connection
     */
    public function test(string $provider): JsonResponse
    {
        $gateway = PaymentGatewaySetting::where('provider', $provider)->first();
        if (!$gateway || !$gateway->api_key_encrypted) {
            return response()->json(['success' => false, 'message' => 'Chave API não configurada'], 422);
        }

        $apiKey = $gateway->getDecryptedApiKey();

        try {
            if ($provider === 'asaas') {
                $baseUrl = $gateway->sandbox
                    ? 'https://sandbox.asaas.com/api/v3'
                    : 'https://api.asaas.com/v3';

                $response = Http::withHeaders([
                    'access_token' => $apiKey,
                ])->timeout(10)->get("{$baseUrl}/finance/balance");

                if ($response->successful()) {
                    return response()->json([
                        'success' => true,
                        'message' => 'Conexão com Asaas estabelecida com sucesso',
                        'details' => ['balance' => $response->json('balance') ?? 'OK'],
                    ]);
                }
                throw new \Exception($response->json('errors.0.description') ?? 'Erro desconhecido');
            }

            if ($provider === 'stripe') {
                $response = Http::withHeaders([
                    'Authorization' => "Bearer {$apiKey}",
                ])->timeout(10)->get('https://api.stripe.com/v1/balance');

                if ($response->successful()) {
                    return response()->json([
                        'success' => true,
                        'message' => 'Conexão com Stripe estabelecida com sucesso',
                    ]);
                }
                throw new \Exception($response->json('error.message') ?? 'Erro desconhecido');
            }

            return response()->json(['success' => false, 'message' => 'Provedor não suportado'], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Falha na conexão: ' . $e->getMessage(),
            ], 422);
        }
    }
}
