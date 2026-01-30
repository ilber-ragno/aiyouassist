<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsappSession extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'phone_number',
        'session_name',
        'status',
        'qr_code',
        'qr_expires_at',
        'last_connected_at',
        'last_error',
    ];

    protected $hidden = [
        'session_data_encrypted',
    ];

    protected $casts = [
        'qr_expires_at' => 'datetime',
        'last_connected_at' => 'datetime',
    ];

    // Status constants
    public const STATUS_DISCONNECTED = 'disconnected';
    public const STATUS_WAITING_QR = 'waiting_qr';
    public const STATUS_CONNECTED = 'connected';
    public const STATUS_RECONNECTING = 'reconnecting';
    public const STATUS_ERROR = 'error';
    public const STATUS_BANNED = 'banned';

    // Relationships
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    // Scopes
    public function scopeConnected($query)
    {
        return $query->where('status', self::STATUS_CONNECTED);
    }

    public function scopeNeedsAttention($query)
    {
        return $query->whereIn('status', [
            self::STATUS_DISCONNECTED,
            self::STATUS_ERROR,
            self::STATUS_BANNED,
        ]);
    }

    // Helpers
    public function isConnected(): bool
    {
        return $this->status === self::STATUS_CONNECTED;
    }

    public function isWaitingQr(): bool
    {
        return $this->status === self::STATUS_WAITING_QR;
    }

    public function hasValidQr(): bool
    {
        return $this->isWaitingQr()
            && $this->qr_code
            && $this->qr_expires_at
            && $this->qr_expires_at->isFuture();
    }

    public function needsReconnection(): bool
    {
        return in_array($this->status, [
            self::STATUS_DISCONNECTED,
            self::STATUS_ERROR,
        ]);
    }

    public function markConnected(string $phoneNumber): void
    {
        $this->update([
            'status' => self::STATUS_CONNECTED,
            'phone_number' => $phoneNumber,
            'qr_code' => null,
            'qr_expires_at' => null,
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

    public function setQrCode(string $qrCode, int $expiresInSeconds = 60): void
    {
        $this->update([
            'status' => self::STATUS_WAITING_QR,
            'qr_code' => $qrCode,
            'qr_expires_at' => now()->addSeconds($expiresInSeconds),
        ]);
    }
}
