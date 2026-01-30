import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Modal from '../components/Modal';

const DEFAULT_LIMIT_KEYS = [
  { key: 'max_whatsapp_sessions', label: 'Sessões WhatsApp' },
  { key: 'max_messages_month', label: 'Mensagens IA / mês' },
  { key: 'max_team_members', label: 'Membros da equipe' },
  { key: 'max_integrations', label: 'Integrações' },
];

export default function AdminPlans() {
  const queryClient = useQueryClient();
  const [editModal, setEditModal] = useState(null); // null | 'new' | plan object
  const [form, setForm] = useState({
    name: '', description: '', price_monthly: '', price_yearly: '', is_active: true, features: {},
    limits: DEFAULT_LIMIT_KEYS.map(k => ({ limit_key: k.key, limit_value: 0, description: k.label })),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/admin/plans').then(r => r.data),
  });

  const savePlan = useMutation({
    mutationFn: (data) => {
      if (editModal && editModal !== 'new') {
        return api.put(`/admin/plans/${editModal.id}`, data);
      }
      return api.post('/admin/plans', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      setEditModal(null);
      toast.success('Plano salvo');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao salvar plano'),
  });

  const deletePlan = useMutation({
    mutationFn: (id) => api.delete(`/admin/plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      toast.success('Plano removido');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao remover'),
  });

  const openNew = () => {
    setForm({
      name: '', description: '', price_monthly: '', price_yearly: '', included_credits_brl: '', is_active: true, features: {},
      limits: DEFAULT_LIMIT_KEYS.map(k => ({ limit_key: k.key, limit_value: 0, description: k.label })),
    });
    setEditModal('new');
  };

  const openEdit = (plan) => {
    setForm({
      name: plan.name,
      description: plan.description || '',
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly || '',
      included_credits_brl: plan.included_credits_brl || '',
      is_active: plan.is_active,
      features: plan.features || {},
      limits: DEFAULT_LIMIT_KEYS.map(k => {
        const existing = plan.limits?.find(l => l.limit_key === k.key);
        return {
          limit_key: k.key,
          limit_value: existing?.limit_value ?? 0,
          description: k.label,
        };
      }),
    });
    setEditModal(plan);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    savePlan.mutate({
      ...form,
      price_monthly: parseFloat(form.price_monthly),
      price_yearly: form.price_yearly ? parseFloat(form.price_yearly) : null,
      included_credits_brl: form.included_credits_brl ? parseFloat(form.included_credits_brl) : 0,
    });
  };

  const updateLimit = (index, value) => {
    const newLimits = [...form.limits];
    newLimits[index] = { ...newLimits[index], limit_value: parseInt(value) || 0 };
    setForm({ ...form, limits: newLimits });
  };

  const plans = data?.plans || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-primary-500 to-primary-600">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Gerenciar Planos</h1>
            <p className="page-subtitle">Crie e edite os planos disponíveis para os clientes</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Plano
        </button>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6 space-y-4">
              <div className="skeleton h-6 w-32" />
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-10 w-40" />
              <div className="space-y-2">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : plans.length === 0 ? (
        /* Empty State */
        <div className="empty-state">
          <div className="empty-state-icon">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="empty-state-title">Nenhum plano criado ainda</h3>
          <p className="empty-state-text">Crie seu primeiro plano para disponibilizar aos clientes.</p>
          <button onClick={openNew} className="btn-primary mt-4">
            <Plus className="w-4 h-4" />
            Criar primeiro plano
          </button>
        </div>
      ) : (
        /* Plan Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.id} className={`card card-hover p-6 border-2 ${plan.is_active ? 'border-green-200' : 'border-gray-200 opacity-60'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(plan)} className="btn-ghost btn-sm">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Remover este plano?')) deletePlan.mutate(plan.id); }}
                    className="btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-500 mb-4">{plan.description || 'Sem descrição'}</p>

              <div className="mb-4">
                <span className="text-3xl font-extrabold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
                  R$ {parseFloat(plan.price_monthly).toFixed(2).replace('.', ',')}
                </span>
                <span className="text-gray-500 text-sm ml-1">/mês</span>
              </div>

              {plan.price_yearly && (
                <p className="text-sm text-gray-500">
                  Anual: R$ {parseFloat(plan.price_yearly).toFixed(2).replace('.', ',')}
                </p>
              )}
              {parseFloat(plan.included_credits_brl || 0) > 0 && (
                <p className="text-sm text-indigo-600 font-medium">
                  Créditos IA: R$ {parseFloat(plan.included_credits_brl).toFixed(2).replace('.', ',')} /mês
                </p>
              )}

              <div className="border-t pt-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Limites</p>
                {plan.limits?.map((l) => (
                  <div key={l.limit_key} className="flex justify-between text-sm">
                    <span className="text-gray-600">{l.description || l.limit_key}</span>
                    <span className="font-semibold text-gray-900">{l.limit_value === -1 ? 'Ilimitado' : l.limit_value}</span>
                  </div>
                ))}
                {(!plan.limits || plan.limits.length === 0) && (
                  <p className="text-sm text-gray-400">Nenhum limite definido</p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t">
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {plan.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar/Editar */}
      {editModal && (
        <Modal onClose={() => setEditModal(null)} title={editModal === 'new' ? 'Novo Plano' : `Editar: ${editModal.name}`}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="input-label">Nome do plano</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="input-field"
                placeholder="Ex: Pro"
              />
            </div>

            <div>
              <label className="input-label">Descrição</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-field"
                rows={2}
                placeholder="Descrição curta do plano"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Preço mensal (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price_monthly}
                  onChange={(e) => setForm({ ...form, price_monthly: e.target.value })}
                  required
                  className="input-field"
                />
              </div>
              <div>
                <label className="input-label">Preço anual (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price_yearly}
                  onChange={(e) => setForm({ ...form, price_yearly: e.target.value })}
                  className="input-field"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="input-label">Créditos incluídos (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.included_credits_brl}
                  onChange={(e) => setForm({ ...form, included_credits_brl: e.target.value })}
                  className="input-field"
                  placeholder="0.00 = sem créditos incluídos"
                />
                <p className="text-xs text-gray-500 mt-1">Créditos de IA incluídos no plano (repostos mensalmente)</p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded text-primary-600"
                />
                Plano ativo (visível para clientes)
              </label>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Limites do plano</p>
              <p className="text-xs text-gray-500 mb-3">Use -1 para ilimitado</p>
              <div className="space-y-3">
                {form.limits.map((limit, i) => (
                  <div key={limit.limit_key} className="flex items-center gap-3">
                    <span className="input-label mb-0 w-48">{limit.description}</span>
                    <input
                      type="number"
                      value={limit.limit_value}
                      onChange={(e) => updateLimit(i, e.target.value)}
                      className="input-field w-28"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={savePlan.isPending} className="btn-primary">
                <Save className="w-4 h-4" />
                {savePlan.isPending ? 'Salvando...' : 'Salvar Plano'}
              </button>
              <button type="button" onClick={() => setEditModal(null)} className="btn-secondary">
                <X className="w-4 h-4" />
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
