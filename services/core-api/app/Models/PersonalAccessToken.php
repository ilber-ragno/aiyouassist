<?php

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumToken;

/**
 * CAMADA DE SEGURANÇA 6: Token vinculado ao tenant
 *
 * Extende o token do Sanctum para armazenar e validar o tenant_id.
 * Garante que um token roubado de um tenant não funcione em outro.
 */
class PersonalAccessToken extends SanctumToken
{
    protected $fillable = [
        'name',
        'token',
        'abilities',
        'expires_at',
        'tenant_id',
    ];

    protected static function booted(): void
    {
        // Automatically set tenant_id when creating a token
        static::creating(function (self $token) {
            if (!$token->tenant_id && $token->tokenable) {
                $token->tenant_id = $token->tokenable->tenant_id ?? null;
            }
        });
    }

    /**
     * Override findToken to also validate tenant consistency.
     * If the token's tenant_id doesn't match the user's tenant_id, reject it.
     */
    public static function findToken($token): ?self
    {
        $model = parent::findToken($token);

        if (!$model) {
            return null;
        }

        // If token has a tenant_id, verify it matches the tokenable (user)
        if ($model->tenant_id && $model->tokenable) {
            $userTenantId = $model->tokenable->tenant_id ?? null;
            if ($userTenantId && $model->tenant_id !== $userTenantId) {
                // Token tenant doesn't match user tenant - possible attack
                \App\Services\SecurityAuditService::suspiciousActivity(
                    'TOKEN_TENANT_MISMATCH',
                    [
                        'token_tenant' => $model->tenant_id,
                        'user_tenant' => $userTenantId,
                        'user_id' => $model->tokenable->id ?? null,
                    ]
                );
                return null; // Reject the token
            }
        }

        return $model;
    }
}
