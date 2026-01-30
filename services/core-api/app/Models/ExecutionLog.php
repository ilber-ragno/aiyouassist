<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ExecutionLog - Unified logging visible to tenants.
 *
 * Does NOT use BelongsToTenant trait because:
 * 1. Some logs are system-level (no tenant) - e.g., webhook auth failures
 * 2. Logs from internal services need explicit tenant_id (no request context)
 * 3. The creating hook in BelongsToTenant would block system-level logs
 *
 * Instead, applies tenant scoping manually via a global scope.
 */
class ExecutionLog extends Model
{
    use HasUuids;

    const UPDATED_AT = null;

    protected $fillable = [
        'tenant_id',
        'log_type',
        'severity',
        'source',
        'action',
        'details',
        'correlation_id',
        'user_id',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'details' => 'array',
    ];

    protected static function booted(): void
    {
        // Auto-scope reads to current tenant (if in tenant context)
        static::addGlobalScope('tenant', function (Builder $query) {
            $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
            if ($tenantId) {
                $query->where('execution_logs.tenant_id', $tenantId);
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
