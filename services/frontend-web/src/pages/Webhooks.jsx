import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Webhook, Plus, Trash2, Play, RefreshCw, Eye, Copy } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';

const WEBHOOK_EVENTS = [
  'session.connected',
  'session.disconnected',
  'message.received',
  'message.sent',
  'message.delivered',
  'subscription.updated',
  'integration.status_changed',
];

export default function Webhooks() {
  const [showCreate, setShowCreate] = useState(false);
  const [showSecret, setShowSecret] = useState(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [form, setForm] = useState({ url: '', description: '', events: [] });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['webhook-endpoints'],
    queryFn: () => api.get('/webhook-endpoints').then(r => r.data),
  });

  const { data: endpointDetail } = useQuery({
    queryKey: ['webhook-endpoint', selectedEndpoint],
    queryFn: () => api.get(`/webhook-endpoints/${selectedEndpoint}`).then(r => r.data),
    enabled: !!selectedEndpoint,
  });

  const create = useMutation({
    mutationFn: (data) => api.post('/webhook-endpoints', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      setShowCreate(false);
      setForm({ url: '', description: '', events: [] });
      if (res.data.secret) {
        setShowSecret(res.data.secret);
      }
      toast.success('Webhook criado');
    },
    onError: () => toast.error('Erro ao criar webhook'),
  });

  const testEndpoint = useMutation({
    mutationFn: (id) => api.post(`/webhook-endpoints/${id}/test`),
    onSuccess: () => toast.success('Teste enviado'),
    onError: () => toast.error('Erro no teste'),
  });

  const replayDelivery = useMutation({
    mutationFn: ({ endpointId, deliveryId }) => api.post(`/webhook-endpoints/${endpointId}/replay/${deliveryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoint', selectedEndpoint] });
      toast.success('Delivery re-enviada');
    },
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/webhook-endpoints/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      toast.success('Webhook removido');
    },
  });

  const toggleEvent = (event) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter(e => e !== event)
        : [...f.events, event],
    }));
  };

  const { data: systemUrlsData } = useQuery({
    queryKey: ['webhook-system-urls'],
    queryFn: () => api.get('/webhook-endpoints/system-urls').then(r => r.data),
  });

  const endpoints = data?.endpoints || [];
  const systemUrls = systemUrlsData?.urls || [];

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copiada!');
  };

  const deliveryColumns = [
    { key: 'event_type', label: 'Evento' },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'response_status', label: 'HTTP', render: (v) => v || '-' },
    { key: 'duration_ms', label: 'Duração', render: (v) => v ? `${v}ms` : '-' },
    { key: 'created_at', label: 'Data', render: (v) => new Date(v).toLocaleString('pt-BR') },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <button
          onClick={() => replayDelivery.mutate({ endpointId: selectedEndpoint, deliveryId: row.id })}
          className="btn-ghost btn-sm"
        >
          Replay
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Webhook className="w-7 h-7" />
            Webhooks
          </h1>
          <p className="page-subtitle">Configure endpoints de webhook para receber eventos</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-5 h-5 mr-2" />
          Novo webhook
        </button>
      </div>

      {/* System Webhook URLs */}
      {systemUrls.length > 0 && (
        <div className="card">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Webhook className="w-5 h-5" />
              URLs de Webhook do Sistema
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              URLs que devem ser configuradas nos serviços externos para receber notificações
            </p>
          </div>
          <div className="divide-y">
            {systemUrls.map((item, idx) => (
              <div key={idx} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">{item.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-sm bg-gray-100 px-3 py-1.5 rounded-md font-mono text-gray-700 truncate block max-w-xl border border-gray-200">
                        {item.url}
                      </code>
                      <button
                        onClick={() => copyUrl(item.url)}
                        className="btn-ghost btn-sm"
                        title="Copiar URL"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    {item.events?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.events.map(ev => (
                          <span key={ev} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{ev}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Novo Webhook Endpoint" size="lg">
          <div className="space-y-4">
            <div>
              <label className="input-label">URL</label>
              <input value={form.url} onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))} className="input-field" placeholder="https://seu-servidor.com/webhook" />
            </div>
            <div>
              <label className="input-label">Descrição</label>
              <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="input-label mb-2">Eventos</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <label key={event} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-gray-50">
                    <input type="checkbox" checked={form.events.includes(event)} onChange={() => toggleEvent(event)} className="rounded" />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancelar</button>
              <button onClick={() => create.mutate(form)} disabled={!form.url || form.events.length === 0 || create.isPending} className="btn-primary">
                Criar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Secret reveal */}
      {!!showSecret && (
        <Modal onClose={() => setShowSecret(null)} title="Webhook Secret">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Salve este secret. Ele não será exibido novamente.</p>
            <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-md font-mono text-sm border border-gray-200">
              <code className="flex-1 break-all">{showSecret}</code>
              <button onClick={() => { navigator.clipboard.writeText(showSecret); toast.success('Copiado'); }} className="btn-ghost btn-sm">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delivery detail */}
      {!!selectedEndpoint && (
        <Modal onClose={() => setSelectedEndpoint(null)} title="Deliveries" size="xl">
          <DataTable columns={deliveryColumns} data={endpointDetail?.recent_deliveries || []} emptyMessage="Nenhuma delivery" />
        </Modal>
      )}

      {/* Endpoints list */}
      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="skeleton h-5 w-3/4 mb-2" />
                  <div className="skeleton h-4 w-1/2 mb-3" />
                  <div className="flex gap-1">
                    <div className="skeleton h-5 w-24 rounded" />
                    <div className="skeleton h-5 w-20 rounded" />
                    <div className="skeleton h-5 w-28 rounded" />
                  </div>
                </div>
                <div className="flex gap-1">
                  <div className="skeleton h-9 w-9 rounded" />
                  <div className="skeleton h-9 w-9 rounded" />
                  <div className="skeleton h-9 w-9 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : endpoints.length === 0 ? (
        <div className="empty-state">
          <Webhook className="empty-state-icon" />
          <p className="empty-state-title">Nenhum webhook configurado</p>
          <p className="empty-state-description">Crie um endpoint de webhook para receber eventos em tempo real.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
            <Plus className="w-5 h-5 mr-2" />
            Novo webhook
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {endpoints.map((ep) => (
            <div key={ep.id} className="card card-hover p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 font-mono text-sm truncate">{ep.url}</h3>
                    <StatusBadge status={ep.is_active ? 'active' : 'inactive'} />
                  </div>
                  {ep.description && <p className="text-sm text-gray-500 mt-1">{ep.description}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(ep.events || []).map((ev) => (
                      <span key={ev} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{ev}</span>
                    ))}
                  </div>
                  {ep.failure_count > 0 && (
                    <p className="text-xs text-red-500 mt-1">Falhas: {ep.failure_count}</p>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  <button onClick={() => setSelectedEndpoint(ep.id)} className="btn-ghost btn-sm" title="Ver deliveries">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => testEndpoint.mutate(ep.id)} className="btn-ghost btn-sm text-blue-600" title="Testar">
                    <Play className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove.mutate(ep.id)} className="btn-ghost btn-sm text-red-600" title="Remover">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
