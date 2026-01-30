<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\ViewProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ViewProfileController extends Controller
{
    public function index(): JsonResponse
    {
        $profiles = ViewProfile::active()
            ->withCount('tenants')
            ->orderBy('is_system', 'desc')
            ->orderBy('name')
            ->get();

        return response()->json(['profiles' => $profiles]);
    }

    public function menuItems(): JsonResponse
    {
        return response()->json([
            'items' => collect(ViewProfile::ALL_MENU_ITEMS)->map(fn($label, $key) => [
                'key' => $key,
                'label' => $label,
            ])->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:500',
            'menu_items' => 'required|array|min:1',
            'menu_items.*' => 'string|in:' . implode(',', array_keys(ViewProfile::ALL_MENU_ITEMS)),
        ]);

        $validated['slug'] = Str::slug($validated['name']);

        if (ViewProfile::where('slug', $validated['slug'])->exists()) {
            return response()->json(['error' => 'Já existe um perfil com esse nome'], 422);
        }

        $profile = ViewProfile::create($validated);

        return response()->json(['profile' => $profile], 201);
    }

    public function show(ViewProfile $profile): JsonResponse
    {
        $profile->loadCount('tenants');
        return response()->json(['profile' => $profile]);
    }

    public function update(Request $request, ViewProfile $profile): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:500',
            'menu_items' => 'sometimes|array|min:1',
            'menu_items.*' => 'string|in:' . implode(',', array_keys(ViewProfile::ALL_MENU_ITEMS)),
            'is_active' => 'sometimes|boolean',
        ]);

        // System profiles can't have slug changed
        if ($profile->is_system && isset($validated['name'])) {
            unset($validated['name']);
        }

        $profile->update($validated);

        return response()->json(['profile' => $profile->fresh()]);
    }

    public function destroy(ViewProfile $profile): JsonResponse
    {
        if ($profile->is_system) {
            return response()->json(['error' => 'Perfis do sistema não podem ser excluídos'], 403);
        }

        // Move tenants to default "comum" profile
        $defaultProfile = ViewProfile::where('slug', 'comum')->first();
        if ($defaultProfile) {
            Tenant::where('view_profile_id', $profile->id)
                ->update(['view_profile_id' => $defaultProfile->id]);
        }

        $profile->delete();

        return response()->json(['message' => 'Perfil excluído']);
    }

    public function assignToTenant(ViewProfile $profile, string $tenantId): JsonResponse
    {
        $tenant = Tenant::findOrFail($tenantId);
        $tenant->update(['view_profile_id' => $profile->id]);

        return response()->json([
            'message' => "Perfil '{$profile->name}' atribuído ao tenant '{$tenant->name}'",
        ]);
    }
}
