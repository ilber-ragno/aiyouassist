<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class LlmProvider extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected static function booted(): void
    {
        // Tenant scope: show only tenant's own providers (not global ones)
        static::addGlobalScope('tenant', function (Builder $query) {
            $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
            if ($tenantId) {
                $query->where($query->getModel()->getTable() . '.tenant_id', $tenantId);
            }
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public static function getCurrentTenantId(): ?string
    {
        return app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
    }

    protected $fillable = [
        'tenant_id',
        'name',
        'provider_type',
        'api_key_encrypted',
        'model',
        'budget_limit_usd',
        'alert_threshold_pct',
        'is_active',
        'is_default',
        'priority',
        'metadata',
        'last_validated_at',
    ];

    protected $casts = [
        'budget_limit_usd' => 'decimal:2',
        'alert_threshold_pct' => 'integer',
        'is_active' => 'boolean',
        'is_default' => 'boolean',
        'priority' => 'integer',
        'metadata' => 'array',
        'last_validated_at' => 'datetime',
    ];

    protected $hidden = ['api_key_encrypted'];

    protected $attributes = [
        'alert_threshold_pct' => 80,
        'is_active' => true,
        'is_default' => false,
        'priority' => 0,
        'metadata' => '{}',
    ];

    public const PROVIDERS = [
        'anthropic' => [
            'name' => 'Claude (Anthropic)',
            'models' => [
                'claude-sonnet-4-20250514',
                'claude-opus-4-20250514',
                'claude-haiku-3-20250314',
            ],
        ],
        'openai' => [
            'name' => 'ChatGPT (OpenAI)',
            'models' => [
                'gpt-4o',
                'gpt-4o-mini',
                'gpt-4-turbo',
            ],
        ],
        'groq' => [
            'name' => 'Groq',
            'models' => [
                'llama-3.1-70b-versatile',
                'mixtral-8x7b-32768',
            ],
        ],
        'mistral' => [
            'name' => 'Mistral',
            'models' => [
                'mistral-large-latest',
                'mistral-small-latest',
            ],
        ],
        'cohere' => [
            'name' => 'Cohere',
            'models' => [
                'command-r-plus',
                'command-r',
            ],
        ],
        'google' => [
            'name' => 'Gemini (Google)',
            'models' => [
                'gemini-2.0-flash',
                'gemini-1.5-pro',
            ],
        ],
        'openrouter' => [
            'name' => 'OpenRouter',
            'models' => [], // Modelos carregados dinamicamente via API
            'dynamic_models' => true,
        ],
    ];

    // Per-million-token pricing: [input, output]
    public const PRICING = [
        'claude-sonnet-4-20250514' => ['input' => 3, 'output' => 15],
        'claude-opus-4-20250514' => ['input' => 15, 'output' => 75],
        'claude-haiku-3-20250314' => ['input' => 0.25, 'output' => 1.25],
        'gpt-4o' => ['input' => 2.50, 'output' => 10],
        'gpt-4o-mini' => ['input' => 0.15, 'output' => 0.60],
        'gpt-4-turbo' => ['input' => 10, 'output' => 30],
        'llama-3.1-70b-versatile' => ['input' => 0.59, 'output' => 0.79],
        'mixtral-8x7b-32768' => ['input' => 0.24, 'output' => 0.24],
        'mistral-large-latest' => ['input' => 2, 'output' => 6],
        'mistral-small-latest' => ['input' => 0.20, 'output' => 0.60],
        'command-r-plus' => ['input' => 2.50, 'output' => 10],
        'command-r' => ['input' => 0.15, 'output' => 0.60],
        'gemini-2.0-flash' => ['input' => 0.10, 'output' => 0.40],
        'gemini-1.5-pro' => ['input' => 1.25, 'output' => 5],
    ];

    // ---- Key Management ----

    public function getDecryptedApiKey(): string
    {
        return decrypt($this->api_key_encrypted);
    }

    public function getMaskedApiKey(): string
    {
        try {
            $key = $this->getDecryptedApiKey();
            return substr($key, 0, 8) . '...' . substr($key, -4);
        } catch (\Exception $e) {
            return '****configurado';
        }
    }

    // ---- Spending Calculations ----

    public function getSpentUsd(?\DateTimeInterface $since = null): float
    {
        try {
            $query = DB::table('ai_decisions')
                ->where('llm_provider_id', $this->id);

            if ($since) {
                $query->where('created_at', '>=', $since);
            }

            return (float) ($query->sum('cost_usd') ?? 0);
        } catch (\Exception $e) {
            return 0;
        }
    }

    public function getMonthlySpentUsd(): float
    {
        try {
            return $this->getSpentUsd(now()->startOfMonth());
        } catch (\Exception $e) {
            return 0;
        }
    }

    public function getRemainingBudget(): ?float
    {
        if ($this->budget_limit_usd === null) {
            return null;
        }

        $spent = $this->getMonthlySpentUsd();
        return max(0, (float) $this->budget_limit_usd - $spent);
    }

    public function getUsagePercent(): ?float
    {
        if (!$this->budget_limit_usd || $this->budget_limit_usd <= 0) {
            return null;
        }

        $spent = $this->getMonthlySpentUsd();
        return round(($spent / (float) $this->budget_limit_usd) * 100, 1);
    }

    public function isBudgetExhausted(): bool
    {
        $remaining = $this->getRemainingBudget();
        return $remaining !== null && $remaining <= 0;
    }

    public function isAboveAlertThreshold(): bool
    {
        $pct = $this->getUsagePercent();
        return $pct !== null && $pct >= $this->alert_threshold_pct;
    }

    public function getMonthlyRequestCount(): int
    {
        try {
            return DB::table('ai_decisions')
                ->where('llm_provider_id', $this->id)
                ->where('created_at', '>=', now()->startOfMonth())
                ->count();
        } catch (\Exception $e) {
            return 0;
        }
    }

    public function getDailySpending(int $days = 30): array
    {
        try {
            return DB::table('ai_decisions')
                ->selectRaw("DATE(created_at) as date, COALESCE(SUM(cost_usd), 0) as cost_usd, COUNT(*) as requests")
                ->where('llm_provider_id', $this->id)
                ->where('created_at', '>=', now()->subDays($days))
                ->groupByRaw('DATE(created_at)')
                ->orderBy('date')
                ->get()
                ->map(fn($row) => [
                    'date' => $row->date,
                    'cost_usd' => round((float) $row->cost_usd, 4),
                    'requests' => (int) $row->requests,
                ])
                ->toArray();
        } catch (\Exception $e) {
            return [];
        }
    }

    // ---- Scopes ----

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeDefault($query)
    {
        return $query->where('is_default', true);
    }

    public function scopeByPriority($query)
    {
        return $query->orderBy('priority')->orderBy('created_at');
    }

    // ---- Serialization ----

    public function toArrayWithSpending(): array
    {
        $spent = $this->getMonthlySpentUsd();
        $remaining = $this->getRemainingBudget();
        $usagePct = $this->getUsagePercent();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'provider_type' => $this->provider_type,
            'model' => $this->model,
            'api_key_masked' => $this->getMaskedApiKey(),
            'has_key' => !empty($this->api_key_encrypted),
            'budget_limit_usd' => $this->budget_limit_usd ? (float) $this->budget_limit_usd : null,
            'spent_usd' => round($spent, 2),
            'remaining_usd' => $remaining !== null ? round($remaining, 2) : null,
            'usage_pct' => $usagePct,
            'alert_threshold_pct' => $this->alert_threshold_pct,
            'is_active' => $this->is_active,
            'is_default' => $this->is_default,
            'priority' => $this->priority,
            'total_requests_this_month' => $this->getMonthlyRequestCount(),
            'is_budget_exhausted' => $this->isBudgetExhausted(),
            'is_above_alert' => $this->isAboveAlertThreshold(),
            'last_validated_at' => $this->last_validated_at?->toIso8601String(),
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
