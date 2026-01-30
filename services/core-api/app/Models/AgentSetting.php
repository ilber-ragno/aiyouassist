<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AgentSetting extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'persona',
        'tone',
        'language',
        'response_mode',
        'whitelisted_phones',
        'operating_hours',
        'forbidden_topics',
        'escalation_rules',
        'cost_mode',
        'allowed_tools',
        'max_response_tokens',
        'confidence_threshold',
        'is_active',
    ];

    protected $casts = [
        'operating_hours' => 'array',
        'forbidden_topics' => 'array',
        'escalation_rules' => 'array',
        'allowed_tools' => 'array',
        'whitelisted_phones' => 'array',
        'max_response_tokens' => 'integer',
        'confidence_threshold' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    protected $attributes = [
        'tone' => 'professional',
        'language' => 'pt-BR',
        'response_mode' => 'all',
        'cost_mode' => 'normal',
        'max_response_tokens' => 1024,
        'confidence_threshold' => 0.7,
        'is_active' => true,
    ];

    // Cost mode constants
    public const COST_NORMAL = 'normal';
    public const COST_RESTRICTED = 'restricted';
    public const COST_UNLIMITED = 'unlimited';

    // Relationships
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // Helpers
    public function isWithinOperatingHours(): bool
    {
        if (empty($this->operating_hours)) {
            return true; // No restrictions = always available
        }

        $now = now()->setTimezone($this->operating_hours['timezone'] ?? 'America/Sao_Paulo');
        $dayOfWeek = strtolower($now->format('l'));

        $schedule = $this->operating_hours['schedule'] ?? [];
        $todaySchedule = $schedule[$dayOfWeek] ?? null;

        if (!$todaySchedule || !($todaySchedule['enabled'] ?? true)) {
            return false;
        }

        $start = $todaySchedule['start'] ?? '00:00';
        $end = $todaySchedule['end'] ?? '23:59';

        $currentTime = $now->format('H:i');

        return $currentTime >= $start && $currentTime <= $end;
    }

    public function isForbiddenTopic(string $topic): bool
    {
        if (empty($this->forbidden_topics)) {
            return false;
        }

        $topic = strtolower($topic);
        foreach ($this->forbidden_topics as $forbidden) {
            if (str_contains($topic, strtolower($forbidden))) {
                return true;
            }
        }

        return false;
    }

    public function shouldEscalate(array $context): bool
    {
        $rules = $this->escalation_rules ?? [];

        // Check keyword triggers
        $keywords = $rules['keywords'] ?? [];
        $message = strtolower($context['message'] ?? '');
        foreach ($keywords as $keyword) {
            if (str_contains($message, strtolower($keyword))) {
                return true;
            }
        }

        // Check confidence threshold
        $confidence = $context['confidence'] ?? 1.0;
        if ($confidence < ($rules['min_confidence'] ?? 0.5)) {
            return true;
        }

        // Check consecutive low confidence
        $consecutiveLow = $context['consecutive_low_confidence'] ?? 0;
        if ($consecutiveLow >= ($rules['max_consecutive_low'] ?? 3)) {
            return true;
        }

        return false;
    }

    public function canUseTool(string $tool): bool
    {
        if (empty($this->allowed_tools)) {
            return true; // No restrictions
        }

        return in_array($tool, $this->allowed_tools);
    }

    public function getSystemPrompt(): string
    {
        $prompt = "Você é um assistente virtual";

        if ($this->persona) {
            $prompt = $this->persona;
        }

        $prompt .= "\n\nTom de comunicação: {$this->tone}";
        $prompt .= "\nIdioma: {$this->language}";

        if (!empty($this->forbidden_topics)) {
            $topics = implode(', ', $this->forbidden_topics);
            $prompt .= "\n\nTópicos PROIBIDOS (nunca discuta): {$topics}";
        }

        return $prompt;
    }
}
