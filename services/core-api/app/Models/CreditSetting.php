<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class CreditSetting extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'markup_type',
        'markup_value',
        'usd_to_brl_rate',
        'min_balance_warning_brl',
        'block_on_zero_balance',
    ];

    protected $casts = [
        'markup_value' => 'decimal:4',
        'usd_to_brl_rate' => 'decimal:4',
        'min_balance_warning_brl' => 'decimal:2',
        'block_on_zero_balance' => 'boolean',
    ];

    /**
     * Get the singleton settings instance (cached 10 min).
     */
    public static function current(): self
    {
        return Cache::remember('credit_settings', 600, function () {
            return self::first() ?? new self([
                'markup_type' => 'percentage',
                'markup_value' => 50,
                'usd_to_brl_rate' => 5.50,
                'min_balance_warning_brl' => 1.00,
                'block_on_zero_balance' => true,
            ]);
        });
    }

    public static function clearCache(): void
    {
        Cache::forget('credit_settings');
    }
}
