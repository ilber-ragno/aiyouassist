<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WebchatWidget;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WebchatController extends Controller
{
    /**
     * Get the widget for current tenant (one per tenant).
     */
    public function index(): JsonResponse
    {
        $widget = WebchatWidget::first();

        return response()->json(['widget' => $widget]);
    }

    /**
     * Create a new webchat widget.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'primary_color' => 'sometimes|string|max:7',
            'welcome_message' => 'sometimes|string|max:500',
            'bot_name' => 'sometimes|string|max:255',
            'position' => 'sometimes|in:left,right',
            'allowed_domains' => 'nullable|string|max:1000',
        ]);

        $tenantId = app('current_tenant_id');

        // Only one widget per tenant
        $existing = WebchatWidget::first();
        if ($existing) {
            return response()->json(['message' => 'Widget já existe para este tenant'], 409);
        }

        $widget = WebchatWidget::create([
            'tenant_id' => $tenantId,
            'widget_key' => Str::random(32),
            ...$validated,
        ]);

        return response()->json(['widget' => $widget], 201);
    }

    /**
     * Update widget configuration.
     */
    public function update(Request $request, string $widget): JsonResponse
    {
        $webchatWidget = WebchatWidget::findOrFail($widget);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'primary_color' => 'sometimes|string|max:7',
            'welcome_message' => 'sometimes|string|max:500',
            'bot_name' => 'sometimes|string|max:255',
            'position' => 'sometimes|in:left,right',
            'allowed_domains' => 'nullable|string|max:1000',
        ]);

        $webchatWidget->update($validated);

        return response()->json(['widget' => $webchatWidget->fresh()]);
    }

    /**
     * Delete widget.
     */
    public function destroy(string $widget): JsonResponse
    {
        WebchatWidget::findOrFail($widget)->delete();

        return response()->json(['message' => 'Widget removido']);
    }

    /**
     * Activate widget.
     */
    public function activate(string $widget): JsonResponse
    {
        $w = WebchatWidget::findOrFail($widget);
        $w->activate();

        return response()->json(['widget' => $w->fresh()]);
    }

    /**
     * Deactivate widget.
     */
    public function deactivate(string $widget): JsonResponse
    {
        $w = WebchatWidget::findOrFail($widget);
        $w->deactivate();

        return response()->json(['widget' => $w->fresh()]);
    }

    /**
     * Get the embed code snippet.
     */
    public function embedCode(string $widget): JsonResponse
    {
        $w = WebchatWidget::findOrFail($widget);
        $publicUrl = config('services.webchat.public_url', 'https://chat.meuaiyou.cloud');
        $code = "<script src=\"{$publicUrl}/widget.js\" data-key=\"{$w->widget_key}\" async></script>";

        return response()->json([
            'embed_code' => $code,
            'widget_key' => $w->widget_key,
        ]);
    }
}
