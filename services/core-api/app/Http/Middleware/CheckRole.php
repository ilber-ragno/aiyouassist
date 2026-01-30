<?php

namespace App\Http\Middleware;

use App\Services\SecurityAuditService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'error' => 'unauthenticated',
                'message' => 'Authentication required',
            ], 401);
        }

        $tenantId = $request->attributes->get('tenant_id') ?? app('current_tenant_id', null);

        foreach ($roles as $role) {
            // Verify role exists AND belongs to the user's tenant (or is system-wide)
            $hasRole = $user->roles()
                ->where('name', $role)
                ->where(function ($q) use ($tenantId) {
                    $q->where('tenant_id', $tenantId)
                      ->orWhereNull('tenant_id');
                })
                ->exists();

            if ($hasRole) {
                return $next($request);
            }
        }

        SecurityAuditService::permissionDenied(
            $user->id, $user->email,
            $tenantId ?? 'unknown',
            implode(',', $roles)
        );

        return response()->json([
            'error' => 'forbidden',
            'message' => 'You do not have the required role to access this resource.',
        ], 403);
    }
}
