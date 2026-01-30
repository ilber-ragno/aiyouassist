<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Conversation extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'whatsapp_session_id',
        'contact_phone',
        'contact_name',
        'contact_profile_pic',
        'status',
        'assigned_user_id',
        'priority',
        'last_message_at',
        'metadata',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'metadata' => 'array',
        'priority' => 'integer',
    ];

    // Status constants
    public const STATUS_ACTIVE = 'active';
    public const STATUS_WAITING_HUMAN = 'waiting_human';
    public const STATUS_WITH_HUMAN = 'with_human';
    public const STATUS_RESOLVED = 'resolved';
    public const STATUS_ARCHIVED = 'archived';

    // Relationships
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function whatsappSession(): BelongsTo
    {
        return $this->belongsTo(WhatsappSession::class);
    }

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class)->orderBy('created_at', 'asc');
    }

    public function latestMessages(): HasMany
    {
        return $this->hasMany(Message::class)->orderBy('created_at', 'desc');
    }

    public function aiDecisions(): HasMany
    {
        return $this->hasMany(AiDecision::class);
    }

    public function handoffEvents(): HasMany
    {
        return $this->hasMany(HandoffEvent::class);
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('status', self::STATUS_ACTIVE);
    }

    public function scopeNeedsHuman($query)
    {
        return $query->where('status', self::STATUS_WAITING_HUMAN);
    }

    public function scopeWithHuman($query)
    {
        return $query->where('status', self::STATUS_WITH_HUMAN);
    }

    public function scopeUnassigned($query)
    {
        return $query->whereNull('assigned_user_id');
    }

    public function scopeByPriority($query)
    {
        return $query->orderBy('priority', 'desc')
            ->orderBy('last_message_at', 'desc');
    }

    // Helpers
    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    public function isWithAi(): bool
    {
        return in_array($this->status, [self::STATUS_ACTIVE]);
    }

    public function isWithHuman(): bool
    {
        return $this->status === self::STATUS_WITH_HUMAN;
    }

    public function needsHuman(): bool
    {
        return $this->status === self::STATUS_WAITING_HUMAN;
    }

    public function assignTo(User $user): void
    {
        $this->update([
            'assigned_user_id' => $user->id,
            'status' => self::STATUS_WITH_HUMAN,
        ]);

        $this->handoffEvents()->create([
            'tenant_id' => $this->tenant_id,
            'event_type' => 'assigned',
            'to_user_id' => $user->id,
        ]);
    }

    public function returnToAi(): void
    {
        $previousUser = $this->assigned_user_id;

        $this->update([
            'assigned_user_id' => null,
            'status' => self::STATUS_ACTIVE,
        ]);

        $this->handoffEvents()->create([
            'tenant_id' => $this->tenant_id,
            'event_type' => 'returned_to_ai',
            'from_user_id' => $previousUser,
        ]);
    }

    public function escalate(string $reason = null): void
    {
        $this->update([
            'status' => self::STATUS_WAITING_HUMAN,
            'priority' => $this->priority + 1,
        ]);

        $this->handoffEvents()->create([
            'tenant_id' => $this->tenant_id,
            'event_type' => 'escalated',
            'reason' => $reason,
        ]);
    }

    public function resolve(): void
    {
        $this->update([
            'status' => self::STATUS_RESOLVED,
        ]);

        $this->handoffEvents()->create([
            'tenant_id' => $this->tenant_id,
            'event_type' => 'resolved',
            'from_user_id' => $this->assigned_user_id,
        ]);
    }

    public function getContactDisplayName(): string
    {
        return $this->contact_name ?? $this->contact_phone;
    }

    public function getLastMessage(): ?Message
    {
        return $this->latestMessages()->first();
    }

    public function getUnreadCount(): int
    {
        return $this->messages()
            ->where('direction', 'inbound')
            ->where('status', '!=', 'read')
            ->count();
    }
}
