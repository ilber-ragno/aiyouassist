<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TelegramBot;
use App\Services\TelegramService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class TelegramController extends Controller
{
    public function __construct(
        protected TelegramService $telegramService
    ) {}

    /**
     * List bots for current tenant.
     */
    public function index(): JsonResponse
    {
        $bots = TelegramBot::orderBy('created_at', 'desc')->get();

        return response()->json(['bots' => $bots]);
    }

    /**
     * Register a new Telegram bot.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'bot_token' => 'required|string',
        ]);

        $token = $validated['bot_token'];
        $tenantId = app('current_tenant_id');

        // Test token first
        try {
            $result = $this->telegramService->testBotToken($token);
            $botInfo = $result['bot'];
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Token inválido',
                'error' => $e->getMessage(),
            ], 400);
        }

        // Check if already exists
        $existing = TelegramBot::where('bot_username', $botInfo['username'])->first();
        if ($existing) {
            return response()->json([
                'message' => 'Este bot já está registrado',
            ], 409);
        }

        // Create record
        $bot = TelegramBot::create([
            'tenant_id' => $tenantId,
            'bot_token_encrypted' => $token,
            'bot_username' => $botInfo['username'],
            'bot_name' => $botInfo['first_name'],
            'status' => TelegramBot::STATUS_DISCONNECTED,
        ]);

        return response()->json(['bot' => $bot], 201);
    }

    /**
     * Show bot details.
     */
    public function show(string $bot): JsonResponse
    {
        $telegramBot = TelegramBot::findOrFail($bot);

        return response()->json(['bot' => $telegramBot]);
    }

    /**
     * Delete a bot.
     */
    public function destroy(string $bot): JsonResponse
    {
        $telegramBot = TelegramBot::findOrFail($bot);

        try {
            $this->telegramService->deleteBot($telegramBot);
        } catch (\Exception $e) {
            Log::warning('Failed to delete bot from telegram-service', ['error' => $e->getMessage()]);
        }

        $telegramBot->delete();

        return response()->json(['message' => 'Bot removido']);
    }

    /**
     * Connect (start polling).
     */
    public function connect(string $bot): JsonResponse
    {
        $telegramBot = TelegramBot::findOrFail($bot);

        try {
            $this->telegramService->startBot($telegramBot);
            $telegramBot->markConnected();

            return response()->json(['status' => 'connected', 'bot' => $telegramBot->fresh()]);
        } catch (\Exception $e) {
            $telegramBot->markError($e->getMessage());

            return response()->json([
                'message' => 'Falha ao conectar',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Disconnect (stop polling).
     */
    public function disconnect(string $bot): JsonResponse
    {
        $telegramBot = TelegramBot::findOrFail($bot);

        try {
            $this->telegramService->stopBot($telegramBot);
            $telegramBot->markDisconnected();

            return response()->json(['status' => 'disconnected', 'bot' => $telegramBot->fresh()]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Falha ao desconectar',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Test bot token (without saving).
     */
    public function test(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'bot_token' => 'required|string',
        ]);

        try {
            $result = $this->telegramService->testBotToken($validated['bot_token']);

            return response()->json([
                'valid' => true,
                'bot' => $result['bot'],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'valid' => false,
                'error' => $e->getMessage(),
            ], 400);
        }
    }
}
