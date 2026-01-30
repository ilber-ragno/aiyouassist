<?php

namespace App\Models\Concerns;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Trait para isolamento multi-tenant
 * CRÍTICO: Garante que cada tenant só acessa seus próprios dados
 */
trait BelongsToTenant
{
    protected static function bootBelongsToTenant(): void
    {
        // Global scope para filtrar por tenant
        static::addGlobalScope('tenant', function (Builder $query) {
            if ($tenantId = static::getCurrentTenantId()) {
                $query->where($query->getModel()->getTable() . '.tenant_id', $tenantId);
            }
        });

        // Auto-set tenant_id ao criar
        static::creating(function ($model) {
            if (!$model->tenant_id) {
                $model->tenant_id = static::getCurrentTenantId();
            }

            // Validação crítica: não permitir criar sem tenant
            if (!$model->tenant_id) {
                throw new \RuntimeException(
                    'Cannot create ' . class_basename($model) . ' without tenant context'
                );
            }
        });

        // Validação ao atualizar: não permitir mudar de tenant
        static::updating(function ($model) {
            if ($model->isDirty('tenant_id') && $model->getOriginal('tenant_id')) {
                throw new \RuntimeException(
                    'Cannot change tenant_id of ' . class_basename($model)
                );
            }
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public static function getCurrentTenantId(): ?string
    {
        return app()->bound('current_tenant_id')
            ? app('current_tenant_id')
            : null;
    }

    /**
     * Query sem filtro de tenant (use com cuidado!)
     */
    public static function withoutTenantScope(): Builder
    {
        return static::withoutGlobalScope('tenant');
    }

    /**
     * Query para tenant específico
     */
    public static function forTenant(string $tenantId): Builder
    {
        return static::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId);
    }
}
