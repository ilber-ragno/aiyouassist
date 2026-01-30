<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * CAMADA DE SEGURANÇA 4: TenantGuard
 *
 * Valida TODAS as respostas JSON antes de enviá-las ao cliente.
 * Detecta e bloqueia vazamento de dados cross-tenant.
 * Se qualquer tenant_id na resposta não bater com o contexto atual,
 * a resposta é bloqueada e um alerta de segurança é gerado.
 */
class TenantGuard
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Only check JSON responses for authenticated, non-admin users
        if (!$response instanceof JsonResponse) {
            return $response;
        }

        $user = $request->user();
        if (!$user) {
            return $response;
        }

        // Admin users are allowed to see cross-tenant data
        if ($user->roles && $user->roles->contains('name', 'admin')) {
            return $response;
        }

        $currentTenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
        if (!$currentTenantId) {
            return $response;
        }

        $data = $response->getData(true);
        if (!is_array($data)) {
            return $response;
        }

        $leaked = $this->scanForLeaks($data, $currentTenantId);

        if (!empty($leaked)) {
            // SECURITY ALERT: Cross-tenant data detected in response
            Log::channel('security')->critical('TENANT_DATA_LEAK_BLOCKED', [
                'user_id' => $user->id,
                'user_email' => $user->email,
                'tenant_id' => $currentTenantId,
                'path' => $request->path(),
                'method' => $request->method(),
                'leaked_tenant_ids' => $leaked,
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return response()->json([
                'error' => 'security_violation',
                'message' => 'A security check failed. This incident has been logged.',
            ], 403);
        }

        return $response;
    }

    /**
     * Recursively scan response data for tenant_id values that don't match current tenant.
     */
    private function scanForLeaks(array $data, string $currentTenantId, int $depth = 0): array
    {
        // Prevent infinite recursion on deeply nested data
        if ($depth > 10) {
            return [];
        }

        $leaked = [];

        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $leaked = array_merge($leaked, $this->scanForLeaks($value, $currentTenantId, $depth + 1));
            } elseif (is_string($value) && $key === 'tenant_id') {
                if ($value !== $currentTenantId) {
                    $leaked[] = $value;
                }
            }
        }

        return array_unique($leaked);
    }
}
