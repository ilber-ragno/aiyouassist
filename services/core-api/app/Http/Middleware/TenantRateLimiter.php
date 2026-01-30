<?php

namespace App\Http\Middleware;

use App\Services\SecurityAuditService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * CAMADA DE SEGURANÇA 7: Rate Limiting por Tenant + Detecção de Anomalias
 *
 * - Rate limit por tenant (não por IP, evitando bypass com proxies)
 * - Detecta padrões suspeitos: muitas 403s, tentativas em rotas admin, etc.
 * - Bloqueia automaticamente após threshold de alertas
 */
class TenantRateLimiter
{
    private const MAX_REQUESTS_PER_MINUTE = 120;
    private const MAX_FAILED_ATTEMPTS = 10;       // 403/401 em 5 minutos
    private const BLOCK_DURATION_SECONDS = 300;   // 5 minutos de bloqueio
    private const ANOMALY_WINDOW_SECONDS = 300;   // Janela de 5 minutos

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
        $key = $tenantId ?? $request->ip();

        // Check if tenant/IP is temporarily blocked
        if (Cache::get("security:blocked:{$key}")) {
            SecurityAuditService::suspiciousActivity('REQUEST_WHILE_BLOCKED', [
                'tenant_id' => $tenantId,
                'ip' => $request->ip(),
            ]);

            return response()->json([
                'error' => 'too_many_requests',
                'message' => 'Acesso temporariamente bloqueado por atividade suspeita.',
            ], 429);
        }

        // Rate limit per tenant
        $rateLimitKey = "ratelimit:tenant:{$key}";
        $requests = (int) Cache::get($rateLimitKey, 0);

        if ($requests >= self::MAX_REQUESTS_PER_MINUTE) {
            SecurityAuditService::rateLimitExceeded(
                $user?->id,
                $tenantId
            );

            return response()->json([
                'error' => 'too_many_requests',
                'message' => 'Limite de requisições excedido. Aguarde um momento.',
                'retry_after' => 60,
            ], 429);
        }

        Cache::put($rateLimitKey, $requests + 1, 60);

        // Process the request
        $response = $next($request);

        // Track failed attempts (anomaly detection)
        $statusCode = $response->getStatusCode();
        if (in_array($statusCode, [401, 403, 422])) {
            $this->trackFailedAttempt($key, $tenantId, $statusCode, $request);
        }

        // Add rate limit headers
        $response->headers->set('X-RateLimit-Limit', self::MAX_REQUESTS_PER_MINUTE);
        $response->headers->set('X-RateLimit-Remaining', max(0, self::MAX_REQUESTS_PER_MINUTE - $requests - 1));

        return $response;
    }

    private function trackFailedAttempt(string $key, ?string $tenantId, int $statusCode, Request $request): void
    {
        $failKey = "security:fails:{$key}";
        $fails = (int) Cache::get($failKey, 0);
        $fails++;

        Cache::put($failKey, $fails, self::ANOMALY_WINDOW_SECONDS);

        if ($fails >= self::MAX_FAILED_ATTEMPTS) {
            // Block the tenant/IP
            Cache::put("security:blocked:{$key}", true, self::BLOCK_DURATION_SECONDS);

            SecurityAuditService::suspiciousActivity('AUTO_BLOCKED_EXCESSIVE_FAILURES', [
                'tenant_id' => $tenantId,
                'ip' => $request->ip(),
                'failed_count' => $fails,
                'last_status' => $statusCode,
                'last_path' => $request->path(),
            ]);
        }
    }
}
