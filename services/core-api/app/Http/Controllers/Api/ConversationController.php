<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\QueryBuilder;
use Spatie\QueryBuilder\AllowedFilter;

class ConversationController extends Controller
{
    /**
     * List conversations (inbox)
     */
    public function index(Request $request): JsonResponse
    {
        $conversations = QueryBuilder::for(Conversation::class)
            ->allowedFilters([
                AllowedFilter::exact('status'),
                AllowedFilter::exact('channel'),
                AllowedFilter::exact('whatsapp_session_id'),
                AllowedFilter::exact('telegram_bot_id'),
                AllowedFilter::exact('assigned_user_id'),
                AllowedFilter::scope('unassigned'),
            ])
            ->allowedSorts(['created_at', 'last_message_at', 'priority'])
            ->defaultSort('-last_message_at')
            ->with([
                'whatsappSession:id,session_name,phone_number',
                'telegramBot:id,bot_username,bot_name',
                'assignedUser:id,name',
                'latestMessages' => fn($q) => $q->limit(1),
            ])
            ->paginate($request->input('per_page', 20));

        return response()->json([
            'conversations' => $conversations->items(),
            'pagination' => [
                'current_page' => $conversations->currentPage(),
                'last_page' => $conversations->lastPage(),
                'per_page' => $conversations->perPage(),
                'total' => $conversations->total(),
            ],
        ]);
    }

    /**
     * Get conversation details with messages
     */
    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $conversation->load([
            'whatsappSession:id,session_name,phone_number,status',
            'telegramBot:id,bot_username,bot_name,status',
            'assignedUser:id,name,avatar_url',
            'messages' => fn($q) => $q->orderBy('created_at', 'asc'),
            'handoffEvents' => fn($q) => $q->latest()->limit(10),
        ]);

        return response()->json([
            'conversation' => [
                'id' => $conversation->id,
                'contact_phone' => $conversation->contact_phone,
                'contact_name' => $conversation->contact_name,
                'contact_profile_pic' => $conversation->contact_profile_pic,
                'channel' => $conversation->channel ?? 'whatsapp',
                'status' => $conversation->status,
                'priority' => $conversation->priority,
                'created_at' => $conversation->created_at,
                'last_message_at' => $conversation->last_message_at,
                'whatsapp_session' => $conversation->whatsappSession,
                'telegram_bot' => $conversation->telegramBot,
                'assigned_user' => $conversation->assignedUser,
                'metadata' => $conversation->metadata,
            ],
            'messages' => $conversation->messages->map(fn($m) => [
                'id' => $m->id,
                'direction' => $m->direction,
                'sender_type' => $m->sender_type,
                'content_type' => $m->content_type,
                'content' => $m->content,
                'media_url' => $m->media_url,
                'status' => $m->status,
                'created_at' => $m->created_at,
            ]),
            'events' => $conversation->handoffEvents,
        ]);
    }

    /**
     * Assign conversation to user (take over)
     */
    public function assign(Request $request, Conversation $conversation): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'sometimes|uuid|exists:users,id',
        ]);

        $user = isset($validated['user_id'])
            ? \App\Models\User::find($validated['user_id'])
            : $request->user();

        $conversation->assignTo($user);

        return response()->json([
            'message' => 'Conversation assigned successfully',
            'conversation' => [
                'id' => $conversation->id,
                'status' => $conversation->status,
                'assigned_user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                ],
            ],
        ]);
    }

    /**
     * Return conversation to AI
     */
    public function returnToAi(Request $request, Conversation $conversation): JsonResponse
    {
        $conversation->returnToAi();

        return response()->json([
            'message' => 'Conversation returned to AI',
            'conversation' => [
                'id' => $conversation->id,
                'status' => $conversation->status,
            ],
        ]);
    }

    /**
     * Resolve conversation
     */
    public function resolve(Request $request, Conversation $conversation): JsonResponse
    {
        $conversation->resolve();

        return response()->json([
            'message' => 'Conversation resolved',
            'conversation' => [
                'id' => $conversation->id,
                'status' => $conversation->status,
            ],
        ]);
    }

    /**
     * Send message from human operator
     */
    public function sendMessage(Request $request, Conversation $conversation): JsonResponse
    {
        $validated = $request->validate([
            'content' => 'required|string|max:4096',
            'content_type' => 'sometimes|in:text,image,document',
            'media_url' => 'required_if:content_type,image,document|url',
        ]);

        // Ensure conversation is assigned to this user
        if ($conversation->assigned_user_id !== $request->user()->id) {
            return response()->json([
                'error' => 'not_assigned',
                'message' => 'You must take over this conversation first',
            ], 403);
        }

        // Create message
        $message = $conversation->messages()->create([
            'tenant_id' => $conversation->tenant_id,
            'direction' => Message::DIRECTION_OUTBOUND,
            'sender_type' => Message::SENDER_HUMAN,
            'sender_id' => $request->user()->id,
            'content_type' => $validated['content_type'] ?? Message::TYPE_TEXT,
            'content' => $validated['content'],
            'media_url' => $validated['media_url'] ?? null,
            'status' => Message::STATUS_PENDING,
        ]);

        // Update conversation
        $conversation->update(['last_message_at' => now()]);

        // TODO: Dispatch job to send via WhatsApp (ClaudBot)

        return response()->json([
            'message' => 'Message sent',
            'data' => [
                'id' => $message->id,
                'content' => $message->content,
                'status' => $message->status,
                'created_at' => $message->created_at,
            ],
        ], 201);
    }

    /**
     * Get queue stats
     */
    public function queueStats(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        return response()->json([
            'stats' => [
                'waiting_human' => Conversation::where('status', 'waiting_human')->count(),
                'with_human' => Conversation::where('status', 'with_human')->count(),
                'active_ai' => Conversation::where('status', 'active')->count(),
                'resolved_today' => Conversation::where('status', 'resolved')
                    ->whereDate('updated_at', today())
                    ->count(),
                'my_conversations' => Conversation::where('assigned_user_id', $request->user()->id)
                    ->where('status', 'with_human')
                    ->count(),
            ],
        ]);
    }
}
