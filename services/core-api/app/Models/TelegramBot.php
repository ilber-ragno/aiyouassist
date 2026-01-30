<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TelegramBot extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'telegram_bots';

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
        'bot_token_encrypted',
        'bot_username',
        'bot_name',
        'status',
        'is_active',
        'last_connected_at',
        'last_error',
    ];

    protected $hidden = [
        'bot_token_encrypted',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'last_connected_at' => 'datetime',
    ];

    // Status constants
    public const STATUS_DISCONNECTED = 'disconnected';
    public const STATUS_CONNECTED = 'connected';
    public const STATUS_ERROR = 'error';

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class, 'telegram_bot_id');
    }

    public function isConnected(): bool
    {
        return $this->status === self::STATUS_CONNECTED;
    }

    public function markConnected(): void
    {
        $this->update([
            'status' => self::STATUS_CONNECTED,
            'last_connected_at' => now(),
            'last_error' => null,
        ]);
    }

    public function markDisconnected(?string $error = null): void
    {
        $this->update([
            'status' => self::STATUS_DISCONNECTED,
            'last_error' => $error,
        ]);
    }

    public function markError(string $error): void
    {
        $this->update([
            'status' => self::STATUS_ERROR,
            'last_error' => $error,
        ]);
    }
}
