<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'price_monthly',
        'price_yearly',
        'currency',
        'is_active',
        'features',
    ];

    protected $casts = [
        'price_monthly' => 'decimal:2',
        'price_yearly' => 'decimal:2',
        'is_active' => 'boolean',
        'features' => 'array',
    ];

    // Relationships
    public function limits(): HasMany
    {
        return $this->hasMany(PlanLimit::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // Helpers
    public function getLimit(string $key): int
    {
        return $this->limits()->where('limit_key', $key)->first()?->limit_value ?? 0;
    }

    public function hasFeature(string $feature): bool
    {
        return (bool) data_get($this->features, $feature, false);
    }

    public function getYearlySavings(): float
    {
        if (!$this->price_yearly) {
            return 0;
        }
        $yearlyIfMonthly = $this->price_monthly * 12;
        return $yearlyIfMonthly - $this->price_yearly;
    }

    public function getYearlySavingsPercent(): float
    {
        $yearlyIfMonthly = $this->price_monthly * 12;
        if ($yearlyIfMonthly == 0) {
            return 0;
        }
        return round(($this->getYearlySavings() / $yearlyIfMonthly) * 100, 1);
    }
}
