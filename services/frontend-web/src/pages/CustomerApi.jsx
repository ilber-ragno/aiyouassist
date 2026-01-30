import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2, Play, List } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function CustomerApi() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedConn, setSelectedConn] = useState(null);
  const [form, setForm] = useState({ name: '', base_url: '', auth_type: 'api_key', description: '' });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customer-api-connections'],
    queryFn: () => api.get('/customer-api/connections').then(r => r.data),
  });

  const { data: endpoints } = useQuery({
    queryKey: ['customer-api-endpoints', selectedConn],
    queryFn: () => api.get(`/customer-api/connections/${selectedConn}/endpoints`).then(r => r.data),
    enabled: !!selectedConn,
  });

  const { data: logs } = useQuery({
    queryKey: ['customer-api-logs', selectedConn],
    queryFn: () => api.get(`/customer-api/connections/${selectedConn}/logs`).then(r => r.data),
    enabled: !!selectedConn,
  });

  const create = useMutation({
    mutationFn: (data) => api.post('/customer-api/connections', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-api-connections'] });
      setShowCreate(false);
      setForm({ name: '', base_url: '', auth_type: 'api_key', description: '' });
      toast.success('Conexão criada');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro'),
  });

  const testConn = useMutation({
    mutationFn: (id) => api.post(`/customer-api/connections/${id}/test`),
    onSuccess: () => toast.success('Teste concluído'),
    onError: () => toast.error('Teste falhou'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/customer-api/connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-api-connections'] });
      toast.success('Conexão removida');
    },
  });

  const connections = data?.connections || [];

  const logColumns = [
    { key: 'method', label: 'Método' },
    { key: 'endpoint', label: 'Endpoint' },
    { key: 'status_code', label: 'Status', render: (v) => <StatusBadge status={v >= 200 && v < 300 ? 'success' : 'error'} label={String(v)} /> },
    { key: 'duration_ms', label: 'Duração', render: (v) => `${v}ms` },
    { key: 'created_at', label: 'Data', render: (v) => new Date(v).toLocaleString('pt-BR') },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Globe className="w-7 h-7" />
            Customer API
          </h1>
          <p className="page-subtitle">Gerencie conexões de API externas</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nova conexão
        </button>
      </div>

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Nova Conexão API">
          <div className="space-y-4">
            <div>
              <label className="input-label">Nome</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="input-label">URL Base</label>
              <input value={form.base_url} onChange={(e) => setForm(f => ({ ...f, base_url: e.target.value }))} className="input-field" placeholder="https://api.exemplo.com" />
            </div>
            <div>
              <label className="input-label">Autenticação</label>
              <select value={form.auth_type} onChange={(e) => setForm(f => ({ ...f, auth_type: e.target.value }))} className="input-field">
                <option value="api_key">API Key</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="none">Nenhuma</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancelar</button>
              <button onClick={() => create.mutate(form)} disabled={!form.name || !form.base_url || create.isPending} className="btn-primary">
                Criar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Connection detail modal */}
      {!!selectedConn && (
        <Modal onClose={() => setSelectedConn(null)} title="Detalhes da Conexão" size="lg">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">Endpoints Permitidos</h3>
              {endpoints?.endpoints?.length > 0 ? (
                <div className="card divide-y">
                  {endpoints.endpoints.map((ep) => (
                    <div key={ep.id} className="flex items-center gap-2 p-3">
                      <span className="font-mono text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">{ep.method}</span>
                      <span className="text-sm text-gray-700">{ep.path}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nenhum endpoint configurado</p>
              )}
            </div>
            <div>
              <h3 className="font-medium mb-2">Logs Recentes</h3>
              <DataTable columns={logColumns} data={logs?.logs || []} emptyMessage="Nenhum log" />
            </div>
          </div>
        </Modal>
      )}

      {/* Connections list */}
      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="skeleton h-5 w-1/3 mb-2" />
                  <div className="skeleton h-4 w-1/2 mb-1" />
                  <div className="skeleton h-3 w-1/4" />
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
      ) : connections.length === 0 ? (
        <div className="empty-state">
          <Globe className="empty-state-icon" />
          <p className="empty-state-title">Nenhuma conexão de API configurada</p>
          <p className="empty-state-description">Adicione conexões para integrar APIs externas ao sistema.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
            <Plus className="w-5 h-5 mr-2" />
            Nova conexão
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {connections.map((conn) => (
            <div key={conn.id} className="card card-hover p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{conn.name}</h3>
                  <p className="text-sm text-gray-500 font-mono">{conn.base_url}</p>
                  <p className="text-xs text-gray-400 mt-1">Autenticação: {conn.auth_type}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setSelectedConn(conn.id)} className="btn-ghost btn-sm" title="Ver detalhes">
                    <List className="w-4 h-4" />
                  </button>
                  <button onClick={() => testConn.mutate(conn.id)} className="btn-ghost btn-sm text-blue-600" title="Testar">
                    <Play className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove.mutate(conn.id)} className="btn-ghost btn-sm text-red-600" title="Remover">
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
