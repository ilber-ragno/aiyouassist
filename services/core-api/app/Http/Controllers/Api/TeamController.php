<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TeamController extends Controller
{
    public function __construct(
        protected ExecutionLogService $logService
    ) {}

    /**
     * List team members
     */
    public function index(Request $request): JsonResponse
    {
        $members = User::with('roles:id,name')
            ->orderBy('name')
            ->get()
            ->map(fn($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'is_active' => $u->is_active,
                'roles' => $u->roles->pluck('name'),
                'last_login_at' => $u->last_login_at,
                'created_at' => $u->created_at,
            ]);

        return response()->json(['members' => $members]);
    }

    /**
     * Create team member
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'role' => 'required|string|exists:roles,name',
        ]);

        // Verificar limite de usuarios do plano
        $tenant = $request->user()->tenant;
        $currentCount = $tenant->users()->count();
        if ($tenant->exceedsLimit('users', $currentCount)) {
            return $tenant->limitExceededResponse('users', 'usuarios');
        }

        $tempPassword = Str::random(12);

        $user = User::create([
            'tenant_id' => $request->user()->tenant_id,
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password_hash' => Hash::make($tempPassword),
            'is_active' => true,
        ]);

        $role = Role::where('name', $validated['role'])
            ->where('tenant_id', $request->user()->tenant_id)
            ->first();

        if ($role) {
            $user->roles()->attach($role->id);
        }

        $this->logService->audit('team.member_created', [
            'user_id' => $user->id,
            'email' => $user->email,
            'role' => $validated['role'],
        ]);

        return response()->json([
            'member' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'temp_password' => $tempPassword,
            ],
        ], 201);
    }

    /**
     * Update team member
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'is_active' => 'sometimes|boolean',
            'role' => 'sometimes|string|exists:roles,name',
        ]);

        if (isset($validated['name'])) {
            $user->update(['name' => $validated['name']]);
        }

        if (isset($validated['is_active'])) {
            $user->update(['is_active' => $validated['is_active']]);
        }

        if (isset($validated['role'])) {
            $role = Role::where('name', $validated['role'])
                ->where('tenant_id', $request->user()->tenant_id)
                ->first();
            if ($role) {
                $user->roles()->sync([$role->id]);
            }
        }

        $this->logService->audit('team.member_updated', [
            'user_id' => $user->id,
            'changes' => $validated,
        ]);

        return response()->json(['message' => 'Member updated']);
    }

    /**
     * Remove team member
     */
    public function destroy(User $user, Request $request): JsonResponse
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['error' => 'Cannot remove yourself'], 400);
        }

        $this->logService->audit('team.member_removed', [
            'user_id' => $user->id,
            'email' => $user->email,
        ]);

        $user->update(['is_active' => false]);
        $user->delete();

        return response()->json(['message' => 'Member removed']);
    }

    /**
     * Send invite (placeholder)
     */
    public function invite(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'role' => 'required|string',
        ]);

        $this->logService->audit('team.invite_sent', [
            'email' => $request->email,
            'role' => $request->role,
        ]);

        // TODO: Send invitation email
        return response()->json(['message' => 'Invitation sent']);
    }

    /**
     * List available roles
     */
    public function roles(Request $request): JsonResponse
    {
        $roles = Role::where('tenant_id', $request->user()->tenant_id)
            ->orWhereNull('tenant_id')
            ->get(['id', 'name', 'description']);

        return response()->json(['roles' => $roles]);
    }

    /**
     * List API tokens
     */
    public function tokens(Request $request): JsonResponse
    {
        $tokens = $request->user()->tokens()
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'last_used_at' => $t->last_used_at,
                'created_at' => $t->created_at,
            ]);

        return response()->json(['tokens' => $tokens]);
    }

    /**
     * Create API token
     */
    public function createToken(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $token = $request->user()->createToken($validated['name']);

        $this->logService->audit('team.token_created', [
            'token_name' => $validated['name'],
        ]);

        return response()->json([
            'token' => $token->plainTextToken,
            'name' => $validated['name'],
        ], 201);
    }

    /**
     * Revoke API token
     */
    public function revokeToken(string $token, Request $request): JsonResponse
    {
        $request->user()->tokens()->where('id', $token)->delete();

        $this->logService->audit('team.token_revoked', [
            'token_id' => $token,
        ]);

        return response()->json(['message' => 'Token revoked']);
    }
}
