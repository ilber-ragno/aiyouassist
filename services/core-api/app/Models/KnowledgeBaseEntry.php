<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KnowledgeBaseEntry extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'knowledge_base_entries';

    protected static function booted(): void
    {
        static::addGlobalScope('tenant', function (Builder $query) {
            $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
            if ($tenantId) {
                $query->where($query->getModel()->getTable() . '.tenant_id', $tenantId);
            }
        });
    }

    protected $fillable = [
        'tenant_id',
        'title',
        'content',
        'category',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeByCategory(Builder $query, string $category): Builder
    {
        return $query->where('category', $category);
    }
}
