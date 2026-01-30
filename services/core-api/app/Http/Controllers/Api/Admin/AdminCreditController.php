<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CreditPackage;
use App\Models\CreditSetting;
use App\Models\Tenant;
use App\Models\TenantCredit;
use App\Services\CreditService;
use App\Services\ExecutionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminCreditController extends Controller
{
    public function __construct(
        protected CreditService $creditService,
        protected ExecutionLogService $logService
    ) {}

    // =========================================================================
    // Packages CRUD
    // =========================================================================

    public function packages(): JsonResponse
    {
        $packages = CreditPackage::ordered()->get();
        return response()->json(['packages' => $packages]);
    }

    public function createPackage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:500',
            'price_brl' => 'required|numeric|min:0.01',
            'credit_amount_brl' => 'required|numeric|min:0.01',
            'is_active' => 'sometimes|boolean',
            'sort_order' => 'sometimes|integer|min:0',
        ]);

        $package = CreditPackage::create($validated);

        $this->logService->audit('Pacote de créditos criado', [
            'package_id' => $package->id,
            'name' => $package->name,
            'price_brl' => (float) $package->price_brl,
            'credit_amount_brl' => (float) $package->credit_amount_brl,
        ], 'admin');

        return response()->json(['package' => $package], 201);
    }

    public function updatePackage(Request $request, CreditPackage $package): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:500',
            'price_brl' => 'sometimes|numeric|min:0.01',
            'credit_amount_brl' => 'sometimes|numeric|min:0.01',
            'is_active' => 'sometimes|boolean',
            'sort_order' => 'sometimes|integer|min:0',
        ]);

        $oldValues = $package->only(array_keys($validated));
        $package->update($validated);

        $this->logService->audit('Pacote de créditos atualizado', [
            'package_id' => $package->id,
            'name' => $package->name,
            'changes' => $validated,
            'previous' => $oldValues,
        ], 'admin');

        return response()->json(['package' => $package->fresh()]);
    }

    public function deletePackage(CreditPackage $package): JsonResponse
    {
        $packageName = $package->name;
        $packageId = $package->id;
        $package->delete();

        $this->logService->audit('Pacote de créditos excluído', [
            'package_id' => $packageId,
            'name' => $packageName,
        ], 'admin');

        return response()->json(['message' => 'Pacote excluído']);
    }

    // =========================================================================
    // Settings
    // =========================================================================

    public function settings(): JsonResponse
    {
        CreditSetting::clearCache();
        $settings = CreditSetting::current();
        return response()->json(['settings' => $settings]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'markup_type' => 'sometimes|string|in:percentage,fixed_per_1k',
            'markup_value' => 'sometimes|numeric|min:0',
            'usd_to_brl_rate' => 'sometimes|numeric|min:0.01',
            'min_balance_warning_brl' => 'sometimes|numeric|min:0',
            'block_on_zero_balance' => 'sometimes|boolean',
        ]);

        $settings = CreditSetting::first();
        $oldValues = $settings ? $settings->only(array_keys($validated)) : [];

        if (!$settings) {
            $settings = CreditSetting::create($validated);
        } else {
            $settings->update($validated);
        }
        CreditSetting::clearCache();

        $this->logService->audit('Configurações de créditos atualizadas', [
            'changes' => $validated,
            'previous' => $oldValues,
        ], 'admin');

        return response()->json([
            'message' => 'Configurações atualizadas',
            'settings' => $settings->fresh(),
        ]);
    }

    // =========================================================================
    // Manual credit
    // =========================================================================

    public function manualCredit(Request $request, Tenant $tenant): JsonResponse
    {
        $validated = $request->validate([
            'amount_brl' => 'required|numeric|min:0.01',
            'description' => 'required|string|max:500',
        ]);

        $transaction = $this->creditService->addCredits(
            $tenant,
            $validated['amount_brl'],
            'manual_credit',
            $validated['description'],
            'manual',
            null,
            ['admin_user_id' => $request->user()->id]
        );

        $this->logService->audit("Crédito manual: R$ {$validated['amount_brl']} para {$tenant->name}", [
            'tenant_id' => $tenant->id,
            'tenant_name' => $tenant->name,
            'amount_brl' => $validated['amount_brl'],
            'description' => $validated['description'],
            'admin_user' => $request->user()->name,
            'new_balance' => $this->creditService->getBalance($tenant->id),
        ], 'admin');

        return response()->json([
            'message' => "R$ {$validated['amount_brl']} creditados para {$tenant->name}",
            'transaction' => $transaction,
            'new_balance' => $this->creditService->getBalance($tenant->id),
        ]);
    }

    // =========================================================================
    // Tenant balances overview
    // =========================================================================

    public function tenantBalances(): JsonResponse
    {
        $tenants = Tenant::withCount('users')
            ->with('credit')
            ->get()
            ->map(fn($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'status' => $t->status,
                'users_count' => $t->users_count,
                'balance_brl' => (float) ($t->credit?->balance_brl ?? 0),
                'total_purchased_brl' => (float) ($t->credit?->total_purchased_brl ?? 0),
                'total_consumed_brl' => (float) ($t->credit?->total_consumed_brl ?? 0),
            ]);

        return response()->json(['tenants' => $tenants]);
    }
}
