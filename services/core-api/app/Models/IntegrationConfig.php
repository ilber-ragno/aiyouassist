<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class IntegrationConfig extends Model
{
    use BelongsToTenant, HasUuids;

    protected $fillable = [
        'tenant_id',
        'integration_type',
        'name',
        'description',
        'config',
        'credentials_encrypted',
        'is_enabled',
        'status',
        'last_sync_at',
        'last_error',
    ];

    protected $casts = [
        'config' => 'array',
        'is_enabled' => 'boolean',
        'last_sync_at' => 'datetime',
    ];

    protected $hidden = [
        'credentials_encrypted',
    ];
}
