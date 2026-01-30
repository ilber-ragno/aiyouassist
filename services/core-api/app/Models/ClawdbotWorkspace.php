<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ClawdbotWorkspace extends Model
{
    use BelongsToTenant, HasUuids;

    protected $table = 'clawdbot_workspaces';

    protected $fillable = [
        'tenant_id',
        'workspace_name',
        'gateway_url',
        'auth_token_encrypted',
        'agent_id',
        'status',
        'health_status',
        'last_health_check_at',
        'config',
    ];

    protected $casts = [
        'config' => 'array',
        'last_health_check_at' => 'datetime',
    ];

    protected $hidden = [
        'auth_token_encrypted',
    ];
}
