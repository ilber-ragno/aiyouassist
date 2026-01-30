<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    /**
     * List all active plans (public endpoint)
     */
    public function index(): JsonResponse
    {
        $plans = Plan::active()
            ->with('limits')
            ->orderBy('price_monthly', 'asc')
            ->get()
            ->map(fn(Plan $plan) => [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'description' => $plan->description,
                'price_monthly' => $plan->price_monthly,
                'price_yearly' => $plan->price_yearly,
                'currency' => $plan->currency,
                'features' => $plan->features,
                'limits' => $plan->limits->map(fn($l) => [
                    'limit_key' => $l->limit_key,
                    'limit_value' => $l->limit_value,
                    'description' => $l->description ?? $l->limit_key,
                ]),
                'is_active' => $plan->is_active,
                'yearly_savings' => $plan->getYearlySavings(),
                'yearly_savings_percent' => $plan->getYearlySavingsPercent(),
            ]);

        return response()->json([
            'plans' => $plans,
        ]);
    }

    /**
     * Show plan details (authenticated endpoint)
     */
    public function show(Plan $plan): JsonResponse
    {
        $plan->load('limits');

        return response()->json([
            'plan' => [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'description' => $plan->description,
                'price_monthly' => $plan->price_monthly,
                'price_yearly' => $plan->price_yearly,
                'currency' => $plan->currency,
                'is_active' => $plan->is_active,
                'features' => $plan->features,
                'limits' => $plan->limits->pluck('limit_value', 'limit_key'),
                'yearly_savings' => $plan->getYearlySavings(),
                'yearly_savings_percent' => $plan->getYearlySavingsPercent(),
            ],
        ]);
    }
}
