<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlanLimit extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'plan_id',
        'limit_key',
        'limit_value',
        'description',
    ];

    protected $casts = [
        'limit_value' => 'integer',
    ];

    public $timestamps = false;

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }
}
