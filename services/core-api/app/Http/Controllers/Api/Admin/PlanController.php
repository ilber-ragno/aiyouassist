<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\PlanLimit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PlanController extends Controller
{
    public function index(): JsonResponse
    {
        $plans = Plan::with('limits')
            ->orderBy('price_monthly')
            ->get();

        return response()->json(['plans' => $plans]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'description' => 'nullable|string',
            'price_monthly' => 'required|numeric|min:0',
            'price_yearly' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'is_active' => 'boolean',
            'features' => 'nullable|array',
            'included_credits_brl' => 'nullable|numeric|min:0',
            'limits' => 'nullable|array',
            'limits.*.limit_key' => 'required_with:limits|string',
            'limits.*.limit_value' => 'required_with:limits|integer',
            'limits.*.description' => 'nullable|string',
        ]);

        $plan = Plan::create([
            'name' => $validated['name'],
            'slug' => Str::slug($validated['name']),
            'description' => $validated['description'] ?? null,
            'price_monthly' => $validated['price_monthly'],
            'price_yearly' => $validated['price_yearly'] ?? $validated['price_monthly'] * 10,
            'currency' => $validated['currency'] ?? 'BRL',
            'is_active' => $validated['is_active'] ?? true,
            'features' => $validated['features'] ?? [],
            'included_credits_brl' => $validated['included_credits_brl'] ?? 0,
        ]);

        if (!empty($validated['limits'])) {
            foreach ($validated['limits'] as $limit) {
                PlanLimit::create([
                    'plan_id' => $plan->id,
                    'limit_key' => $limit['limit_key'],
                    'limit_value' => $limit['limit_value'],
                    'description' => $limit['description'] ?? null,
                ]);
            }
        }

        return response()->json([
            'message' => 'Plan created',
            'plan' => $plan->load('limits'),
        ], 201);
    }

    public function show(Plan $plan): JsonResponse
    {
        return response()->json([
            'plan' => $plan->load('limits'),
        ]);
    }

    public function update(Request $request, Plan $plan): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'description' => 'nullable|string',
            'price_monthly' => 'sometimes|numeric|min:0',
            'price_yearly' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'is_active' => 'sometimes|boolean',
            'features' => 'nullable|array',
            'included_credits_brl' => 'nullable|numeric|min:0',
        ]);

        if (isset($validated['name'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $plan->update($validated);

        return response()->json([
            'message' => 'Plan updated',
            'plan' => $plan->load('limits'),
        ]);
    }

    public function destroy(Plan $plan): JsonResponse
    {
        $activeSubscriptions = $plan->subscriptions()->where('status', 'active')->count();

        if ($activeSubscriptions > 0) {
            return response()->json([
                'error' => "Nao e possivel excluir: {$activeSubscriptions} assinaturas ativas neste plano",
            ], 422);
        }

        $plan->limits()->delete();
        $plan->delete();

        return response()->json(['message' => 'Plan deleted']);
    }

    public function addLimit(Request $request, Plan $plan): JsonResponse
    {
        $validated = $request->validate([
            'limit_key' => 'required|string|max:100',
            'limit_value' => 'required|integer',
            'description' => 'nullable|string',
        ]);

        $limit = PlanLimit::updateOrCreate(
            ['plan_id' => $plan->id, 'limit_key' => $validated['limit_key']],
            ['limit_value' => $validated['limit_value'], 'description' => $validated['description'] ?? null]
        );

        return response()->json([
            'message' => 'Limit saved',
            'limit' => $limit,
        ]);
    }

    public function removeLimit(Plan $plan, PlanLimit $limit): JsonResponse
    {
        if ($limit->plan_id !== $plan->id) {
            return response()->json(['error' => 'Limit does not belong to this plan'], 404);
        }

        $limit->delete();

        return response()->json(['message' => 'Limit removed']);
    }
}
