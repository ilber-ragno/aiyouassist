import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import Modal from '../components/Modal';
import {
  Bot,
  Plus,
  Trash2,
  Pencil,
  Star,
  TestTube,
  AlertTriangle,
  XCircle,
  CheckCircle,
  X,
  Loader2,
  DollarSign,
  Activity,
  Zap,
  Search,
  RefreshCw,
} from 'lucide-react';

const PROVIDER_LABELS = {
  anthropic: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  groq: 'Groq',
  mistral: 'Mistral',
  cohere: 'Cohere',
  google: 'Gemini (Google)',
  openrouter: 'OpenRouter',
};

export default function LlmProviders() {
  const [providers, setProviders] = useState([]);
  const [availableProviders, setAvailableProviders] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProvider, setEditProvider] = useState(null);
  const [testResult, setTestResult] = useState({});
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [listRes, dashRes] = await Promise.all([
        api.get('/llm-providers'),
        api.get('/llm-providers/dashboard'),
      ]);
      setProviders(listRes.data.providers || []);
      setAvailableProviders(listRes.data.available_providers || []);
      setDashboard(dashRes.data);
    } catch (err) {
      setError('Erro ao carregar provedores de IA');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTest = async (providerId) => {
    setTestResult(prev => ({ ...prev, [providerId]: 'loading' }));
    try {
      const res = await api.post(`/llm-providers/${providerId}/test`);
      setTestResult(prev => ({ ...prev, [providerId]: res.data.success ? 'success' : 'error' }));
    } catch {
      setTestResult(prev => ({ ...prev, [providerId]: 'error' }));
    }
    setTimeout(() => setTestResult(prev => ({ ...prev, [providerId]: null })), 5000);
  };

  const handleSetDefault = async (providerId) => {
    try {
      await api.post(`/llm-providers/${providerId}/set-default`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao definir padrão');
    }
  };

  const handleDelete = async (providerId) => {
    if (!confirm('Excluir este provedor de IA?')) return;
    try {
      await api.delete(`/llm-providers/${providerId}`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir provedor');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 rounded-xl" />
            <div>
              <div className="skeleton h-6 w-48" />
              <div className="skeleton h-4 w-64 mt-1" />
            </div>
          </div>
          <div className="skeleton h-10 w-40 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card p-5">
              <div className="skeleton h-10 w-10 rounded-xl mb-3" />
              <div className="skeleton h-4 w-24 mb-1" />
              <div className="skeleton h-6 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const summary = dashboard?.summary;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-indigo-500 to-purple-600">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Provedores de IA</h1>
            <p className="page-subtitle">Gerencie provedores LLM e monitore créditos</p>
          </div>
        </div>
        <button
          onClick={() => { setEditProvider(null); setShowModal(true); }}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Adicionar Provedor
        </button>
      </div>

      {error && (
        <div className="card bg-red-50 border border-red-200 p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError('')} className="ml-auto btn-ghost btn-sm"><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard
            icon={DollarSign}
            label="Orçamento Total"
            value={summary.total_budget_usd > 0 ? `$${summary.total_budget_usd.toFixed(2)}` : 'Sem limite'}
            gradient="from-blue-500 to-blue-600"
          />
          <SummaryCard
            icon={Activity}
            label="Gasto no Mês"
            value={`$${summary.total_spent_usd.toFixed(2)}`}
            gradient="from-orange-500 to-amber-600"
          />
          <SummaryCard
            icon={Zap}
            label="Crédito Restante"
            value={summary.total_budget_usd > 0 ? `$${summary.total_remaining_usd.toFixed(2)}` : 'Ilimitado'}
            gradient="from-green-500 to-emerald-600"
          />
          <SummaryCard
            icon={Bot}
            label="Provedores Ativos"
            value={`${summary.active_providers} / ${summary.total_providers}`}
            gradient="from-purple-500 to-indigo-600"
          />
        </div>
      )}

      {/* Alerts */}
      {summary?.alerts?.length > 0 && (
        <div className="space-y-2">
          {summary.alerts.map((alert, i) => (
            <div
              key={i}
              className={`card p-4 flex items-center gap-3 border ${
                alert.type === 'budget_exhausted'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                alert.type === 'budget_exhausted' ? 'text-red-500' : 'text-amber-500'
              }`} />
              <p className={`text-sm ${
                alert.type === 'budget_exhausted' ? 'text-red-700' : 'text-amber-700'
              }`}>
                {alert.message}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Provider Cards */}
      {providers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Bot className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="empty-state-title">Nenhum provedor configurado</h3>
          <p className="empty-state-text">Adicione um provedor de IA para começar</p>
          <button
            onClick={() => { setEditProvider(null); setShowModal(true); }}
            className="btn-primary mt-4"
          >
            <Plus className="w-4 h-4" />
            Adicionar Provedor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map(provider => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              testResult={testResult[provider.id]}
              onTest={() => handleTest(provider.id)}
              onSetDefault={() => handleSetDefault(provider.id)}
              onEdit={() => { setEditProvider(provider); setShowModal(true); }}
              onDelete={() => handleDelete(provider.id)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <ProviderModal
          provider={editProvider}
          availableProviders={availableProviders}
          onClose={() => { setShowModal(false); setEditProvider(null); }}
          onSaved={() => { setShowModal(false); setEditProvider(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, gradient }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <div className={`stat-icon bg-gradient-to-br ${gradient}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider, testResult, onTest, onSetDefault, onEdit, onDelete }) {
  const usagePct = provider.usage_pct ?? 0;
  const barColor =
    provider.is_budget_exhausted ? 'bg-red-500' :
    provider.is_above_alert ? 'bg-amber-500' :
    'bg-green-500';

  return (
    <div className={`card card-hover p-5 border-l-4 ${
      provider.is_default ? 'border-primary-500' : 'border-transparent'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{provider.name}</h3>
            {provider.is_default && (
              <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full font-medium">
                Padrão
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {PROVIDER_LABELS[provider.provider_type] || provider.provider_type}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
          provider.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {provider.is_active ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="text-sm text-gray-600 mb-3">
        <p>Modelo: <span className="font-mono text-xs">{provider.model}</span></p>
        <p>Key: <span className="font-mono text-xs">{provider.api_key_masked}</span></p>
      </div>

      {/* Budget Progress */}
      {provider.budget_limit_usd !== null ? (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Gasto: ${provider.spent_usd.toFixed(2)}</span>
            <span>Limite: ${provider.budget_limit_usd.toFixed(2)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(100, usagePct)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className={`font-medium ${
              provider.is_budget_exhausted ? 'text-red-600' :
              provider.is_above_alert ? 'text-amber-600' :
              'text-green-600'
            }`}>
              {provider.remaining_usd !== null ? `$${provider.remaining_usd.toFixed(2)} restante` : ''}
            </span>
            <span className="text-gray-400">{usagePct?.toFixed(1)}%</span>
          </div>
        </div>
      ) : (
        <div className="mb-3 text-xs text-gray-400">Sem limite de orçamento definido</div>
      )}

      <div className="text-xs text-gray-500 mb-3">
        {provider.total_requests_this_month} requisições neste mês
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t">
        <button
          onClick={onTest}
          disabled={testResult === 'loading'}
          className="btn-ghost btn-sm"
        >
          {testResult === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> :
           testResult === 'success' ? <CheckCircle className="w-3 h-3 text-green-500" /> :
           testResult === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
           <TestTube className="w-3 h-3" />}
          Testar
        </button>
        {!provider.is_default && (
          <button onClick={onSetDefault} className="btn-ghost btn-sm">
            <Star className="w-3 h-3" /> Padrão
          </button>
        )}
        <button onClick={onEdit} className="btn-ghost btn-sm">
          <Pencil className="w-3 h-3" /> Editar
        </button>
        {!provider.is_default && (
          <button
            onClick={onDelete}
            className="btn-ghost btn-sm text-red-600 hover:bg-red-50 ml-auto"
          >
            <Trash2 className="w-3 h-3" /> Excluir
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderModal({ provider, availableProviders, onClose, onSaved }) {
  const isEdit = !!provider;
  const [form, setForm] = useState({
    name: provider?.name || '',
    provider_type: provider?.provider_type || 'anthropic',
    model: provider?.model || '',
    api_key: '',
    budget_limit_usd: provider?.budget_limit_usd ?? '',
    alert_threshold_pct: provider?.alert_threshold_pct ?? 80,
    is_default: provider?.is_default ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // OpenRouter dynamic models state
  const [orModels, setOrModels] = useState([]);
  const [orLoading, setOrLoading] = useState(false);
  const [orSearch, setOrSearch] = useState('');
  const [orFetched, setOrFetched] = useState(false);

  const selectedProvider = availableProviders.find(p => p.id === form.provider_type);
  const isDynamicProvider = selectedProvider?.dynamic_models || false;
  const models = isDynamicProvider ? [] : (selectedProvider?.models || []);

  // Set first model when provider changes (non-OpenRouter)
  useEffect(() => {
    if (!isEdit && !isDynamicProvider && models.length > 0 && !models.includes(form.model)) {
      setForm(f => ({ ...f, model: models[0] }));
    }
  }, [form.provider_type, models, isEdit, isDynamicProvider]);

  // Reset OpenRouter state when switching away
  useEffect(() => {
    if (!isDynamicProvider) {
      setOrModels([]);
      setOrFetched(false);
      setOrSearch('');
    }
  }, [isDynamicProvider]);

  const fetchOpenRouterModels = async () => {
    setOrLoading(true);
    try {
      const params = form.api_key ? { api_key: form.api_key } : {};
      const res = await api.get('/llm-providers/openrouter-models', { params });
      setOrModels(res.data.models || []);
      setOrFetched(true);
    } catch (err) {
      setError('Erro ao buscar modelos do OpenRouter. Verifique sua API Key.');
    } finally {
      setOrLoading(false);
    }
  };

  const filteredOrModels = orModels.filter(m =>
    m.name.toLowerCase().includes(orSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(orSearch.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = { ...form };
      if (!payload.budget_limit_usd && payload.budget_limit_usd !== 0) {
        payload.budget_limit_usd = null;
      } else {
        payload.budget_limit_usd = parseFloat(payload.budget_limit_usd);
      }

      if (isEdit) {
        if (!payload.api_key) delete payload.api_key;
        await api.put(`/llm-providers/${provider.id}`, payload);
      } else {
        await api.post('/llm-providers', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar provedor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Editar Provedor' : 'Adicionar Provedor de IA'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="input-label">Nome</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ex: Production Claude, Backup OpenAI"
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="input-label">Provedor</label>
          <select
            value={form.provider_type}
            onChange={e => setForm(f => ({ ...f, provider_type: e.target.value, model: '' }))}
            className="input-field"
            disabled={isEdit}
          >
            {availableProviders.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="input-label">
            API Key {isEdit && <span className="text-gray-400">(deixe vazio para manter)</span>}
          </label>
          <input
            type="password"
            value={form.api_key}
            onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
            placeholder={isEdit ? '****configurado' : 'sk-...'}
            className="input-field font-mono"
            required={!isEdit}
          />
        </div>

        {/* Model selection: static for regular providers, dynamic for OpenRouter */}
        {isDynamicProvider ? (
          <div>
            <label className="input-label">Modelo</label>
            {!orFetched ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  {form.api_key
                    ? 'Clique para buscar os modelos disponíveis no OpenRouter.'
                    : 'Insira sua API Key acima e clique para buscar os modelos.'}
                </p>
                <button
                  type="button"
                  onClick={fetchOpenRouterModels}
                  disabled={orLoading}
                  className="btn-secondary btn-sm"
                >
                  {orLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {orLoading ? 'Buscando modelos...' : 'Buscar Modelos'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={orSearch}
                    onChange={e => setOrSearch(e.target.value)}
                    placeholder="Buscar modelo... (ex: claude, gpt, llama)"
                    className="input-field pl-9"
                  />
                </div>
                <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                  {filteredOrModels.length === 0 ? (
                    <div className="p-3 text-sm text-gray-400 text-center">Nenhum modelo encontrado</div>
                  ) : (
                    filteredOrModels.slice(0, 100).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, model: m.id })); setOrSearch(''); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 ${
                          form.model === m.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                        }`}
                      >
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-2">
                          <span className="font-mono">{m.id}</span>
                          {m.context_length > 0 && <span>| {(m.context_length / 1000).toFixed(0)}k ctx</span>}
                          {m.pricing && (
                            <span>| ${m.pricing.input}/M in, ${m.pricing.output}/M out</span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                {form.model && (
                  <div className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Selecionado: <span className="font-mono">{form.model}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={fetchOpenRouterModels}
                  disabled={orLoading}
                  className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${orLoading ? 'animate-spin' : ''}`} />
                  Recarregar modelos
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="input-label">Modelo</label>
            <select
              value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              className="input-field"
              required
            >
              <option value="">Selecione...</option>
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">Orçamento Mensal (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.budget_limit_usd}
              onChange={e => setForm(f => ({ ...f, budget_limit_usd: e.target.value }))}
              placeholder="Sem limite"
              className="input-field"
            />
            <p className="text-xs text-gray-400 mt-1">Deixe vazio para sem limite</p>
          </div>
          <div>
            <label className="input-label">Alerta em (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={form.alert_threshold_pct}
              onChange={e => setForm(f => ({ ...f, alert_threshold_pct: parseInt(e.target.value) || 80 }))}
              className="input-field"
            />
            <p className="text-xs text-gray-400 mt-1">Notificar ao atingir este %</p>
          </div>
        </div>

        {!isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
              className="rounded"
            />
            Definir como provedor padrão
          </label>
        )}

        <div className="flex gap-3 pt-4 border-t">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || (isDynamicProvider && !form.model)}
            className="btn-primary flex-1"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Salvar' : 'Criar Provedor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
