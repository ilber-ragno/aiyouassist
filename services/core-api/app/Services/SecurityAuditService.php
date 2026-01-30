<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CAMADA DE SEGURANÇA 5: SecurityAuditService
 *
 * Registra todas as operações sensíveis em uma tabela separada
 * que NÃO tem RLS - sempre acessível para escrita.
 *
 * Eventos registrados:
 * - LOGIN_SUCCESS / LOGIN_FAILED
 * - ADMIN_CROSS_TENANT_ACCESS
 * - TENANT_SCOPE_BYPASS
 * - PERMISSION_DENIED
 * - TENANT_DATA_LEAK_BLOCKED
 * - SUSPICIOUS_ACTIVITY
 * - TOKEN_CREATED / TOKEN_REVOKED
 * - RATE_LIMIT_EXCEEDED
 */
class SecurityAuditService
{
    public const SEVERITY_INFO = 'info';
    public const SEVERITY_WARNING = 'warning';
    public const SEVERITY_CRITICAL = 'critical';
    public const SEVERITY_ALERT = 'alert';

    public static function log(
        string $eventType,
        string $severity = 'info',
        array $details = [],
        ?string $userId = null,
        ?string $userEmail = null,
        ?string $tenantId = null,
        ?string $targetTenantId = null,
    ): void {
        try {
            $request = request();

            DB::table('security_audit_logs')->insert([
                'id' => Str::uuid()->toString(),
                'event_type' => $eventType,
                'severity' => $severity,
                'user_id' => $userId,
                'user_email' => $userEmail,
                'tenant_id' => $tenantId,
                'target_tenant_id' => $targetTenantId,
                'ip_address' => $request?->ip(),
                'user_agent' => $request?->userAgent(),
                'path' => $request?->path(),
                'method' => $request?->method(),
                'details' => json_encode($details),
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            // Never let audit logging break the application
            \Log::error('SecurityAudit write failed: ' . $e->getMessage());
        }
    }

    public static function loginSuccess(string $userId, string $email, string $tenantId): void
    {
        static::log('LOGIN_SUCCESS', self::SEVERITY_INFO, [], $userId, $email, $tenantId);
    }

    public static function loginFailed(string $email, string $reason = 'invalid_credentials'): void
    {
        static::log('LOGIN_FAILED', self::SEVERITY_WARNING, [
            'email' => $email,
            'reason' => $reason,
        ]);
    }

    public static function adminCrossTenantAccess(string $userId, string $email, string $adminTenantId, string $targetTenantId, string $action): void
    {
        static::log('ADMIN_CROSS_TENANT_ACCESS', self::SEVERITY_WARNING, [
            'action' => $action,
        ], $userId, $email, $adminTenantId, $targetTenantId);
    }

    public static function permissionDenied(string $userId, string $email, string $tenantId, string $requiredRole): void
    {
        static::log('PERMISSION_DENIED', self::SEVERITY_WARNING, [
            'required_role' => $requiredRole,
        ], $userId, $email, $tenantId);
    }

    public static function suspiciousActivity(string $reason, array $context = []): void
    {
        static::log('SUSPICIOUS_ACTIVITY', self::SEVERITY_CRITICAL, array_merge([
            'reason' => $reason,
        ], $context));
    }

    public static function rateLimitExceeded(?string $userId, ?string $tenantId): void
    {
        static::log('RATE_LIMIT_EXCEEDED', self::SEVERITY_WARNING, [], $userId, null, $tenantId);
    }
}
