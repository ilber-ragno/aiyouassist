import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Trash2, Star, Zap, Shield, Eye, EyeOff, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';

const PROVIDER_LABELS = {
  anthropic: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  groq: 'Groq',
  mistral: 'Mistral',
  cohere: 'Cohere',
  google: 'Gemini (Google)',
  openrouter: 'OpenRouter',
};

export default function AdminLlmProviders() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', provider_type: 'openrouter', model: '', api_key: '', budget_limit_usd: '', is_default: false });
  const [showKeys, setShowKeys] = useState({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-llm-providers'],
    queryFn: () => api.get('/admin/llm-providers').then(r => r.data),
  });

  const { data: tenantData } = useQuery({
    queryKey: ['admin-llm-tenant-overrides'],
    queryFn: () => api.get('/admin/llm-providers/tenant-overrides').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/admin/llm-providers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-llm-providers'] });
      toast.success('Provedor global criado');
      resetForm();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao criar provedor'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/admin/llm-providers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-llm-providers'] });
      toast.success('Provedor atualizado');
      resetForm();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao atualizar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/llm-providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-llm-providers'] });
      toast.success('Provedor excluído');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao excluir'),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/llm-providers/${id}/set-default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-llm-providers'] });
      toast.success('Provedor padrão atualizado');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro'),
  });

  const testMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/llm-providers/${id}/test`),
    onSuccess: (res) => toast.success(res.data.message || 'Conexão OK'),
    onError: (err) => toast.error(err.response?.data?.message || 'Falha no teste'),
  });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setForm({ name: '', provider_type: 'openrouter', model: '', api_key: '', budget_limit_usd: '', is_default: false });
  }

  function startEdit(provider) {
    setEditId(provider.id);
    setForm({
      name: provider.name,
      provider_type: provider.provider_type,
      model: provider.model,
      api_key: '',
      budget_limit_usd: provider.budget_limit_usd || '',
      is_default: provider.is_default,
    });
    setShowForm(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = { ...form };
    if (payload.budget_limit_usd === '') delete payload.budget_limit_usd;
    else payload.budget_limit_usd = parseFloat(payload.budget_limit_usd);
    if (!payload.api_key) delete payload.api_key;

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const providers = data?.providers || [];
  const availableProviders = data?.available_providers || [];
  const selectedProviderConfig = availableProviders.find(p => p.id === form.provider_type);
  const tenants = tenantData?.tenants || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-indigo-500 to-purple-600">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Provedores IA (Global)</h1>
            <p className="page-subtitle">Provedores de IA configurados centralmente para todos os tenants</p>
          </div>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Novo Provedor
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="card bg-red-50 border border-red-200">
          <div className="p-4">
            <p className="text-sm font-medium text-red-800">Erro ao carregar provedores de IA</p>
            <p className="text-sm text-red-600 mt-1">{error.response?.data?.error || error.response?.data?.message || error.message}</p>
            <button onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-llm-providers'] })} className="btn-secondary btn-sm mt-2">
              <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="card bg-blue-50 border border-blue-200">
        <div className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Provedores Globais</p>
            <p className="text-sm text-blue-600 mt-1">
              Provedores globais são usados por tenants que não possuem provedores próprios configurados.
              Tenants com provedores próprios usam seus próprios provedores com prioridade.
            </p>
          </div>
        </div>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">{editId ? 'Editar Provedor' : 'Novo Provedor Global'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="input-label">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder="Ex: OpenRouter Principal"
                  required
                />
              </div>
              <div>
                <label className="input-label">Provedor</label>
                <select
                  value={form.provider_type}
                  onChange={e => setForm({ ...form, provider_type: e.target.value, model: '' })}
                  className="input-field"
                  disabled={!!editId}
                >
                  {availableProviders.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Modelo</label>
                {selectedProviderConfig?.dynamic_models ? (
                  <input
                    type="text"
                    value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value })}
                    className="input-field"
                    placeholder="Ex: anthropic/claude-sonnet-4-20250514"
                    required
                  />
                ) : (
                  <select
                    value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="">Selecione...</option>
                    {(selectedProviderConfig?.models || []).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="input-label">
                  Chave API {editId && <span className="text-gray-400">(deixe vazio para manter)</span>}
                </label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={e => setForm({ ...form, api_key: e.target.value })}
                  className="input-field"
                  placeholder="sk-..."
                  required={!editId}
                />
              </div>
              <div>
                <label className="input-label">Limite Mensal (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.budget_limit_usd}
                  onChange={e => setForm({ ...form, budget_limit_usd: e.target.value })}
                  className="input-field"
                  placeholder="Sem limite"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={form.is_default}
                  onChange={e => setForm({ ...form, is_default: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="is_default" className="text-sm text-gray-700">Provedor padrão</label>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="btn-primary"
              >
                {editId ? 'Salvar' : 'Criar'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Providers List */}
      <div className="card">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Provedores Globais Configurados</h2>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton h-3 w-3 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-5 w-48" />
                  <div className="skeleton h-4 w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : providers.length === 0 ? (
          <div className="empty-state py-8">
            <div className="empty-state-icon">
              <Bot className="w-8 h-8 text-gray-400" />
            </div>
            <p className="empty-state-text">Nenhum provedor global configurado.</p>
          </div>
        ) : (
          <div className="divide-y">
            {providers.map(provider => (
              <div key={provider.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${provider.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{provider.name}</span>
                        {provider.is_default && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            <Star className="w-3 h-3 mr-1" /> Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {PROVIDER_LABELS[provider.provider_type] || provider.provider_type} — {provider.model}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        API Key: {provider.api_key_masked || '****'}
                        {provider.budget_limit_usd && (
                          <> | Gasto: ${provider.spent_usd?.toFixed(2)} / ${provider.budget_limit_usd}</>
                        )}
                        {provider.total_requests_this_month > 0 && (
                          <> | {provider.total_requests_this_month} reqs este mês</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testMutation.mutate(provider.id)}
                      disabled={testMutation.isPending}
                      className="btn-ghost btn-sm"
                      title="Testar conexão"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                    {!provider.is_default && (
                      <button
                        onClick={() => setDefaultMutation.mutate(provider.id)}
                        className="btn-ghost btn-sm text-yellow-600 hover:bg-yellow-50"
                        title="Definir como padrão"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(provider)}
                      className="btn-secondary btn-sm"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => { if (confirm('Excluir este provedor?')) deleteMutation.mutate(provider.id); }}
                      className="btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tenant Override Status */}
      <div className="card">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Status por Tenant</h2>
          <p className="text-sm text-gray-500 mt-1">Tenants que usam provedor global vs próprio</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Tenant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Provedores Próprios</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Usa Global</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4">
                    <div className="flex justify-center gap-2">
                      <div className="skeleton h-4 w-32" />
                    </div>
                  </td>
                </tr>
              ) : tenants.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <span className="font-medium text-gray-900">{t.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{t.slug}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === 'active' ? 'bg-green-100 text-green-700' :
                      t.status === 'trial' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center text-sm">{t.own_provider_count}</td>
                  <td className="px-6 py-3 text-center">
                    {t.uses_global ? (
                      <span className="text-green-600 font-medium text-sm">Sim</span>
                    ) : (
                      <span className="text-gray-400 text-sm">Não</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
