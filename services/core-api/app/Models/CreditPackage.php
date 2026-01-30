<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CreditPackage extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'description',
        'price_brl',
        'credit_amount_brl',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'price_brl' => 'decimal:2',
        'credit_amount_brl' => 'decimal:2',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order')->orderBy('price_brl');
    }
}
