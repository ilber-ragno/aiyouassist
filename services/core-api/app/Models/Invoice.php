<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invoice extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'subscription_id',
        'external_id',
        'status',
        'amount',
        'currency',
        'due_date',
        'paid_at',
        'invoice_url',
        'reminder_sent_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'due_date' => 'date',
        'paid_at' => 'datetime',
        'reminder_sent_at' => 'array',
    ];

    // Status constants
    public const STATUS_PENDING = 'pending';
    public const STATUS_PAID = 'paid';
    public const STATUS_FAILED = 'failed';
    public const STATUS_REFUNDED = 'refunded';
    public const STATUS_CANCELLED = 'cancelled';

    // Relationships
    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    public function scopePaid($query)
    {
        return $query->where('status', self::STATUS_PAID);
    }

    public function scopeOverdue($query)
    {
        return $query->where('status', self::STATUS_PENDING)
            ->where('due_date', '<', now());
    }

    public function scopeFailed($query)
    {
        return $query->where('status', self::STATUS_FAILED);
    }

    // Helpers
    public function isPaid(): bool
    {
        return $this->status === self::STATUS_PAID;
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isOverdue(): bool
    {
        return $this->status === self::STATUS_PENDING && $this->due_date?->isPast();
    }

    public function markAsPaid(): void
    {
        $this->update([
            'status' => self::STATUS_PAID,
            'paid_at' => now(),
        ]);
    }

    public function daysUntilDue(): ?int
    {
        if (!$this->due_date) {
            return null;
        }
        return (int) now()->startOfDay()->diffInDays($this->due_date->startOfDay(), false);
    }

    public function hasReminderBeenSent(string $type): bool
    {
        $reminders = $this->reminder_sent_at ?? [];
        return isset($reminders[$type]);
    }

    public function markReminderSent(string $type): void
    {
        $reminders = $this->reminder_sent_at ?? [];
        $reminders[$type] = now()->toIso8601String();
        $this->update(['reminder_sent_at' => $reminders]);
    }
}
