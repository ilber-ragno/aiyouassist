<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantCredit extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'balance_brl',
        'total_purchased_brl',
        'total_consumed_brl',
        'plan_balance_brl',
        'addon_balance_brl',
        'plan_credits_reset_at',
        'plan_credits_granted_brl',
    ];

    protected $casts = [
        'balance_brl' => 'decimal:4',
        'total_purchased_brl' => 'decimal:4',
        'total_consumed_brl' => 'decimal:4',
        'plan_balance_brl' => 'decimal:4',
        'addon_balance_brl' => 'decimal:4',
        'plan_credits_granted_brl' => 'decimal:4',
        'plan_credits_reset_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function totalBalance(): float
    {
        return (float) $this->plan_balance_brl + (float) $this->addon_balance_brl;
    }

    public function isPlanCreditExhausted(): bool
    {
        return (float) $this->plan_balance_brl <= 0;
    }
}
