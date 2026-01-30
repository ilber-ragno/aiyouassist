<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\TenantController;
use App\Http\Controllers\Api\WhatsappController;
use App\Http\Controllers\Api\WebhookController;
use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\OverviewController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\CustomerApiController;
use App\Http\Controllers\Api\WebhookManagementController;
use App\Http\Controllers\Api\LogController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\LlmProviderController;
use App\Http\Controllers\Api\AgentSettingController;
use App\Http\Controllers\Api\Admin\BillingController as AdminBillingController;
use App\Http\Controllers\Api\Admin\WhatsappController as AdminWhatsappController;
use App\Http\Controllers\Api\Admin\PlanController as AdminPlanController;
use App\Http\Controllers\Api\Admin\ViewProfileController as AdminViewProfileController;
use App\Http\Controllers\Api\Admin\AdminCreditController;
use App\Http\Controllers\Api\Admin\AdminLlmProviderController;
use App\Http\Controllers\Api\Admin\PaymentGatewayController;
use App\Http\Controllers\Api\CreditController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\KnowledgeBaseController;
use App\Http\Controllers\Api\TelegramController;
use App\Http\Controllers\Api\WebchatController;
use App\Http\Controllers\Api\SetupController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes - AiYou Assist SaaS Portal
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
    Route::post('/whatsapp-service', [WebhookController::class, 'whatsappService']);
    Route::post('/telegram-service', [WebhookController::class, 'telegramService']);
    Route::post('/webchat-service', [WebhookController::class, 'webchatService']);
});

// Public routes (plans, etc.)
Route::get('/plans', [PlanController::class, 'index']);

// Internal service routes (protected by X-Internal-Key header)
Route::prefix('internal')->group(function () {
    Route::get('/llm-providers/{tenantId}/default', [LlmProviderController::class, 'internalGetDefault']);
    Route::get('/credits/check/{tenantId}', [CreditController::class, 'internalCheckBalance']);
    Route::post('/credits/deduct', [CreditController::class, 'internalDeduct']);
});

// Authenticated routes
Route::middleware(['auth:sanctum', 'tenant.context', 'tenant.rate', 'tenant.active', 'tenant.billing', 'tenant.guard'])->group(function () {
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

    // Plans (authenticated view with more details)
    Route::get('/plans/{plan}', [PlanController::class, 'show']);

    // =========================================================================
    // SaaS Portal Modules
    // =========================================================================

    // 0. Setup Status
    Route::get('/setup-status', [SetupController::class, 'index']);

    // 1. Overview
    Route::get('/overview', [OverviewController::class, 'index']);

    // 2. Subscription
    Route::prefix('subscription')->group(function () {
        Route::get('/', [SubscriptionController::class, 'show']);
        Route::get('/invoices', [SubscriptionController::class, 'invoices']);
        Route::post('/change-plan', [SubscriptionController::class, 'changePlan']);
        Route::post('/cancel', [SubscriptionController::class, 'cancel']);
        Route::get('/invoices/{invoice}/link', [SubscriptionController::class, 'invoiceLink']);
    });

    // 3. WhatsApp Connection (existing + enhanced)
    Route::prefix('whatsapp')->group(function () {
        Route::get('/sessions', [WhatsappController::class, 'index']);
        Route::post('/sessions', [WhatsappController::class, 'store']);
        Route::get('/sessions/{session}', [WhatsappController::class, 'show']);
        Route::delete('/sessions/{session}', [WhatsappController::class, 'destroy']);
        Route::post('/sessions/{session}/connect', [WhatsappController::class, 'connect']);
        Route::post('/sessions/{session}/disconnect', [WhatsappController::class, 'disconnect']);
        Route::get('/sessions/{session}/qr', [WhatsappController::class, 'qrCode']);
        Route::get('/sessions/{session}/status', [WhatsappController::class, 'status']);
        Route::get('/sessions/{session}/diagnostics', [WhatsappController::class, 'diagnostics']);
        Route::post('/sessions/{session}/heartbeat', [WhatsappController::class, 'heartbeat']);
    });

    // 4. Integrations
    Route::prefix('integrations')->group(function () {
        Route::get('/', [IntegrationController::class, 'index']);
        Route::post('/', [IntegrationController::class, 'store']);
        Route::get('/{integration}', [IntegrationController::class, 'show']);
        Route::put('/{integration}', [IntegrationController::class, 'update']);
        Route::delete('/{integration}', [IntegrationController::class, 'destroy']);
        Route::post('/{integration}/enable', [IntegrationController::class, 'enable']);
        Route::post('/{integration}/disable', [IntegrationController::class, 'disable']);
        Route::post('/{integration}/test', [IntegrationController::class, 'test']);
        Route::get('/{integration}/logs', [IntegrationController::class, 'logs']);
    });

    // 5. Customer API
    Route::prefix('customer-api')->group(function () {
        Route::get('/connections', [CustomerApiController::class, 'index']);
        Route::post('/connections', [CustomerApiController::class, 'store']);
        Route::get('/connections/{connection}', [CustomerApiController::class, 'show']);
        Route::put('/connections/{connection}', [CustomerApiController::class, 'update']);
        Route::delete('/connections/{connection}', [CustomerApiController::class, 'destroy']);
        Route::get('/connections/{connection}/endpoints', [CustomerApiController::class, 'endpoints']);
        Route::post('/connections/{connection}/test', [CustomerApiController::class, 'test']);
        Route::get('/connections/{connection}/logs', [CustomerApiController::class, 'logs']);
    });

    // 6. Webhook Management
    Route::prefix('webhook-endpoints')->group(function () {
        Route::get('/system-urls', [WebhookManagementController::class, 'systemUrls']);
        Route::get('/', [WebhookManagementController::class, 'index']);
        Route::post('/', [WebhookManagementController::class, 'store']);
        Route::get('/{endpoint}', [WebhookManagementController::class, 'show']);
        Route::put('/{endpoint}', [WebhookManagementController::class, 'update']);
        Route::delete('/{endpoint}', [WebhookManagementController::class, 'destroy']);
        Route::post('/{endpoint}/test', [WebhookManagementController::class, 'test']);
        Route::post('/{endpoint}/replay/{delivery}', [WebhookManagementController::class, 'replay']);
        Route::get('/{endpoint}/deliveries', [WebhookManagementController::class, 'deliveries']);
    });

    // 7. Logs
    Route::get('/logs', [LogController::class, 'index']);

    // 8. Audit
    Route::prefix('audit')->group(function () {
        Route::get('/', [AuditController::class, 'index']);
        Route::get('/export', [AuditController::class, 'export']);
    });

    // 9. Team
    Route::prefix('team')->group(function () {
        Route::get('/members', [TeamController::class, 'index']);
        Route::post('/members', [TeamController::class, 'store']);
        Route::put('/members/{user}', [TeamController::class, 'update']);
        Route::delete('/members/{user}', [TeamController::class, 'destroy']);
        Route::post('/invite', [TeamController::class, 'invite']);
        Route::get('/roles', [TeamController::class, 'roles']);
        Route::get('/tokens', [TeamController::class, 'tokens']);
        Route::post('/tokens', [TeamController::class, 'createToken']);
        Route::delete('/tokens/{token}', [TeamController::class, 'revokeToken']);
    });

    // 10. Settings
    Route::prefix('settings')->group(function () {
        Route::get('/', [SettingsController::class, 'index']);
        Route::put('/company', [SettingsController::class, 'updateCompany']);
        Route::put('/notifications', [SettingsController::class, 'updateNotifications']);
        Route::get('/credentials', [SettingsController::class, 'credentials']);
        Route::put('/credentials', [SettingsController::class, 'updateCredentials']);
        Route::post('/credentials/test', [SettingsController::class, 'testCredentials']);
        Route::get('/ai', [SettingsController::class, 'aiSettings']);
        Route::put('/ai', [SettingsController::class, 'updateAiSettings']);
        Route::post('/ai/test', [SettingsController::class, 'testAiConnection']);
    });

    // 11. Subscription create (for checkout flow)
    Route::post('/subscription/create', [SubscriptionController::class, 'createSubscription']);

    // 12. Agent Settings (AI agent configuration)
    Route::prefix('agent-settings')->group(function () {
        Route::get('/', [AgentSettingController::class, 'show']);
        Route::put('/', [AgentSettingController::class, 'update']);
        Route::post('/test-prompt', [AgentSettingController::class, 'testPrompt']);
    });

    // 13. LLM Providers (multi-provider AI management & credit monitoring)
    Route::prefix('llm-providers')->group(function () {
        Route::get('/dashboard', [LlmProviderController::class, 'dashboard']);
        Route::get('/openrouter-models', [LlmProviderController::class, 'openrouterModels']);
        Route::get('/', [LlmProviderController::class, 'index']);
        Route::post('/', [LlmProviderController::class, 'store']);
        Route::get('/{provider}', [LlmProviderController::class, 'show']);
        Route::put('/{provider}', [LlmProviderController::class, 'update']);
        Route::delete('/{provider}', [LlmProviderController::class, 'destroy']);
        Route::post('/{provider}/test', [LlmProviderController::class, 'test']);
        Route::post('/{provider}/set-default', [LlmProviderController::class, 'setDefault']);
    });

    // 14. Conversations
    Route::prefix('conversations')->group(function () {
        Route::get('/', [ConversationController::class, 'index']);
        Route::get('/queue-stats', [ConversationController::class, 'queueStats']);
        Route::get('/{conversation}', [ConversationController::class, 'show']);
        Route::post('/{conversation}/assign', [ConversationController::class, 'assign']);
        Route::post('/{conversation}/return-to-ai', [ConversationController::class, 'returnToAi']);
        Route::post('/{conversation}/resolve', [ConversationController::class, 'resolve']);
        Route::post('/{conversation}/message', [ConversationController::class, 'sendMessage']);
    });

    // 15. Knowledge Base
    Route::prefix('knowledge-base')->group(function () {
        Route::get('/', [KnowledgeBaseController::class, 'index']);
        Route::post('/', [KnowledgeBaseController::class, 'store']);
        Route::put('/{entry}', [KnowledgeBaseController::class, 'update']);
        Route::delete('/{entry}', [KnowledgeBaseController::class, 'destroy']);
        Route::get('/categories', [KnowledgeBaseController::class, 'categories']);
    });

    // 15. Telegram
    Route::prefix('telegram')->group(function () {
        Route::get('/bots', [TelegramController::class, 'index']);
        Route::post('/bots', [TelegramController::class, 'store']);
        Route::get('/bots/{bot}', [TelegramController::class, 'show']);
        Route::delete('/bots/{bot}', [TelegramController::class, 'destroy']);
        Route::post('/bots/{bot}/connect', [TelegramController::class, 'connect']);
        Route::post('/bots/{bot}/disconnect', [TelegramController::class, 'disconnect']);
        Route::post('/bots/{bot}/test', [TelegramController::class, 'test']);
    });

    // 16. Webchat
    Route::prefix('webchat')->group(function () {
        Route::get('/widget', [WebchatController::class, 'index']);
        Route::post('/widget', [WebchatController::class, 'store']);
        Route::put('/widget/{widget}', [WebchatController::class, 'update']);
        Route::delete('/widget/{widget}', [WebchatController::class, 'destroy']);
        Route::post('/widget/{widget}/activate', [WebchatController::class, 'activate']);
        Route::post('/widget/{widget}/deactivate', [WebchatController::class, 'deactivate']);
        Route::get('/widget/{widget}/embed-code', [WebchatController::class, 'embedCode']);
    });

    // 17. Credits (tenant-facing)
    Route::prefix('credits')->group(function () {
        Route::get('/balance', [CreditController::class, 'balance']);
        Route::get('/transactions', [CreditController::class, 'transactions']);
        Route::get('/packages', [CreditController::class, 'packages']);
        Route::post('/purchase/{package}', [CreditController::class, 'purchase']);
    });

    // =========================================================================
    // View Profiles (tenant-facing - get own profile)
    // =========================================================================
    Route::get('/view-profile', function (\Illuminate\Http\Request $request) {
        $tenant = $request->user()->tenant;
        $profile = $tenant->viewProfile;
        $allProfiles = \App\Models\ViewProfile::active()->get(['id', 'name', 'slug', 'menu_items']);
        return response()->json([
            'current' => $profile ? $profile->only(['id', 'name', 'slug', 'menu_items']) : null,
            'available' => $allProfiles,
        ]);
    });

    // =========================================================================
    // Admin View Profiles Management
    // =========================================================================
    Route::prefix('admin/view-profiles')->middleware('role:admin')->group(function () {
        Route::get('/', [AdminViewProfileController::class, 'index']);
        Route::get('/menu-items', [AdminViewProfileController::class, 'menuItems']);
        Route::post('/', [AdminViewProfileController::class, 'store']);
        Route::get('/{profile}', [AdminViewProfileController::class, 'show']);
        Route::put('/{profile}', [AdminViewProfileController::class, 'update']);
        Route::delete('/{profile}', [AdminViewProfileController::class, 'destroy']);
        Route::post('/{profile}/assign/{tenant}', [AdminViewProfileController::class, 'assignToTenant']);
    });

    // =========================================================================
    // Admin Credits Management
    // =========================================================================
    Route::prefix('admin/credits')->middleware('role:admin')->group(function () {
        Route::get('/packages', [AdminCreditController::class, 'packages']);
        Route::post('/packages', [AdminCreditController::class, 'createPackage']);
        Route::put('/packages/{package}', [AdminCreditController::class, 'updatePackage']);
        Route::delete('/packages/{package}', [AdminCreditController::class, 'deletePackage']);
        Route::get('/settings', [AdminCreditController::class, 'settings']);
        Route::put('/settings', [AdminCreditController::class, 'updateSettings']);
        Route::post('/tenants/{tenant}/credit', [AdminCreditController::class, 'manualCredit']);
        Route::get('/tenants', [AdminCreditController::class, 'tenantBalances']);
    });

    // =========================================================================
    // Admin LLM Providers (global providers management)
    // =========================================================================
    Route::prefix('admin/llm-providers')->middleware('role:admin')->group(function () {
        Route::get('/', [AdminLlmProviderController::class, 'index']);
        Route::post('/', [AdminLlmProviderController::class, 'store']);
        Route::put('/{provider}', [AdminLlmProviderController::class, 'update']);
        Route::delete('/{provider}', [AdminLlmProviderController::class, 'destroy']);
        Route::post('/{provider}/test', [AdminLlmProviderController::class, 'test']);
        Route::post('/{provider}/set-default', [AdminLlmProviderController::class, 'setDefault']);
        Route::get('/tenant-overrides', [AdminLlmProviderController::class, 'tenantOverrides']);
    });

    // =========================================================================
    // Admin WhatsApp / Moltbot Management
    // =========================================================================
    Route::prefix('admin/whatsapp')->middleware('role:admin')->group(function () {
        Route::get('/overview', [AdminWhatsappController::class, 'overview']);
        Route::get('/sessions', [AdminWhatsappController::class, 'allSessions']);
        Route::get('/gateway/info', [AdminWhatsappController::class, 'gatewayInfo']);
        Route::get('/gateway/config', [AdminWhatsappController::class, 'gatewayConfig']);
        Route::post('/gateway/config', [AdminWhatsappController::class, 'updateGatewayConfig']);
        Route::post('/gateway/channels/login', [AdminWhatsappController::class, 'channelLogin']);
        Route::post('/gateway/channels/logout', [AdminWhatsappController::class, 'channelLogout']);
        Route::get('/gateway/sessions', [AdminWhatsappController::class, 'gatewaySessions']);
    });

    // =========================================================================
    // Admin Plan Management
    // =========================================================================
    Route::prefix('admin/plans')->middleware('role:admin')->group(function () {
        Route::get('/', [AdminPlanController::class, 'index']);
        Route::post('/', [AdminPlanController::class, 'store']);
        Route::get('/{plan}', [AdminPlanController::class, 'show']);
        Route::put('/{plan}', [AdminPlanController::class, 'update']);
        Route::delete('/{plan}', [AdminPlanController::class, 'destroy']);
        Route::post('/{plan}/limits', [AdminPlanController::class, 'addLimit']);
        Route::delete('/{plan}/limits/{limit}', [AdminPlanController::class, 'removeLimit']);
    });

    // =========================================================================
    // Admin Billing Management
    // =========================================================================
    Route::prefix('admin/billing')->middleware('role:admin')->group(function () {
        Route::get('/overview', [AdminBillingController::class, 'overview']);
        Route::get('/subscribers', [AdminBillingController::class, 'subscribers']);
        Route::get('/subscribers/{tenant}', [AdminBillingController::class, 'subscriberDetail']);
        Route::get('/subscribers/{tenant}/financial', [AdminBillingController::class, 'subscriberFinancialDetail']);
        Route::post('/subscribers/{tenant}/block', [AdminBillingController::class, 'blockTenant']);
        Route::post('/subscribers/{tenant}/unblock', [AdminBillingController::class, 'unblockTenant']);
        Route::post('/subscribers/{tenant}/send-invoice', [AdminBillingController::class, 'sendInvoiceLink']);
        Route::post('/subscribers/{tenant}/grant-credits', [AdminBillingController::class, 'grantCredits']);
        Route::post('/invoices/{invoice}/approve', [AdminBillingController::class, 'approvePayment']);
        Route::get('/invoices', [AdminBillingController::class, 'allInvoices']);
        Route::get('/events', [AdminBillingController::class, 'billingEvents']);
    });

    // =========================================================================
    // Admin Payment Gateway Management
    // =========================================================================
    Route::prefix('admin/payment-gateways')->middleware('role:admin')->group(function () {
        Route::get('/', [PaymentGatewayController::class, 'index']);
        Route::put('/{provider}', [PaymentGatewayController::class, 'update']);
        Route::post('/{provider}/test', [PaymentGatewayController::class, 'test']);
    });
});
