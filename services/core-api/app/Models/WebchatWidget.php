<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebchatWidget extends Model
{
    use HasUuids;

    protected $table = 'webchat_widgets';

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
        'widget_key',
        'name',
        'primary_color',
        'welcome_message',
        'bot_name',
        'bot_avatar_url',
        'position',
        'is_active',
        'allowed_domains',
        'status',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public const STATUS_ACTIVE = 'active';
    public const STATUS_INACTIVE = 'inactive';

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function activate(): void
    {
        $this->update([
            'is_active' => true,
            'status' => self::STATUS_ACTIVE,
        ]);
    }

    public function deactivate(): void
    {
        $this->update([
            'is_active' => false,
            'status' => self::STATUS_INACTIVE,
        ]);
    }
}
