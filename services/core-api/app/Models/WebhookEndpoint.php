<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WebhookEndpoint extends Model
{
    use BelongsToTenant, HasUuids;

    protected $fillable = [
        'tenant_id',
        'url',
        'description',
        'events',
        'secret_encrypted',
        'is_active',
        'retry_policy',
        'failure_count',
        'last_triggered_at',
        'last_success_at',
        'last_failure_at',
        'last_failure_reason',
    ];

    protected $casts = [
        'events' => 'array',
        'retry_policy' => 'array',
        'is_active' => 'boolean',
        'failure_count' => 'integer',
        'last_triggered_at' => 'datetime',
        'last_success_at' => 'datetime',
        'last_failure_at' => 'datetime',
    ];

    protected $hidden = [
        'secret_encrypted',
    ];

    public function deliveries(): HasMany
    {
        return $this->hasMany(WebhookDelivery::class);
    }
}
