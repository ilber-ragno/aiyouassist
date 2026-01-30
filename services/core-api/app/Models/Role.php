<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'name', 'description', 'is_system'];

    protected $casts = [
        'is_system' => 'boolean',
    ];
}
