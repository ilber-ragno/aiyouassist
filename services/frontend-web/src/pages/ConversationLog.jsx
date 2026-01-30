import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  MessageSquare, Search, ArrowLeft, User, Bot, Clock,
  Smartphone, Send, ChevronDown, ChevronUp, Filter,
  CheckCircle2, AlertCircle, UserCheck, ArrowRight,
} from 'lucide-react';
import api from '../lib/api';

const STATUS_MAP = {
  active: { label: 'IA Ativa', color: 'bg-green-100 text-green-700' },
  waiting_human: { label: 'Aguardando Humano', color: 'bg-amber-100 text-amber-700' },
  with_human: { label: 'Com Humano', color: 'bg-blue-100 text-blue-700' },
  resolved: { label: 'Resolvida', color: 'bg-gray-100 text-gray-600' },
  archived: { label: 'Arquivada', color: 'bg-gray-100 text-gray-500' },
};

const CHANNEL_MAP = {
  whatsapp: { label: 'WhatsApp', icon: Smartphone, color: 'text-green-600' },
  telegram: { label: 'Telegram', icon: Send, color: 'text-blue-600' },
};

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatRelative(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

export default function ConversationLog() {
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({ status: '', channel: '', search: '' });
  const [showFilters, setShowFilters] = useState(false);

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['conversations', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('filter[status]', filters.status);
      if (filters.channel) params.set('filter[channel]', filters.channel);
      params.set('per_page', '30');
      return api.get(`/conversations?${params}`).then(r => r.data);
    },
    refetchInterval: 15000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['conversation-stats'],
    queryFn: () => api.get('/conversations/queue-stats').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['conversation-detail', selectedId],
    queryFn: () => api.get(`/conversations/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
    refetchInterval: selectedId ? 10000 : false,
  });

  const conversations = listData?.conversations || [];
  const stats = statsData?.stats || {};
  const detail = detailData?.conversation;
  const messages = detailData?.messages || [];

  // Filter by search locally
  const filtered = conversations.filter(c => {
    if (!filters.search) return true;
    const q = filters.search.toLowerCase();
    return (c.contact_name || '').toLowerCase().includes(q)
      || (c.contact_phone || '').toLowerCase().includes(q);
  });

  if (selectedId && detail) {
    return <ConversationDetail
      conversation={detail}
      messages={messages}
      events={detailData?.events || []}
      loading={detailLoading}
      onBack={() => setSelectedId(null)}
    />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-indigo-500 to-indigo-700">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Conversas</h1>
            <p className="page-subtitle">Acompanhe todas as conversas dos seus canais em tempo real</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.active_ai || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Com IA</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.waiting_human || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Aguardando Humano</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.with_human || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Com Humano</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-600">{stats.resolved_today || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Resolvidas Hoje</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              className="input-field pl-9 w-full"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-ghost btn-sm flex items-center gap-1 ${showFilters ? 'text-indigo-600' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
        </div>
        {showFilters && (
          <div className="flex gap-3 mt-3 flex-wrap">
            <select
              value={filters.status}
              onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
              className="input-field w-auto"
            >
              <option value="">Todos os status</option>
              <option value="active">IA Ativa</option>
              <option value="waiting_human">Aguardando Humano</option>
              <option value="with_human">Com Humano</option>
              <option value="resolved">Resolvida</option>
            </select>
            <select
              value={filters.channel}
              onChange={(e) => setFilters(f => ({ ...f, channel: e.target.value }))}
              className="input-field w-auto"
            >
              <option value="">Todos os canais</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
        )}
      </div>

      {/* Conversation List */}
      {listLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="card p-4 flex gap-4">
              <div className="skeleton w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton h-3 w-64" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <MessageSquare className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="empty-state-title">Nenhuma conversa encontrada</h3>
          <p className="empty-state-text">
            {filters.search || filters.status || filters.channel
              ? 'Tente ajustar os filtros.'
              : 'As conversas aparecerao aqui quando clientes enviarem mensagens.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((conv) => {
            const channel = CHANNEL_MAP[conv.channel || 'whatsapp'] || CHANNEL_MAP.whatsapp;
            const status = STATUS_MAP[conv.status] || STATUS_MAP.active;
            const ChannelIcon = channel.icon;
            const lastMsg = conv.latest_messages?.[0];

            return (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className="card card-hover p-4 w-full text-left flex items-center gap-4 transition-all"
              >
                {/* Avatar */}
                <div className="w-11 h-11 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center flex-shrink-0 relative">
                  <span className="text-sm font-bold text-gray-600">
                    {(conv.contact_name || conv.contact_phone || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white flex items-center justify-center`}>
                    <ChannelIcon className={`w-3 h-3 ${channel.color}`} />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {conv.contact_name || conv.contact_phone}
                    </span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {lastMsg?.content || 'Sem mensagens'}
                  </p>
                </div>

                {/* Time */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">{formatRelative(conv.last_message_at)}</p>
                  {conv.assigned_user && (
                    <p className="text-[10px] text-blue-500 mt-0.5 flex items-center gap-1 justify-end">
                      <UserCheck className="w-3 h-3" />
                      {conv.assigned_user.name}
                    </p>
                  )}
                </div>

                <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConversationDetail({ conversation, messages, events, loading, onBack }) {
  const channel = CHANNEL_MAP[conversation.channel || 'whatsapp'] || CHANNEL_MAP.whatsapp;
  const status = STATUS_MAP[conversation.status] || STATUS_MAP.active;
  const ChannelIcon = channel.icon;
  const [showEvents, setShowEvents] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-gray-600">
              {(conversation.contact_name || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {conversation.contact_name || conversation.contact_phone}
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ChannelIcon className={`w-3.5 h-3.5 ${channel.color}`} />
              <span>{channel.label}</span>
              <span>·</span>
              <span>{conversation.contact_phone}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.color}`}>
                {status.label}
              </span>
            </div>
          </div>
        </div>
        {conversation.assigned_user && (
          <div className="text-xs text-blue-600 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg">
            <UserCheck className="w-3.5 h-3.5" />
            {conversation.assigned_user.name}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="card p-3 flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          Criada: {formatDate(conversation.created_at)}
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" />
          {messages.length} mensagens
        </span>
        {conversation.whatsapp_session && (
          <span className="flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5 text-green-500" />
            {conversation.whatsapp_session.phone_number || conversation.whatsapp_session.session_name}
          </span>
        )}
        {conversation.telegram_bot && (
          <span className="flex items-center gap-1">
            <Send className="w-3.5 h-3.5 text-blue-500" />
            @{conversation.telegram_bot.bot_username}
          </span>
        )}
      </div>

      {/* Events toggle */}
      {events.length > 0 && (
        <button
          onClick={() => setShowEvents(!showEvents)}
          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          {showEvents ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {events.length} evento(s) de handoff
        </button>
      )}
      {showEvents && events.length > 0 && (
        <div className="card p-3 space-y-2">
          {events.map((ev, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
              <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <span className="font-medium">{ev.event_type}</span>
              {ev.reason && <span>— {ev.reason}</span>}
              <span className="ml-auto text-gray-400">{formatDate(ev.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="card overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 p-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Historico de Mensagens</span>
        </div>
        <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 w-3/4" />)}
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma mensagem ainda.</p>
          ) : (
            messages.map((msg) => {
              const isInbound = msg.direction === 'inbound';
              const isAi = msg.sender_type === 'ai';
              const isHuman = msg.sender_type === 'human';

              return (
                <div
                  key={msg.id}
                  className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isInbound
                      ? 'bg-white border border-gray-200 rounded-bl-sm'
                      : isAi
                        ? 'bg-green-50 border border-green-200 rounded-br-sm'
                        : 'bg-blue-50 border border-blue-200 rounded-br-sm'
                  }`}>
                    {!isInbound && (
                      <div className="flex items-center gap-1 mb-1">
                        {isAi ? (
                          <span className="text-[10px] font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Bot className="w-2.5 h-2.5" /> IA
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <User className="w-2.5 h-2.5" /> Humano
                          </span>
                        )}
                      </div>
                    )}
                    {isInbound && (
                      <div className="mb-1">
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-fit">
                          <User className="w-2.5 h-2.5" /> Cliente
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{msg.content}</p>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      {msg.status && (
                        <span className={`text-[9px] ${
                          msg.status === 'sent' ? 'text-green-500' :
                          msg.status === 'delivered' ? 'text-blue-500' :
                          msg.status === 'failed' ? 'text-red-500' :
                          'text-gray-400'
                        }`}>
                          {msg.status === 'sent' ? 'Enviada' :
                           msg.status === 'delivered' ? 'Entregue' :
                           msg.status === 'read' ? 'Lida' :
                           msg.status === 'failed' ? 'Falhou' :
                           msg.status === 'pending' ? 'Pendente' : msg.status}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
