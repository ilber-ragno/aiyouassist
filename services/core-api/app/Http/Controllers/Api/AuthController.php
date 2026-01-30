<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use App\Services\ExecutionLogService;
use App\Services\SecurityAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}
    /**
     * Register new tenant and admin user
     */
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_name' => 'required|string|max:255',
            'name' => 'required|string|max:255',
            'email' => 'required|email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        // Create tenant
        $tenant = Tenant::create([
            'name' => $validated['company_name'],
            'slug' => Str::slug($validated['company_name']) . '-' . Str::random(6),
            'status' => Tenant::STATUS_TRIAL,
        ]);

        // Set tenant context
        app()->instance('current_tenant_id', $tenant->id);

        // Create admin user
        $user = User::create([
            'tenant_id' => $tenant->id,
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password_hash' => $validated['password'],
        ]);

        // Assign admin role via direct DB
        $adminRole = \DB::table('roles')->where('tenant_id', $tenant->id)->where('name', 'admin')->first();
        if (!$adminRole) {
            $roleId = \Illuminate\Support\Str::uuid()->toString();
            \DB::table('roles')->insert([
                'id' => $roleId,
                'tenant_id' => $tenant->id,
                'name' => 'admin',
                'description' => 'Administrator',
                'is_system' => true,
                'created_at' => now(),
            ]);
            \DB::table('user_roles')->insert([
                'user_id' => $user->id,
                'role_id' => $roleId,
            ]);
        }

        // Create trial subscription
        $trialPlan = \App\Models\Plan::where('is_active', true)->orderBy('price_monthly')->first();
        if ($trialPlan) {
            \App\Models\Subscription::create([
                'tenant_id' => $tenant->id,
                'plan_id' => $trialPlan->id,
                'status' => 'trial',
                'payment_provider' => 'asaas',
                'current_period_start' => now(),
                'current_period_end' => now()->addDays(14),
            ]);
        }

        // Generate token
        $token = $user->createToken('auth-token')->plainTextToken;

        $this->logService->audit('Novo cadastro (registro)', [
            'tenant_name' => $tenant->name,
            'user_name' => $user->name,
            'user_email' => $user->email,
        ], 'auth');

        $viewProfile = $tenant->viewProfile;
        $availableProfiles = \App\Models\ViewProfile::active()->get(['id', 'name', 'slug', 'menu_items']);

        return response()->json([
            'message' => 'Registration successful',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'roles' => $user->roles->pluck('name'),
            ],
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'plan' => $tenant->getCurrentPlan()?->only(['name', 'slug']),
                'view_profile' => $viewProfile ? $viewProfile->only(['id', 'name', 'slug', 'menu_items']) : null,
                'available_profiles' => $availableProfiles,
            ],
            'token' => $token,
        ], 201);
    }

    /**
     * Login
     */
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        // Find user without tenant scope
        $user = User::withoutGlobalScope('tenant')
            ->where('email', $validated['email'])
            ->first();

        if (!$user || !Hash::check($validated['password'], $user->password_hash)) {
            SecurityAuditService::loginFailed($validated['email']);
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['Your account has been deactivated.'],
            ]);
        }

        // Check tenant status
        $tenant = $user->tenant;
        if (!$tenant->isActive()) {
            throw ValidationException::withMessages([
                'email' => ['Your company account is not active. Status: ' . $tenant->status],
            ]);
        }

        // Record login
        $user->recordLogin();

        // Log login
        app()->instance('current_tenant_id', $tenant->id);
        $this->logService->audit('Login realizado', [
            'user_name' => $user->name,
            'user_email' => $user->email,
            'ip' => $request->ip(),
        ], 'auth');

        // Security audit
        SecurityAuditService::loginSuccess($user->id, $user->email, $tenant->id);

        // Generate token
        $token = $user->createToken('auth-token')->plainTextToken;

        $viewProfile = $tenant->viewProfile;
        $availableProfiles = \App\Models\ViewProfile::active()->get(['id', 'name', 'slug', 'menu_items']);

        return response()->json([
            'message' => 'Login successful',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'roles' => $user->roles->pluck('name'),
            ],
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'plan' => $tenant->getCurrentPlan()?->only(['name', 'slug']),
                'view_profile' => $viewProfile ? $viewProfile->only(['id', 'name', 'slug', 'menu_items']) : null,
                'available_profiles' => $availableProfiles,
            ],
            'token' => $token,
        ]);
    }

    /**
     * Logout
     */
    public function logout(Request $request): JsonResponse
    {
        $this->logService->audit('Logout realizado', [
            'user_name' => $request->user()->name,
            'user_email' => $request->user()->email,
        ], 'auth');

        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully',
        ]);
    }

    /**
     * Get current user
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('tenant.viewProfile', 'roles');
        $tenant = $user->tenant;
        $viewProfile = $tenant->viewProfile;
        $availableProfiles = \App\Models\ViewProfile::active()->get(['id', 'name', 'slug', 'menu_items']);

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar_url' => $user->avatar_url,
                'roles' => $user->roles->pluck('name'),
                'permissions' => [],
            ],
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'plan' => $tenant->getCurrentPlan()?->only(['name', 'slug']),
                'view_profile' => $viewProfile ? $viewProfile->only(['id', 'name', 'slug', 'menu_items']) : null,
                'available_profiles' => $availableProfiles,
            ],
        ]);
    }

    /**
     * Refresh token
     */
    public function refresh(Request $request): JsonResponse
    {
        $user = $request->user();

        // Delete current token
        $user->currentAccessToken()->delete();

        // Create new token
        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'token' => $token,
        ]);
    }
}
