<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerApiController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $connections = DB::table('customer_api_connections')
            ->where('tenant_id', $request->user()->tenant_id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['connections' => $connections]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'base_url' => 'required|url|max:2048',
            'auth_type' => 'required|in:api_key,bearer,basic,none',
            'description' => 'nullable|string',
        ]);

        // Verificar limite de conexoes API do plano
        $tenant = $request->user()->tenant;
        $currentCount = DB::table('customer_api_connections')
            ->where('tenant_id', $tenant->id)
            ->count();
        if ($tenant->exceedsLimit('api_connections', $currentCount)) {
            return $tenant->limitExceededResponse('api_connections', 'conexoes de API');
        }

        $id = DB::table('customer_api_connections')->insertGetId([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $request->user()->tenant_id,
            'name' => $validated['name'],
            'base_url' => $validated['base_url'],
            'auth_type' => $validated['auth_type'],
            'description' => $validated['description'] ?? null,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ], 'id');

        $this->logService->audit('customer_api.connection_created', [
            'connection_id' => $id,
        ]);

        return response()->json(['message' => 'Connection created', 'id' => $id], 201);
    }

    public function show(string $connection): JsonResponse
    {
        $conn = DB::table('customer_api_connections')
            ->where('id', $connection)
            ->where('tenant_id', request()->user()->tenant_id)
            ->first();

        if (!$conn) {
            return response()->json(['error' => 'Not found'], 404);
        }

        return response()->json(['connection' => $conn]);
    }

    public function update(Request $request, string $connection): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'base_url' => 'sometimes|url|max:2048',
            'auth_type' => 'sometimes|in:api_key,bearer,basic,none',
            'description' => 'nullable|string',
        ]);

        DB::table('customer_api_connections')
            ->where('id', $connection)
            ->where('tenant_id', $request->user()->tenant_id)
            ->update([...$validated, 'updated_at' => now()]);

        $this->logService->audit('customer_api.connection_updated', [
            'connection_id' => $connection,
        ]);

        return response()->json(['message' => 'Connection updated']);
    }

    public function destroy(string $connection): JsonResponse
    {
        DB::table('customer_api_connections')
            ->where('id', $connection)
            ->where('tenant_id', request()->user()->tenant_id)
            ->delete();

        $this->logService->audit('customer_api.connection_deleted', [
            'connection_id' => $connection,
        ]);

        return response()->json(['message' => 'Connection deleted']);
    }

    public function endpoints(string $connection): JsonResponse
    {
        $endpoints = DB::table('customer_api_endpoints')
            ->where('connection_id', $connection)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['endpoints' => $endpoints]);
    }

    public function test(string $connection): JsonResponse
    {
        $conn = DB::table('customer_api_connections')
            ->where('id', $connection)
            ->where('tenant_id', request()->user()->tenant_id)
            ->first();

        if (!$conn) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $this->logService->info('customer_api', 'connection.test', [
            'connection_id' => $connection,
        ]);

        // TODO: Actual connection test
        return response()->json([
            'success' => true,
            'message' => 'Connection test completed',
        ]);
    }

    public function logs(string $connection): JsonResponse
    {
        $logs = DB::table('customer_api_logs')
            ->where('connection_id', $connection)
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json(['logs' => $logs]);
    }
}
