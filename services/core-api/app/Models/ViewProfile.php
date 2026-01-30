<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ViewProfile extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'menu_items',
        'is_system',
        'is_active',
    ];

    protected $casts = [
        'menu_items' => 'array',
        'is_system' => 'boolean',
        'is_active' => 'boolean',
    ];

    public const ALL_MENU_ITEMS = [
        'overview'      => 'Visão Geral',
        'subscription'  => 'Assinatura',
        'whatsapp'      => 'WhatsApp',
        'integrations'  => 'Integrações',
        'customer-api'  => 'Customer API',
        'webhooks'      => 'Webhooks',
        'logs'          => 'Logs',
        'audit'         => 'Auditoria',
        'team'          => 'Equipe',
        'agent'         => 'Agente IA',
        'llm-providers'  => 'Provedores IA',
        'conversations'  => 'Conversas',
        'knowledge-base' => 'Base de Conhecimento',
        'telegram'       => 'Telegram',
        'tokens'         => 'Créditos',
        'settings'       => 'Configurações',
        'webchat'        => 'Webchat',
    ];

    public function tenants(): HasMany
    {
        return $this->hasMany(Tenant::class, 'view_profile_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
