<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckTenantBilling
{
    /**
     * Routes excluded from billing check (allow user to pay)
     */
    private const EXCLUDED_PREFIXES = [
        'api/subscription',
        'api/auth',
        'api/webhooks',
        'api/plans',
        'api/health',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        // Admin users bypass all billing restrictions
        $user = $request->user();
        if ($user && $user->roles && $user->roles->contains('name', 'admin')) {
            return $next($request);
        }

        // Skip check for excluded routes
        $path = $request->path();
        foreach (self::EXCLUDED_PREFIXES as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return $next($request);
            }
        }

        $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
        if (!$tenantId) {
            return $next($request);
        }

        $tenant = Tenant::find($tenantId);
        if ($tenant && $tenant->is_blocked) {
            return response()->json([
                'error' => 'payment_required',
                'message' => $tenant->blocked_reason ?? 'Sua conta esta bloqueada por falta de pagamento. Acesse a area de assinatura para regularizar.',
                'blocked_at' => $tenant->blocked_at,
            ], 402);
        }

        return $next($request);
    }
}
