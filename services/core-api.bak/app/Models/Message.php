<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'conversation_id',
        'direction',
        'sender_type',
        'sender_id',
        'content_type',
        'content',
        'media_url',
        'whatsapp_message_id',
        'status',
        'metadata',
        'created_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'created_at' => 'datetime',
    ];

    protected $attributes = [
        'content_type' => 'text',
        'status' => 'sent',
    ];

    // Direction constants
    public const DIRECTION_INBOUND = 'inbound';
    public const DIRECTION_OUTBOUND = 'outbound';

    // Sender type constants
    public const SENDER_CONTACT = 'contact';
    public const SENDER_AI = 'ai';
    public const SENDER_HUMAN = 'human';

    // Content type constants
    public const TYPE_TEXT = 'text';
    public const TYPE_IMAGE = 'image';
    public const TYPE_AUDIO = 'audio';
    public const TYPE_VIDEO = 'video';
    public const TYPE_DOCUMENT = 'document';
    public const TYPE_STICKER = 'sticker';
    public const TYPE_LOCATION = 'location';

    // Status constants
    public const STATUS_PENDING = 'pending';
    public const STATUS_SENT = 'sent';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_READ = 'read';
    public const STATUS_FAILED = 'failed';

    protected static function booted(): void
    {
        static::creating(function ($message) {
            $message->created_at = $message->created_at ?? now();
        });
    }

    // Relationships
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    // Scopes
    public function scopeInbound($query)
    {
        return $query->where('direction', self::DIRECTION_INBOUND);
    }

    public function scopeOutbound($query)
    {
        return $query->where('direction', self::DIRECTION_OUTBOUND);
    }

    public function scopeFromAi($query)
    {
        return $query->where('sender_type', self::SENDER_AI);
    }

    public function scopeFromHuman($query)
    {
        return $query->where('sender_type', self::SENDER_HUMAN);
    }

    // Helpers
    public function isInbound(): bool
    {
        return $this->direction === self::DIRECTION_INBOUND;
    }

    public function isOutbound(): bool
    {
        return $this->direction === self::DIRECTION_OUTBOUND;
    }

    public function isFromAi(): bool
    {
        return $this->sender_type === self::SENDER_AI;
    }

    public function isFromHuman(): bool
    {
        return $this->sender_type === self::SENDER_HUMAN;
    }

    public function isFromContact(): bool
    {
        return $this->sender_type === self::SENDER_CONTACT;
    }

    public function isText(): bool
    {
        return $this->content_type === self::TYPE_TEXT;
    }

    public function hasMedia(): bool
    {
        return in_array($this->content_type, [
            self::TYPE_IMAGE,
            self::TYPE_AUDIO,
            self::TYPE_VIDEO,
            self::TYPE_DOCUMENT,
            self::TYPE_STICKER,
        ]);
    }

    public function markAsDelivered(): void
    {
        if ($this->status === self::STATUS_SENT) {
            $this->update(['status' => self::STATUS_DELIVERED]);
        }
    }

    public function markAsRead(): void
    {
        $this->update(['status' => self::STATUS_READ]);
    }

    public function markAsFailed(): void
    {
        $this->update(['status' => self::STATUS_FAILED]);
    }

    public function getPreview(int $length = 50): string
    {
        if ($this->hasMedia()) {
            return match ($this->content_type) {
                self::TYPE_IMAGE => '📷 Imagem',
                self::TYPE_AUDIO => '🎵 Áudio',
                self::TYPE_VIDEO => '🎬 Vídeo',
                self::TYPE_DOCUMENT => '📄 Documento',
                self::TYPE_STICKER => '🎭 Sticker',
                self::TYPE_LOCATION => '📍 Localização',
                default => '📎 Mídia',
            };
        }

        return str($this->content)->limit($length)->toString();
    }
}
