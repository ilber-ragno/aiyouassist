<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WebhookEvent extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'provider',
        'event_type',
        'external_id',
        'payload',
        'signature',
        'signature_valid',
        'processed',
        'processed_at',
        'error',
        'idempotency_key',
    ];

    protected $casts = [
        'payload' => 'array',
        'signature_valid' => 'boolean',
        'processed' => 'boolean',
        'processed_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}
