<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExecutionLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LogController extends Controller
{
    /**
     * List execution logs with filters
     */
    public function index(Request $request): JsonResponse
    {
        $query = ExecutionLog::orderBy('created_at', 'desc');

        if ($request->has('log_type')) {
            $query->where('log_type', $request->log_type);
        }

        if ($request->has('severity')) {
            $query->where('severity', $request->severity);
        }

        if ($request->has('source')) {
            $query->where('source', $request->source);
        }

        if ($request->has('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }

        if ($request->has('date_to')) {
            $query->where('created_at', '<=', $request->date_to . ' 23:59:59');
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('action', 'ilike', "%{$search}%")
                  ->orWhere('source', 'ilike', "%{$search}%")
                  ->orWhereRaw("details::text ilike ?", ["%{$search}%"]);
            });
        }

        $logs = $query->paginate($request->input('per_page', 50));

        return response()->json(['logs' => $logs]);
    }
}
