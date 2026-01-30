<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TenantController extends Controller
{
    /**
     * Get current tenant details
     */
    public function show(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant->load([
            'subscription.plan',
            'agentSettings' => fn($q) => $q->active(),
        ]);

        $plan = $tenant->subscription?->plan;

        return response()->json([
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'settings' => $tenant->settings,
                'created_at' => $tenant->created_at,
            ],
            'subscription' => $tenant->subscription ? [
                'id' => $tenant->subscription->id,
                'status' => $tenant->subscription->status,
                'plan' => [
                    'name' => $plan->name,
                    'slug' => $plan->slug,
                ],
                'current_period_end' => $tenant->subscription->current_period_end,
                'days_until_renewal' => $tenant->subscription->daysUntilRenewal(),
            ] : null,
            'usage' => $this->getUsageStats($tenant),
            'limits' => $this->getLimits($tenant),
        ]);
    }

    /**
     * Update tenant settings
     */
    public function update(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'settings' => 'sometimes|array',
            'settings.timezone' => 'sometimes|string|timezone',
            'settings.locale' => 'sometimes|string|max:10',
            'settings.notification_email' => 'sometimes|email',
        ]);

        if (isset($validated['name'])) {
            $tenant->name = $validated['name'];
        }

        if (isset($validated['settings'])) {
            $tenant->settings = array_merge(
                $tenant->settings ?? [],
                $validated['settings']
            );
        }

        $tenant->save();

        return response()->json([
            'message' => 'Tenant updated successfully',
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'settings' => $tenant->settings,
            ],
        ]);
    }

    /**
     * Get tenant usage statistics
     */
    public function usage(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;

        return response()->json([
            'usage' => $this->getUsageStats($tenant),
            'limits' => $this->getLimits($tenant),
        ]);
    }

    protected function getUsageStats(Tenant $tenant): array
    {
        $startOfMonth = now()->startOfMonth();

        return [
            'messages_this_month' => $tenant->conversations()
                ->withoutGlobalScope('tenant')
                ->where('tenant_id', $tenant->id)
                ->join('messages', 'conversations.id', '=', 'messages.conversation_id')
                ->where('messages.created_at', '>=', $startOfMonth)
                ->count(),
            'active_conversations' => $tenant->conversations()
                ->whereIn('status', ['active', 'waiting_human', 'with_human'])
                ->count(),
            'whatsapp_connections' => $tenant->whatsappSessions()
                ->where('status', 'connected')
                ->count(),
            'users' => $tenant->users()->count(),
        ];
    }

    protected function getLimits(Tenant $tenant): array
    {
        $plan = $tenant->getCurrentPlan();

        if (!$plan) {
            return [
                'messages_monthly' => 100, // Free tier
                'whatsapp_connections' => 1,
                'users' => 1,
            ];
        }

        return [
            'messages_monthly' => $plan->getLimit('messages_monthly'),
            'ai_tokens_monthly' => $plan->getLimit('ai_tokens_monthly'),
            'whatsapp_connections' => $plan->getLimit('whatsapp_connections'),
            'users' => $plan->getLimit('users'),
            'api_connections' => $plan->getLimit('api_connections'),
        ];
    }
}
