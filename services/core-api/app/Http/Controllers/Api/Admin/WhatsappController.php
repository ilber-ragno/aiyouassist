<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\WhatsappSession;
use App\Services\ClaudBotService;
use App\Services\ClawdBotConnectorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WhatsappController extends Controller
{
    public function __construct(
        protected ClaudBotService $claudBot,
        protected ClawdBotConnectorService $connector,
    ) {}

    /**
     * Overview of all WhatsApp sessions across all tenants
     */
    public function overview(): JsonResponse
    {
        $totalSessions = WhatsappSession::withoutGlobalScope('tenant')->count();
        $connectedSessions = WhatsappSession::withoutGlobalScope('tenant')
            ->where('status', WhatsappSession::STATUS_CONNECTED)->count();
        $waitingQr = WhatsappSession::withoutGlobalScope('tenant')
            ->where('status', WhatsappSession::STATUS_WAITING_QR)->count();
        $errorSessions = WhatsappSession::withoutGlobalScope('tenant')
            ->whereIn('status', [WhatsappSession::STATUS_ERROR, WhatsappSession::STATUS_BANNED])
            ->count();

        return response()->json([
            'total_sessions' => $totalSessions,
            'connected' => $connectedSessions,
            'waiting_qr' => $waitingQr,
            'error' => $errorSessions,
            'disconnected' => $totalSessions - $connectedSessions - $waitingQr - $errorSessions,
        ]);
    }

    /**
     * List all sessions across tenants
     */
    public function allSessions(Request $request): JsonResponse
    {
        $query = WhatsappSession::withoutGlobalScope('tenant')
            ->with('tenant:id,name,slug');

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('session_name', 'ilike', "%{$search}%")
                  ->orWhere('phone_number', 'ilike', "%{$search}%");
            });
        }

        $sessions = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 20));

        return response()->json($sessions);
    }

    /**
     * Get Moltbot gateway info (health, channels, config)
     */
    public function gatewayInfo(): JsonResponse
    {
        try {
            $info = $this->claudBot->getGatewayInfo();
            return response()->json($info);
        } catch (\Exception $e) {
            return response()->json([
                'connected' => false,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Get Moltbot gateway config
     */
    public function gatewayConfig(): JsonResponse
    {
        try {
            $config = $this->claudBot->getGatewayConfig();
            return response()->json($config);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }

    /**
     * Update Moltbot gateway config
     */
    public function updateGatewayConfig(Request $request): JsonResponse
    {
        try {
            $result = $this->claudBot->updateGatewayConfig($request->all());
            return response()->json([
                'message' => 'Configuracao do gateway atualizada',
                'result' => $result,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }

    /**
     * Trigger WhatsApp channel login (admin-initiated QR code)
     * Requires session_id — Baileys direct integration.
     */
    public function channelLogin(Request $request): JsonResponse
    {
        $request->validate(['session_id' => 'required|uuid']);

        try {
            $result = $this->claudBot->channelLogin($request->input('session_id'));
            return response()->json([
                'message' => 'Login da sessao WhatsApp iniciado',
                'result' => $result,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }

    /**
     * Logout from WhatsApp session
     */
    public function channelLogout(Request $request): JsonResponse
    {
        $request->validate(['session_id' => 'required|uuid']);

        try {
            $result = $this->claudBot->channelLogout($request->input('session_id'));
            return response()->json([
                'message' => 'Logout da sessao realizado',
                'result' => $result,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }

    /**
     * Get gateway sessions (moltbot sessions.list)
     */
    public function gatewaySessions(): JsonResponse
    {
        try {
            $sessions = $this->claudBot->getGatewaySessions();
            return response()->json($sessions);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }
}
