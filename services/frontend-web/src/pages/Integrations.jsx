import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Puzzle, Plus, ToggleLeft, ToggleRight, Play, Trash2, Settings } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';

const INTEGRATION_TYPES = [
  { type: 'crm', name: 'CRM', description: 'Integração com sistemas de CRM' },
  { type: 'erp', name: 'ERP', description: 'Integração com sistemas ERP' },
  { type: 'helpdesk', name: 'Helpdesk', description: 'Integração com helpdesk/suporte' },
  { type: 'ecommerce', name: 'E-commerce', description: 'Integração com plataformas de e-commerce' },
  { type: 'custom', name: 'Custom', description: 'Integração personalizada via API' },
];

export default function Integrations() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ integration_type: '', name: '', description: '' });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get('/integrations').then(r => r.data),
  });

  const create = useMutation({
    mutationFn: (data) => api.post('/integrations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setShowCreate(false);
      setForm({ integration_type: '', name: '', description: '' });
      toast.success('Integração criada');
    },
    onError: () => toast.error('Erro ao criar integração'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enable }) => api.post(`/integrations/${id}/${enable ? 'enable' : 'disable'}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast.success('Status atualizado');
    },
  });

  const test = useMutation({
    mutationFn: (id) => api.post(`/integrations/${id}/test`),
    onSuccess: () => toast.success('Teste concluído'),
    onError: () => toast.error('Teste falhou'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast.success('Integração removida');
    },
  });

  const integrations = data?.integrations || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Puzzle className="w-7 h-7" />
            Integrações
          </h1>
          <p className="page-subtitle">Configure integrações com sistemas externos</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nova integração
        </button>
      </div>

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Nova Integração">
          <div className="space-y-4">
            <div>
              <label className="input-label">Tipo</label>
              <select
                value={form.integration_type}
                onChange={(e) => setForm(f => ({ ...f, integration_type: e.target.value }))}
                className="input-field"
              >
                <option value="">Selecione...</option>
                {INTEGRATION_TYPES.map(t => (
                  <option key={t.type} value={t.type}>{t.name} - {t.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="input-field"
                placeholder="Ex: Salesforce CRM"
              />
            </div>
            <div>
              <label className="input-label">Descrição</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="input-field"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={() => create.mutate(form)}
                disabled={!form.integration_type || !form.name || create.isPending}
                className="btn-primary"
              >
                Criar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="skeleton h-5 w-2/3 mb-2" />
                  <div className="skeleton h-4 w-1/3 mb-1" />
                  <div className="skeleton h-4 w-3/4" />
                </div>
                <div className="skeleton h-6 w-16 rounded-full" />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <div className="skeleton h-8 w-20 rounded" />
                <div className="skeleton h-8 w-20 rounded" />
                <div className="skeleton h-8 w-10 rounded ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : integrations.length === 0 ? (
        <div className="empty-state">
          <Puzzle className="empty-state-icon" />
          <p className="empty-state-title">Nenhuma integração configurada</p>
          <p className="empty-state-description">Conecte sistemas externos para automatizar fluxos de trabalho.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
            <Plus className="w-5 h-5 mr-2" />
            Nova integração
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((integration) => (
            <div key={integration.id} className="card card-hover p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{integration.integration_type}</p>
                  {integration.description && (
                    <p className="text-sm text-gray-400 mt-1">{integration.description}</p>
                  )}
                </div>
                <StatusBadge status={integration.is_enabled ? 'enabled' : 'disabled'} />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => toggle.mutate({ id: integration.id, enable: !integration.is_enabled })}
                  className={`btn-ghost btn-sm ${
                    integration.is_enabled ? 'text-green-600' : 'text-gray-600'
                  }`}
                >
                  {integration.is_enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {integration.is_enabled ? 'Ativa' : 'Inativa'}
                </button>
                <button
                  onClick={() => test.mutate(integration.id)}
                  className="btn-ghost btn-sm text-blue-600"
                >
                  <Play className="w-4 h-4" />
                  Testar
                </button>
                <button
                  onClick={() => remove.mutate(integration.id)}
                  className="btn-danger btn-sm ml-auto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
