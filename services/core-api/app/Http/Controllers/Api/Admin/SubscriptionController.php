<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    /**
     * Show current subscription details
     */
    public function show(Request $request): JsonResponse
    {
        // TODO: Implement subscription details retrieval
        return response()->json([
            'message' => 'TODO: Subscription details',
            'subscription' => null,
        ]);
    }

    /**
     * Change the current plan
     */
    public function changePlan(Request $request): JsonResponse
    {
        $request->validate([
            'plan_id' => 'required|uuid|exists:plans,id',
        ]);

        // TODO: Implement plan change via billing service
        return response()->json([
            'message' => 'TODO: Plan change not yet implemented',
        ], 501);
    }

    /**
     * Cancel the current subscription
     */
    public function cancel(Request $request): JsonResponse
    {
        // TODO: Implement subscription cancellation via billing service
        return response()->json([
            'message' => 'TODO: Subscription cancellation not yet implemented',
        ], 501);
    }

    /**
     * List invoices for the current subscription
     */
    public function invoices(Request $request): JsonResponse
    {
        // TODO: Implement invoice listing via billing service
        return response()->json([
            'invoices' => [],
            'pagination' => [
                'current_page' => 1,
                'last_page' => 1,
                'per_page' => 20,
                'total' => 0,
            ],
        ]);
    }

    /**
     * Get billing portal URL
     */
    public function billingPortal(Request $request): JsonResponse
    {
        // TODO: Implement billing portal URL generation (Stripe/Asaas)
        return response()->json([
            'message' => 'TODO: Billing portal not yet implemented',
            'url' => null,
        ], 501);
    }
}
