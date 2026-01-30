<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware para garantir que o tenant está ativo
 * Bloqueia acesso para tenants suspensos ou cancelados
 */
class EnsureTenantIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        // Admin users bypass tenant restrictions
        $user = $request->user();
        if ($user && $user->roles && $user->roles->contains('name', 'admin')) {
            return $next($request);
        }

        $tenantId = app('current_tenant_id');

        if (!$tenantId) {
            return response()->json([
                'error' => 'tenant_required',
                'message' => 'Tenant context is required',
            ], 400);
        }

        $tenant = Tenant::find($tenantId);

        if (!$tenant) {
            return response()->json([
                'error' => 'tenant_not_found',
                'message' => 'Tenant not found',
            ], 404);
        }

        if (!$tenant->isActive()) {
            $message = match ($tenant->status) {
                Tenant::STATUS_SUSPENDED => 'Your account has been suspended. Please contact support.',
                Tenant::STATUS_CANCELLED => 'Your account has been cancelled.',
                default => 'Your account is not active.',
            };

            return response()->json([
                'error' => 'tenant_inactive',
                'message' => $message,
                'status' => $tenant->status,
            ], 403);
        }

        // Add tenant to request
        $request->attributes->set('tenant', $tenant);

        return $next($request);
    }
}
