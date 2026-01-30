<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CreditTransaction extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'type',
        'amount_brl',
        'balance_after_brl',
        'description',
        'reference_type',
        'reference_id',
        'metadata',
        'credit_source',
    ];

    protected $casts = [
        'amount_brl' => 'decimal:4',
        'balance_after_brl' => 'decimal:4',
        'metadata' => 'array',
        'created_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function scopeForTenant($query, string $tenantId)
    {
        return $query->where('tenant_id', $tenantId);
    }
}
