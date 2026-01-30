<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KnowledgeBaseEntry;
use Illuminate\Http\Request;

class KnowledgeBaseController extends Controller
{
    public function index(Request $request)
    {
        $query = KnowledgeBaseEntry::query()->orderBy('updated_at', 'desc');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'ilike', "%{$search}%")
                  ->orWhere('content', 'ilike', "%{$search}%");
            });
        }

        if ($category = $request->input('category')) {
            $query->where('category', $category);
        }

        $entries = $query->paginate(20);

        return response()->json($entries);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:500',
            'content' => 'required|string|max:50000',
            'category' => 'nullable|string|max:100',
            'is_active' => 'boolean',
        ]);

        $validated['tenant_id'] = app('current_tenant_id');
        $validated['is_active'] = $validated['is_active'] ?? true;

        $entry = KnowledgeBaseEntry::create($validated);

        return response()->json(['entry' => $entry], 201);
    }

    public function update(Request $request, string $id)
    {
        $entry = KnowledgeBaseEntry::findOrFail($id);

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:500',
            'content' => 'sometimes|required|string|max:50000',
            'category' => 'nullable|string|max:100',
            'is_active' => 'boolean',
        ]);

        $entry->update($validated);

        return response()->json(['entry' => $entry]);
    }

    public function destroy(string $id)
    {
        $entry = KnowledgeBaseEntry::findOrFail($id);
        $entry->delete();

        return response()->json(['message' => 'Artigo removido']);
    }

    public function categories()
    {
        $categories = KnowledgeBaseEntry::query()
            ->whereNotNull('category')
            ->where('category', '!=', '')
            ->distinct()
            ->pluck('category')
            ->sort()
            ->values();

        return response()->json(['categories' => $categories]);
    }
}
