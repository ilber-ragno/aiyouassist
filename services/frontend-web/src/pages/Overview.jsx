import { useQuery } from '@tanstack/react-query';
import { CreditCard, Smartphone, Puzzle, Webhook, Activity, Users, Clock, Bot } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import StatusBadge from '../components/StatusBadge';
import SetupBanner from '../components/SetupBanner';
import api from '../lib/api';

const SEVERITY_ICON_COLORS = {
  info: 'bg-blue-100 text-blue-600',
  warning: 'bg-amber-100 text-amber-600',
  error: 'bg-red-100 text-red-600',
  critical: 'bg-red-200 text-red-700',
};

const LOG_TYPE_ICONS = {
  audit: '🔍',
  credit: '💰',
  ai: '🤖',
  message: '💬',
  webhook: '🔗',
  system: '⚙️',
};

export default function Overview() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: () => api.get('/overview').then(r => r.data),
    refetchInterval: 30000,
  });

  const cards = [
    {
      name: 'Assinatura',
      value: data?.subscription?.plan_name || 'Trial',
      sub: data?.subscription?.status,
      icon: CreditCard,
      gradient: 'from-purple-500 to-purple-700',
      bg: 'bg-purple-50',
    },
    {
      name: 'WhatsApp',
      value: `${data?.whatsapp?.connected || 0} / ${data?.whatsapp?.total_sessions || 0}`,
      sub: 'conectados',
      icon: Smartphone,
      gradient: 'from-green-500 to-green-700',
      bg: 'bg-green-50',
    },
    {
      name: 'Integrações',
      value: `${data?.integrations?.enabled || 0} / ${data?.integrations?.total || 0}`,
      sub: 'ativas',
      icon: Puzzle,
      gradient: 'from-blue-500 to-blue-700',
      bg: 'bg-blue-50',
    },
    {
      name: 'Webhooks',
      value: data?.webhooks?.active || 0,
      sub: 'ativos',
      icon: Webhook,
      gradient: 'from-orange-500 to-orange-700',
      bg: 'bg-orange-50',
    },
    {
      name: 'Usuários',
      value: `${data?.usage?.users || 0}`,
      sub: data?.usage?.users_limit > 0 ? `/ ${data?.usage?.users_limit}` : '',
      icon: Users,
      gradient: 'from-indigo-500 to-indigo-700',
      bg: 'bg-indigo-50',
    },
    {
      name: 'Conector',
      value: data?.connector?.status === 'healthy' ? 'Online' : (data?.connector?.gateway_connected ? 'Online' : 'Offline'),
      sub: data?.connector?.status || '',
      icon: Activity,
      gradient: (data?.connector?.status === 'healthy' || data?.connector?.gateway_connected)
        ? 'from-emerald-500 to-emerald-700'
        : 'from-red-500 to-red-700',
      bg: (data?.connector?.status === 'healthy' || data?.connector?.gateway_connected) ? 'bg-emerald-50' : 'bg-red-50',
    },
  ];

  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            Olá, {firstName}
          </h1>
          <p className="page-subtitle">Veja o status do seu portal AiYou Assist</p>
        </div>
      </div>

      {/* Setup wizard banner */}
      <SetupBanner />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center gap-4">
                <div className="skeleton w-12 h-12 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <div className="skeleton h-3 w-16 rounded" />
                  <div className="skeleton h-6 w-24 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <div key={card.name} className="card-hover p-5">
                <div className="flex items-center gap-4">
                  <div className={`stat-icon bg-gradient-to-br ${card.gradient} shadow-sm`}>
                    <card.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.name}</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">
                      {card.value}
                      {card.sub && (
                        <span className="text-sm text-gray-400 font-normal ml-1.5">{card.sub}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Events */}
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                Eventos Recentes
              </h2>
            </div>
            {data?.recent_events?.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {data.recent_events.map((event) => (
                  <div
                    key={event.id}
                    className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors"
                  >
                    <span className="text-base flex-shrink-0">{LOG_TYPE_ICONS[event.log_type] || '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={event.severity} size="sm" />
                        <span className="text-xs text-gray-500">{event.source}</span>
                      </div>
                      <p className="text-sm text-gray-900 mt-0.5 truncate">{event.action}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                      {new Date(event.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state py-12">
                <Bot className="empty-state-icon" />
                <p className="empty-state-text">Nenhum evento recente</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
