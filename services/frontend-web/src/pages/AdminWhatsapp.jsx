import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Smartphone,
  Wifi,
  WifiOff,
  QrCode,
  AlertTriangle,
  Settings,
  RefreshCw,
  Power,
  PowerOff,
  Server,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function AdminWhatsapp() {
  const queryClient = useQueryClient();
  const [configModal, setConfigModal] = useState(false);
  const [gatewayInfoModal, setGatewayInfoModal] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');

  // Overview
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin-wa-overview'],
    queryFn: () => api.get('/admin/whatsapp/overview').then(r => r.data),
  });

  // Sessions list
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['admin-wa-sessions', filter],
    queryFn: () => api.get('/admin/whatsapp/sessions', {
      params: { status: filter || undefined },
    }).then(r => r.data),
  });

  // Gateway info
  const { data: gatewayInfo } = useQuery({
    queryKey: ['admin-wa-gateway'],
    queryFn: () => api.get('/admin/whatsapp/gateway/info').then(r => r.data),
    refetchInterval: 15000,
  });

  // Gateway config
  const { data: gatewayConfig } = useQuery({
    queryKey: ['admin-wa-gateway-config'],
    queryFn: () => api.get('/admin/whatsapp/gateway/config').then(r => r.data),
    enabled: configModal,
  });

  // Channel login (QR code) -- requires session_id
  const channelLogin = useMutation({
    mutationFn: (sessionId) => api.post('/admin/whatsapp/gateway/channels/login', { session_id: sessionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-wa-gateway'] });
      queryClient.invalidateQueries({ queryKey: ['admin-wa-sessions'] });
      toast.success('Login da sessão WhatsApp iniciado - verifique o QR Code');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao iniciar login'),
  });

  // Channel logout -- requires session_id
  const channelLogout = useMutation({
    mutationFn: (sessionId) => api.post('/admin/whatsapp/gateway/channels/logout', { session_id: sessionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-wa-gateway'] });
      queryClient.invalidateQueries({ queryKey: ['admin-wa-sessions'] });
      toast.success('Sessão WhatsApp desconectada');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao desconectar'),
  });

  const filters = [
    { value: '', label: 'Todos' },
    { value: 'connected', label: 'Conectados' },
    { value: 'disconnected', label: 'Desconectados' },
    { value: 'waiting_qr', label: 'Aguardando QR' },
    { value: 'error', label: 'Com Erro' },
  ];

  const sessionColumns = [
    {
      key: 'session_name',
      label: 'Sessão',
      render: (v, row) => (
        <div>
          <p className="font-medium">{v}</p>
          <p className="text-xs text-gray-400">{row.phone_number || 'Sem número'}</p>
        </div>
      ),
    },
    {
      key: 'tenant',
      label: 'Tenant',
      render: (v) => v?.name || '-',
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <StatusBadge status={v} label={{
        connected: 'Conectado',
        disconnected: 'Desconectado',
        waiting_qr: 'Aguardando QR',
        reconnecting: 'Reconectando',
        error: 'Erro',
        banned: 'Banido',
      }[v] || v} />,
    },
    {
      key: 'last_connected_at',
      label: 'Última Conexão',
      render: (v) => v ? new Date(v).toLocaleString('pt-BR') : 'Nunca',
    },
    {
      key: 'last_error',
      label: 'Erro',
      render: (v) => v ? <span className="text-xs text-red-500 truncate block max-w-48">{v}</span> : '-',
    },
  ];

  const gwConnected = gatewayInfo?.ready;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-green-500 to-emerald-600">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Admin WhatsApp</h1>
            <p className="page-subtitle">Gestão de sessões e gateway (WhatsApp)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setGatewayInfoModal(true)}
            className="btn-secondary"
          >
            <Server className="w-4 h-4" />
            Gateway Info
          </button>
          <button
            onClick={() => setConfigModal(true)}
            className="btn-secondary"
          >
            <Settings className="w-4 h-4" />
            Config
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <OverviewCard icon={Smartphone} label="Total Sessões" value={overview?.total_sessions ?? '-'} gradient="from-gray-500 to-gray-600" loading={overviewLoading} />
        <OverviewCard icon={Wifi} label="Conectados" value={overview?.connected ?? '-'} gradient="from-green-500 to-emerald-600" loading={overviewLoading} />
        <OverviewCard icon={QrCode} label="Aguardando QR" value={overview?.waiting_qr ?? '-'} gradient="from-yellow-500 to-amber-600" loading={overviewLoading} />
        <OverviewCard icon={WifiOff} label="Desconectados" value={overview?.disconnected ?? '-'} gradient="from-gray-400 to-gray-500" loading={overviewLoading} />
        <OverviewCard icon={AlertTriangle} label="Com Erro" value={overview?.error ?? '-'} gradient="from-red-500 to-rose-600" loading={overviewLoading} />
      </div>

      {/* Gateway Status */}
      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${gatewayInfo?.ready ? 'bg-green-500' : 'bg-red-500'}`} />
              {gatewayInfo?.ready && (
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-75" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">WhatsApp Gateway (Baileys)</h3>
              <p className="text-sm text-gray-500">
                {gatewayInfo?.ready ? `Online — ${gatewayInfo?.status?.active_sessions || 0} sessões ativas` : 'Desconectado ou indisponível'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="input-field w-auto"
            >
              <option value="">Selecione uma sessão...</option>
              {(sessionsData?.data || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_name} ({s.status}) {s.phone_number ? `- ${s.phone_number}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => selectedSessionId && channelLogin.mutate(selectedSessionId)}
              disabled={channelLogin.isPending || !selectedSessionId}
              className="btn-sm flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              <Power className="w-4 h-4" />
              {channelLogin.isPending ? 'Iniciando...' : 'Login'}
            </button>
            <button
              onClick={() => selectedSessionId && channelLogout.mutate(selectedSessionId)}
              disabled={channelLogout.isPending || !selectedSessionId}
              className="btn-secondary btn-sm"
            >
              <PowerOff className="w-4 h-4" />
              Logout
            </button>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-wa-gateway'] })}
              className="btn-ghost btn-sm"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === f.value
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-white hover:shadow-sm'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sessions Table */}
      <DataTable
        columns={sessionColumns}
        data={sessionsData?.data || []}
        pagination={sessionsData}
        isLoading={sessionsLoading}
        emptyMessage="Nenhuma sessão encontrada"
      />

      {/* Gateway Info Modal */}
      {gatewayInfoModal && (
        <Modal onClose={() => setGatewayInfoModal(false)} title="Gateway Info">
          <div className="space-y-4 text-sm max-h-96 overflow-y-auto">
            {gatewayInfo ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-3 h-3 rounded-full ${gatewayInfo.ready ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-medium">{gatewayInfo.ready ? 'Gateway Online' : 'Gateway Offline'}</span>
                </div>

                {gatewayInfo.status && (
                  <div>
                    <h4 className="font-semibold mb-1">Status</h4>
                    <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(gatewayInfo.status, null, 2)}
                    </pre>
                  </div>
                )}

                {gatewayInfo.channels && (
                  <div>
                    <h4 className="font-semibold mb-1">Canais</h4>
                    <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(gatewayInfo.channels, null, 2)}
                    </pre>
                  </div>
                )}

                {gatewayInfo.metrics && (
                  <div>
                    <h4 className="font-semibold mb-1">Métricas</h4>
                    <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(gatewayInfo.metrics, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-20 w-full" />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Config Modal */}
      {configModal && (
        <Modal onClose={() => setConfigModal(false)} title="Configuração do Gateway">
          <div className="space-y-4 text-sm max-h-96 overflow-y-auto">
            {gatewayConfig ? (
              <pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(gatewayConfig, null, 2)}
              </pre>
            ) : (
              <div className="space-y-3">
                <div className="skeleton h-4 w-48" />
                <div className="skeleton h-32 w-full" />
              </div>
            )}
            <p className="text-xs text-gray-400">
              Para alterar, edite a configuração do gateway e reinicie o container.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OverviewCard({ icon: Icon, label, value, gradient, loading }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className={`stat-icon bg-gradient-to-br ${gradient}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          {loading ? (
            <div className="skeleton h-7 w-12 mt-1" />
          ) : (
            <p className="text-xl font-bold text-gray-900">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}
