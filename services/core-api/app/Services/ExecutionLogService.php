<?php

namespace App\Services;

use App\Models\ExecutionLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

/**
 * Centralized logging service for the execution_logs table.
 * All logs written here are visible to tenants in their Logs page.
 */
class ExecutionLogService
{
    /**
     * Write a log entry to the execution_logs table.
     */
    public function log(
        string $logType,
        string $source,
        string $action,
        array $details = [],
        string $severity = 'info',
        ?string $correlationId = null,
        ?string $tenantId = null
    ): ExecutionLog {
        return ExecutionLog::create([
            'tenant_id' => $tenantId ?? (app()->bound('current_tenant_id') ? app('current_tenant_id') : null),
            'log_type' => $logType,
            'severity' => $severity,
            'source' => $source,
            'action' => $action,
            'details' => $details,
            'correlation_id' => $correlationId ?? Request::header('X-Correlation-ID'),
            'user_id' => Auth::id(),
            'ip_address' => Request::ip(),
            'user_agent' => Request::userAgent(),
        ]);
    }

    // =========================================================================
    // Generic severity helpers (log_type = 'system')
    // =========================================================================

    public function info(string $source, string $action, array $details = [], ?string $tenantId = null): ExecutionLog
    {
        return $this->log('system', $source, $action, $details, 'info', null, $tenantId);
    }

    public function warning(string $source, string $action, array $details = [], ?string $tenantId = null): ExecutionLog
    {
        return $this->log('system', $source, $action, $details, 'warning', null, $tenantId);
    }

    public function error(string $source, string $action, array $details = [], ?string $tenantId = null): ExecutionLog
    {
        return $this->log('system', $source, $action, $details, 'error', null, $tenantId);
    }

    // =========================================================================
    // Typed helpers (specific log_type)
    // =========================================================================

    public function audit(string $action, array $details = [], ?string $source = null): ExecutionLog
    {
        return $this->log('audit', $source ?? 'user', $action, $details, 'info');
    }

    public function webhook(string $action, array $details = [], string $severity = 'info', ?string $tenantId = null): ExecutionLog
    {
        return $this->log('webhook', 'webhook', $action, $details, $severity, null, $tenantId);
    }

    public function integration(string $action, array $details = [], string $severity = 'info'): ExecutionLog
    {
        return $this->log('integration', 'integration', $action, $details, $severity);
    }

    /**
     * Log credit/billing operations.
     */
    public function credit(string $action, array $details = [], string $severity = 'info', ?string $tenantId = null): ExecutionLog
    {
        return $this->log('credit', 'credits', $action, $details, $severity, null, $tenantId);
    }

    /**
     * Log AI/message processing events.
     */
    public function ai(string $action, array $details = [], string $severity = 'info', ?string $tenantId = null): ExecutionLog
    {
        return $this->log('ai', 'ai-agent', $action, $details, $severity, null, $tenantId);
    }

    /**
     * Log WhatsApp message events.
     */
    public function message(string $action, array $details = [], string $severity = 'info', ?string $tenantId = null): ExecutionLog
    {
        return $this->log('message', 'whatsapp', $action, $details, $severity, null, $tenantId);
    }
}
