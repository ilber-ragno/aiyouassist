<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExecutionLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuditController extends Controller
{
    /**
     * List audit trail entries
     */
    public function index(Request $request): JsonResponse
    {
        $query = ExecutionLog::where('log_type', 'audit')
            ->with('user:id,name,email')
            ->orderBy('created_at', 'desc');

        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('action')) {
            $query->where('action', 'ilike', "%{$request->action}%");
        }

        if ($request->has('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }

        if ($request->has('date_to')) {
            $query->where('created_at', '<=', $request->date_to);
        }

        $audits = $query->paginate($request->input('per_page', 50));

        return response()->json(['audits' => $audits]);
    }

    /**
     * Export audit trail as CSV
     */
    public function export(Request $request): StreamedResponse
    {
        $query = ExecutionLog::where('log_type', 'audit')
            ->with('user:id,name,email')
            ->orderBy('created_at', 'desc');

        if ($request->has('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }

        if ($request->has('date_to')) {
            $query->where('created_at', '<=', $request->date_to);
        }

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Date', 'User', 'Action', 'Source', 'Details', 'IP Address']);

            $query->chunk(100, function ($logs) use ($handle) {
                foreach ($logs as $log) {
                    fputcsv($handle, [
                        $log->created_at->toIso8601String(),
                        $log->user?->name ?? 'System',
                        $log->action,
                        $log->source,
                        json_encode($log->details),
                        $log->ip_address,
                    ]);
                }
            });

            fclose($handle);
        }, 'audit-export-' . now()->format('Y-m-d') . '.csv', [
            'Content-Type' => 'text/csv',
        ]);
    }
}
