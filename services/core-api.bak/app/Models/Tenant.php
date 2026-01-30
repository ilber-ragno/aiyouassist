<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Tenant Model - Base de isolamento multi-tenant
 * IMPORTANTE: Cada cliente = 1 tenant completamente isolado
 */
class Tenant extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'name',
        'slug',
        'status',
        'settings',
    ];

    protected $casts = [
        'settings' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    protected $attributes = [
        'status' => 'trial',
        'settings' => '{}',
    ];

    // Status constants
    public const STATUS_ACTIVE = 'active';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_TRIAL = 'trial';

    // Relationships
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function subscription(): HasOne
    {
        return $this->hasOne(Subscription::class)->latest();
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function whatsappSessions(): HasMany
    {
        return $this->hasMany(WhatsappSession::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    public function agentSettings(): HasMany
    {
        return $this->hasMany(AgentSetting::class);
    }

    public function apiConnections(): HasMany
    {
        return $this->hasMany(CustomerApiConnection::class);
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('status', self::STATUS_ACTIVE);
    }

    public function scopeTrial($query)
    {
        return $query->where('status', self::STATUS_TRIAL);
    }

    // Helpers
    public function isActive(): bool
    {
        return in_array($this->status, [self::STATUS_ACTIVE, self::STATUS_TRIAL]);
    }

    public function isSuspended(): bool
    {
        return $this->status === self::STATUS_SUSPENDED;
    }

    public function getSetting(string $key, mixed $default = null): mixed
    {
        return data_get($this->settings, $key, $default);
    }

    public function setSetting(string $key, mixed $value): void
    {
        $settings = $this->settings ?? [];
        data_set($settings, $key, $value);
        $this->settings = $settings;
    }

    public function getCurrentPlan(): ?Plan
    {
        return $this->subscription?->plan;
    }

    public function hasFeature(string $feature): bool
    {
        $plan = $this->getCurrentPlan();
        if (!$plan) {
            return false;
        }
        return (bool) data_get($plan->features, $feature, false);
    }

    public function getLimit(string $limitKey): int
    {
        $plan = $this->getCurrentPlan();
        if (!$plan) {
            return 0;
        }
        $limit = $plan->limits()->where('limit_key', $limitKey)->first();
        return $limit?->limit_value ?? 0;
    }
}
