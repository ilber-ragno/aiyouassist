<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class SetupController extends Controller
{
    public function index(Request $request)
    {
        $tenant = $request->user()->tenant;

        // Step 1: Company - name exists and is not just the auto-generated slug
        $companyComplete = !empty($tenant->name)
            && $tenant->name !== $tenant->slug
            && strlen($tenant->name) > 2;

        // Step 2: WhatsApp - at least one connected session
        $whatsappComplete = $tenant->whatsappSessions()
            ->where('status', 'connected')
            ->exists();

        // Step 3: Agent - persona is configured
        $agentComplete = $tenant->agentSettings()
            ->whereNotNull('persona')
            ->where('persona', '!=', '')
            ->exists();

        // Step 4: All previous steps complete
        $allPreviousComplete = $companyComplete && $whatsappComplete && $agentComplete;

        $steps = [
            'company' => [
                'complete' => $companyComplete,
                'label' => 'Dados da Empresa',
            ],
            'whatsapp' => [
                'complete' => $whatsappComplete,
                'label' => 'Conectar WhatsApp',
            ],
            'agent' => [
                'complete' => $agentComplete,
                'label' => 'Configurar Agente IA',
            ],
            'test' => [
                'complete' => $allPreviousComplete,
                'label' => 'Tudo Pronto',
            ],
        ];

        $completed = collect($steps)->where('complete', true)->count();

        return response()->json([
            'steps' => $steps,
            'completed' => $completed,
            'total' => 4,
            'all_complete' => $allPreviousComplete,
        ]);
    }
}
