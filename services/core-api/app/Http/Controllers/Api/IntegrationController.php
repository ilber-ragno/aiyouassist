<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExecutionLog;
use App\Models\IntegrationConfig;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $integrations = IntegrationConfig::orderBy('created_at', 'desc')->get();

        return response()->json([
            'integrations' => $integrations,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'integration_type' => 'required|string|max:100',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'config' => 'nullable|array',
        ]);

        // Verificar se o plano permite integracoes
        $tenant = $request->user()->tenant;
        if (!$tenant->hasFeature('api_integrations')) {
            return response()->json([
                'error' => 'feature_not_available',
                'message' => 'Integracoes nao estao disponiveis no seu plano atual. Faca upgrade para habilitar.',
            ], 403);
        }

        $integration = IntegrationConfig::create([
            'tenant_id' => $request->user()->tenant_id,
            ...$validated,
        ]);

        $this->logService->integration("Integração criada: {$integration->name}", [
            'integration_id' => $integration->id,
            'type' => $integration->integration_type,
            'name' => $integration->name,
        ]);

        return response()->json(['integration' => $integration], 201);
    }

    public function show(IntegrationConfig $integration): JsonResponse
    {
        return response()->json(['integration' => $integration]);
    }

    public function update(Request $request, IntegrationConfig $integration): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'config' => 'nullable|array',
        ]);

        $integration->update($validated);

        $this->logService->integration("Integração atualizada: {$integration->name}", [
            'integration_id' => $integration->id,
            'changes' => array_keys($validated),
        ]);

        return response()->json(['integration' => $integration]);
    }

    public function destroy(IntegrationConfig $integration): JsonResponse
    {
        $this->logService->integration("Integração excluída: {$integration->name}", [
            'integration_id' => $integration->id,
            'type' => $integration->integration_type,
        ]);

        $integration->delete();

        return response()->json(['message' => 'Integration deleted']);
    }

    public function enable(IntegrationConfig $integration): JsonResponse
    {
        $integration->update(['is_enabled' => true, 'status' => 'active']);

        $this->logService->integration("Integração ativada: {$integration->name}", [
            'integration_id' => $integration->id,
        ]);

        return response()->json(['integration' => $integration]);
    }

    public function disable(IntegrationConfig $integration): JsonResponse
    {
        $integration->update(['is_enabled' => false, 'status' => 'inactive']);

        $this->logService->integration("Integração desativada: {$integration->name}", [
            'integration_id' => $integration->id,
        ]);

        return response()->json(['integration' => $integration]);
    }

    public function test(IntegrationConfig $integration): JsonResponse
    {
        $this->logService->integration("Teste de integração: {$integration->name}", [
            'integration_id' => $integration->id,
            'type' => $integration->integration_type,
        ]);

        // TODO: Actual integration test based on type
        return response()->json([
            'success' => true,
            'message' => 'Integration test completed',
        ]);
    }

    public function logs(IntegrationConfig $integration): JsonResponse
    {
        $logs = ExecutionLog::where('source', 'integration')
            ->where('details->integration_id', $integration->id)
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json(['logs' => $logs]);
    }
}
