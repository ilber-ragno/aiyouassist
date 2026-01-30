<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExecutionLog;
use App\Models\IntegrationConfig;
use App\Models\WebhookEndpoint;
use App\Models\WhatsappSession;
use App\Services\ClawdBotConnectorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OverviewController extends Controller
{
    public function __construct(
        protected ClawdBotConnectorService $connector
    ) {}

    /**
     * Aggregate overview: subscription + whatsapp + webhooks + logs
     */
    public function index(Request $request): JsonResponse
    {
        $tenant = $request->user()->tenant;

        // Subscription status
        $subscription = $tenant->subscription;
        $plan = $subscription?->plan;

        // WhatsApp sessions
        $whatsappSessions = WhatsappSession::count();
        $connectedSessions = WhatsappSession::where('status', 'connected')->count();

        // Integrations
        $enabledIntegrations = IntegrationConfig::where('is_enabled', true)->count();
        $totalIntegrations = IntegrationConfig::count();

        // Webhooks
        $activeWebhooks = WebhookEndpoint::where('is_active', true)->count();

        // Recent logs
        $recentLogs = ExecutionLog::orderBy('created_at', 'desc')
            ->limit(10)
            ->get(['id', 'log_type', 'severity', 'source', 'action', 'created_at']);

        // Connector health
        $connectorHealth = $this->connector->health();

        return response()->json([
            'subscription' => [
                'plan_name' => $plan?->name ?? 'Trial',
                'status' => $subscription?->status ?? 'trial',
                'current_period_end' => $subscription?->current_period_end,
            ],
            'whatsapp' => [
                'total_sessions' => $whatsappSessions,
                'connected' => $connectedSessions,
            ],
            'integrations' => [
                'enabled' => $enabledIntegrations,
                'total' => $totalIntegrations,
            ],
            'webhooks' => [
                'active' => $activeWebhooks,
            ],
            'connector' => $connectorHealth,
            'recent_events' => $recentLogs,
            'usage' => [
                'users' => $tenant->users()->count(),
                'users_limit' => $tenant->getLimit('users'),
            ],
        ]);
    }
}
