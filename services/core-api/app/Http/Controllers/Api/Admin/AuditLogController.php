<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * List audit logs for the current tenant
     */
    public function index(Request $request): JsonResponse
    {
        // TODO: Implement audit log retrieval from audit_logs table
        return response()->json([
            'audit_logs' => [],
            'pagination' => [
                'current_page' => 1,
                'last_page' => 1,
                'per_page' => $request->input('per_page', 20),
                'total' => 0,
            ],
        ]);
    }
}
