<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware para definir contexto do tenant
 * CRÍTICO: Garante isolamento de dados entre clientes
 */
class TenantContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenantId = $this->resolveTenantId($request);

        if ($tenantId) {
            // Set in Laravel container
            app()->instance('current_tenant_id', $tenantId);

            // Set in PostgreSQL session for RLS
            DB::statement("SELECT set_config('app.current_tenant_id', ?, false)", [$tenantId]);

            // Add to request for easy access
            $request->attributes->set('tenant_id', $tenantId);
        }

        $response = $next($request);

        // Clear context after request
        if ($tenantId) {
            DB::statement("SELECT set_config('app.current_tenant_id', '', false)");
        }

        return $response;
    }

    protected function resolveTenantId(Request $request): ?string
    {
        // 1. From authenticated user
        if ($user = $request->user()) {
            return $user->tenant_id;
        }

        // 2. From header (for service-to-service calls - ONLY with valid internal key)
        if ($headerTenantId = $request->header('X-Tenant-ID')) {
            $internalKey = $request->header('X-Internal-Key');
            $expectedKey = config('services.claudbot.internal_key');
            if ($internalKey && $expectedKey && hash_equals($expectedKey, $internalKey)) {
                return $headerTenantId;
            }
            // Reject: header without valid internal key
            return null;
        }

        // 3. From route parameter
        if ($routeTenantId = $request->route('tenant_id')) {
            return $routeTenantId;
        }

        return null;
    }
}
