<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebhookDelivery extends Model
{
    use BelongsToTenant, HasUuids;

    const UPDATED_AT = null;

    protected $fillable = [
        'tenant_id',
        'webhook_endpoint_id',
        'event_type',
        'payload',
        'response_status',
        'response_body',
        'duration_ms',
        'attempt',
        'status',
        'error_message',
    ];

    protected $casts = [
        'payload' => 'array',
        'response_status' => 'integer',
        'duration_ms' => 'integer',
        'attempt' => 'integer',
    ];

    public function endpoint(): BelongsTo
    {
        return $this->belongsTo(WebhookEndpoint::class, 'webhook_endpoint_id');
    }
}
