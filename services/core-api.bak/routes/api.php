<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\TenantController;
use App\Http\Controllers\Api\WhatsappController;
use App\Http\Controllers\Api\WebhookController;
use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\AgentSettingController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes - AiYou Assist
|--------------------------------------------------------------------------
*/

// Health check (no auth)
Route::get('/health', fn() => response()->json([
    'status' => 'healthy',
    'service' => 'core-api',
    'timestamp' => now()->toIso8601String(),
]));

// Auth routes (no auth required)
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

// Webhooks (no auth, but signature verification)
Route::prefix('webhooks')->group(function () {
    Route::post('/claudbot', [WebhookController::class, 'claudbot']);
    Route::post('/stripe', [WebhookController::class, 'stripe']);
    Route::post('/asaas', [WebhookController::class, 'asaas']);
});

// Public routes (plans, etc.)
Route::get('/plans', [PlanController::class, 'index']);

// Authenticated routes
Route::middleware(['auth:sanctum', 'tenant.context', 'tenant.active'])->group(function () {
    // Auth
    Route::prefix('auth')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/refresh', [AuthController::class, 'refresh']);
    });

    // Tenant
    Route::prefix('tenant')->group(function () {
        Route::get('/', [TenantController::class, 'show']);
        Route::patch('/', [TenantController::class, 'update']);
        Route::get('/usage', [TenantController::class, 'usage']);
    });

    // Users
    Route::apiResource('users', UserController::class);

    // WhatsApp Sessions
    Route::prefix('whatsapp')->group(function () {
        Route::get('/sessions', [WhatsappController::class, 'index']);
        Route::post('/sessions', [WhatsappController::class, 'store']);
        Route::get('/sessions/{session}', [WhatsappController::class, 'show']);
        Route::delete('/sessions/{session}', [WhatsappController::class, 'destroy']);
        Route::post('/sessions/{session}/connect', [WhatsappController::class, 'connect']);
        Route::post('/sessions/{session}/disconnect', [WhatsappController::class, 'disconnect']);
        Route::get('/sessions/{session}/qr', [WhatsappController::class, 'qrCode']);
        Route::get('/sessions/{session}/status', [WhatsappController::class, 'status']);
    });

    // Conversations (Inbox)
    Route::prefix('conversations')->group(function () {
        Route::get('/', [ConversationController::class, 'index']);
        Route::get('/stats', [ConversationController::class, 'queueStats']);
        Route::get('/{conversation}', [ConversationController::class, 'show']);
        Route::post('/{conversation}/assign', [ConversationController::class, 'assign']);
        Route::post('/{conversation}/return-to-ai', [ConversationController::class, 'returnToAi']);
        Route::post('/{conversation}/resolve', [ConversationController::class, 'resolve']);
        Route::post('/{conversation}/messages', [ConversationController::class, 'sendMessage']);
    });

    // Agent Settings
    Route::apiResource('agent-settings', AgentSettingController::class);

    // Plans (authenticated view with more details)
    Route::get('/plans/{plan}', [PlanController::class, 'show']);
});

// Admin routes (require admin role)
Route::middleware(['auth:sanctum', 'tenant.context', 'role:admin'])->prefix('admin')->group(function () {
    // Subscription management
    Route::prefix('subscription')->group(function () {
        Route::get('/', [\App\Http\Controllers\Api\Admin\SubscriptionController::class, 'show']);
        Route::post('/change-plan', [\App\Http\Controllers\Api\Admin\SubscriptionController::class, 'changePlan']);
        Route::post('/cancel', [\App\Http\Controllers\Api\Admin\SubscriptionController::class, 'cancel']);
        Route::get('/invoices', [\App\Http\Controllers\Api\Admin\SubscriptionController::class, 'invoices']);
        Route::get('/portal', [\App\Http\Controllers\Api\Admin\SubscriptionController::class, 'billingPortal']);
    });

    // Audit logs
    Route::get('/audit-logs', [\App\Http\Controllers\Api\Admin\AuditLogController::class, 'index']);

    // Reports
    Route::prefix('reports')->group(function () {
        Route::get('/conversations', [\App\Http\Controllers\Api\Admin\ReportController::class, 'conversations']);
        Route::get('/ai-usage', [\App\Http\Controllers\Api\Admin\ReportController::class, 'aiUsage']);
        Route::get('/messages', [\App\Http\Controllers\Api\Admin\ReportController::class, 'messages']);
    });
});
