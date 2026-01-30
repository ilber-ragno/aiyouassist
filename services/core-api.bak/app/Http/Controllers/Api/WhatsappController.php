<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsappSession;
use App\Services\ClaudBotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WhatsappController extends Controller
{
    public function __construct(
        protected ClaudBotService $claudBot
    ) {}

    /**
     * List WhatsApp sessions
     */
    public function index(Request $request): JsonResponse
    {
        $sessions = WhatsappSession::orderBy('created_at', 'desc')->get();

        return response()->json([
            'sessions' => $sessions->map(fn($s) => [
                'id' => $s->id,
                'session_name' => $s->session_name,
                'phone_number' => $s->phone_number,
                'status' => $s->status,
                'last_connected_at' => $s->last_connected_at,
                'last_error' => $s->last_error,
            ]),
        ]);
    }

    /**
     * Create new WhatsApp session
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'session_name' => 'required|string|max:100',
        ]);

        $tenant = $request->user()->tenant;

        // Check limit
        $currentCount = $tenant->whatsappSessions()->count();
        $limit = $tenant->getLimit('whatsapp_connections');

        if ($limit > 0 && $currentCount >= $limit) {
            return response()->json([
                'error' => 'limit_exceeded',
                'message' => "You have reached the maximum of {$limit} WhatsApp connections for your plan.",
            ], 403);
        }

        $session = WhatsappSession::create([
            'tenant_id' => $tenant->id,
            'session_name' => $validated['session_name'],
            'status' => WhatsappSession::STATUS_DISCONNECTED,
        ]);

        return response()->json([
            'message' => 'Session created',
            'session' => [
                'id' => $session->id,
                'session_name' => $session->session_name,
                'status' => $session->status,
            ],
        ], 201);
    }

    /**
     * Get session details
     */
    public function show(WhatsappSession $session): JsonResponse
    {
        return response()->json([
            'session' => [
                'id' => $session->id,
                'session_name' => $session->session_name,
                'phone_number' => $session->phone_number,
                'status' => $session->status,
                'last_connected_at' => $session->last_connected_at,
                'last_error' => $session->last_error,
                'conversations_count' => $session->conversations()->count(),
                'active_conversations' => $session->conversations()
                    ->whereIn('status', ['active', 'waiting_human', 'with_human'])
                    ->count(),
            ],
        ]);
    }

    /**
     * Connect session (generate QR code)
     */
    public function connect(Request $request, WhatsappSession $session): JsonResponse
    {
        if ($session->isConnected()) {
            return response()->json([
                'error' => 'already_connected',
                'message' => 'Session is already connected',
            ], 400);
        }

        try {
            // Request QR from ClaudBot
            $qrData = $this->claudBot->requestQrCode($session);

            $session->setQrCode($qrData['qr_code'], $qrData['expires_in'] ?? 60);

            return response()->json([
                'message' => 'QR code generated',
                'session' => [
                    'id' => $session->id,
                    'status' => $session->status,
                    'qr_code' => $session->qr_code,
                    'qr_expires_at' => $session->qr_expires_at,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'connection_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get current QR code
     */
    public function qrCode(WhatsappSession $session): JsonResponse
    {
        if (!$session->hasValidQr()) {
            return response()->json([
                'error' => 'no_qr',
                'message' => 'No valid QR code available. Please request a new connection.',
                'status' => $session->status,
            ], 404);
        }

        return response()->json([
            'qr_code' => $session->qr_code,
            'expires_at' => $session->qr_expires_at,
            'status' => $session->status,
        ]);
    }

    /**
     * Disconnect session
     */
    public function disconnect(Request $request, WhatsappSession $session): JsonResponse
    {
        try {
            $this->claudBot->disconnect($session);
            $session->markDisconnected();

            return response()->json([
                'message' => 'Session disconnected',
                'session' => [
                    'id' => $session->id,
                    'status' => $session->status,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'disconnect_failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Delete session
     */
    public function destroy(WhatsappSession $session): JsonResponse
    {
        // Disconnect first if connected
        if ($session->isConnected()) {
            try {
                $this->claudBot->disconnect($session);
            } catch (\Exception $e) {
                // Log but continue with deletion
            }
        }

        $session->delete();

        return response()->json([
            'message' => 'Session deleted',
        ]);
    }

    /**
     * Get session status (polling endpoint)
     */
    public function status(WhatsappSession $session): JsonResponse
    {
        // Refresh from ClaudBot if needed
        if ($session->status === WhatsappSession::STATUS_WAITING_QR) {
            $this->claudBot->refreshSessionStatus($session);
            $session->refresh();
        }

        return response()->json([
            'id' => $session->id,
            'status' => $session->status,
            'phone_number' => $session->phone_number,
            'qr_code' => $session->hasValidQr() ? $session->qr_code : null,
            'qr_expires_at' => $session->qr_expires_at,
            'last_error' => $session->last_error,
        ]);
    }
}
