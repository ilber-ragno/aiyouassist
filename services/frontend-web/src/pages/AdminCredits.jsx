import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Plus, Edit2, Trash2, Settings, Users, DollarSign, Save, X } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';

function formatBrl(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function PackageForm({ pkg, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: pkg?.name || '',
    description: pkg?.description || '',
    price_brl: pkg?.price_brl || '',
    credit_amount_brl: pkg?.credit_amount_brl || '',
    is_active: pkg?.is_active ?? true,
    sort_order: pkg?.sort_order || 0,
  });

  return (
    <div className="bg-gray-50 rounded-lg p-4 border space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="input-label">Nome</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="input-field" placeholder="Ex: Pacote Básico" />
        </div>
        <div>
          <label className="input-label">Descrição</label>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="input-field" placeholder="Descrição opcional" />
        </div>
        <div>
          <label className="input-label">Preço (R$)</label>
          <input type="number" step="0.01" value={form.price_brl}
            onChange={e => setForm({ ...form, price_brl: e.target.value })}
            className="input-field" placeholder="50.00" />
        </div>
        <div>
          <label className="input-label">Créditos (R$)</label>
          <input type="number" step="0.01" value={form.credit_amount_brl}
            onChange={e => setForm({ ...form, credit_amount_brl: e.target.value })}
            className="input-field" placeholder="50.00" />
        </div>
        <div>
          <label className="input-label">Ordem</label>
          <input type="number" value={form.sort_order}
            onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
            className="input-field" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })}
              className="rounded" />
            Ativo
          </label>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-secondary btn-sm">
          <X className="w-3 h-3" /> Cancelar
        </button>
        <button onClick={() => onSave(form)} className="btn-primary btn-sm">
          <Save className="w-3 h-3" /> Salvar
        </button>
      </div>
    </div>
  );
}

export default function AdminCredits() {
  const queryClient = useQueryClient();
  const [showNewPackage, setShowNewPackage] = useState(false);
  const [editingPkg, setEditingPkg] = useState(null);
  const [manualCredit, setManualCredit] = useState({ tenantId: '', amount: '', description: '' });
  const [showManualForm, setShowManualForm] = useState(false);

  const { data: packagesData } = useQuery({
    queryKey: ['admin-credit-packages'],
    queryFn: () => api.get('/admin/credits/packages').then(r => r.data),
  });

  const { data: settingsData, refetch: refetchSettings } = useQuery({
    queryKey: ['admin-credit-settings'],
    queryFn: () => api.get('/admin/credits/settings').then(r => r.data),
  });

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ['admin-credit-tenants'],
    queryFn: () => api.get('/admin/credits/tenants').then(r => r.data),
  });

  const [settingsForm, setSettingsForm] = useState(null);

  const createPkg = useMutation({
    mutationFn: (data) => api.post('/admin/credits/packages', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-packages'] });
      setShowNewPackage(false);
      toast.success('Pacote criado');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar pacote'),
  });

  const updatePkg = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/admin/credits/packages/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-packages'] });
      setEditingPkg(null);
      toast.success('Pacote atualizado');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar'),
  });

  const deletePkg = useMutation({
    mutationFn: (id) => api.delete(`/admin/credits/packages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-packages'] });
      toast.success('Pacote excluído');
    },
  });

  const updateSettings = useMutation({
    mutationFn: (data) => api.put('/admin/credits/settings', data),
    onSuccess: () => {
      refetchSettings();
      setSettingsForm(null);
      toast.success('Configurações atualizadas');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro'),
  });

  const addCredit = useMutation({
    mutationFn: ({ tenantId, ...data }) => api.post(`/admin/credits/tenants/${tenantId}/credit`, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-tenants'] });
      setShowManualForm(false);
      setManualCredit({ tenantId: '', amount: '', description: '' });
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao creditar'),
  });

  const settings = settingsData?.settings;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-yellow-500 to-amber-600">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Administração de Créditos</h1>
            <p className="page-subtitle">Pacotes, configurações de markup e crédito manual</p>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="card">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" /> Configurações de Markup
          </h2>
          {!settingsForm && settings && (
            <button onClick={() => setSettingsForm({
              markup_type: settings.markup_type,
              markup_value: settings.markup_value,
              usd_to_brl_rate: settings.usd_to_brl_rate,
              min_balance_warning_brl: settings.min_balance_warning_brl,
              block_on_zero_balance: settings.block_on_zero_balance,
            })} className="btn-ghost btn-sm text-primary-600">
              <Edit2 className="w-3 h-3" /> Editar
            </button>
          )}
        </div>
        <div className="p-6">
          {settingsForm ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="input-label">Tipo de Markup</label>
                  <select value={settingsForm.markup_type}
                    onChange={e => setSettingsForm({ ...settingsForm, markup_type: e.target.value })}
                    className="input-field">
                    <option value="percentage">Percentual (%)</option>
                    <option value="fixed_per_1k">Fixo por 1k tokens</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">
                    Valor ({settingsForm.markup_type === 'percentage' ? '%' : 'R$/1k tokens'})
                  </label>
                  <input type="number" step="0.01" value={settingsForm.markup_value}
                    onChange={e => setSettingsForm({ ...settingsForm, markup_value: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="input-label">Taxa USD → BRL</label>
                  <input type="number" step="0.01" value={settingsForm.usd_to_brl_rate}
                    onChange={e => setSettingsForm({ ...settingsForm, usd_to_brl_rate: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="input-label">Alerta Saldo Mínimo (R$)</label>
                  <input type="number" step="0.01" value={settingsForm.min_balance_warning_brl}
                    onChange={e => setSettingsForm({ ...settingsForm, min_balance_warning_brl: e.target.value })}
                    className="input-field" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={settingsForm.block_on_zero_balance}
                      onChange={e => setSettingsForm({ ...settingsForm, block_on_zero_balance: e.target.checked })}
                      className="rounded" />
                    Bloquear sem saldo
                  </label>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setSettingsForm(null)} className="btn-secondary btn-sm">Cancelar</button>
                <button onClick={() => updateSettings.mutate(settingsForm)} className="btn-primary btn-sm">
                  Salvar
                </button>
              </div>
            </div>
          ) : settings ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Markup</span>
                <p className="font-medium">
                  {settings.markup_type === 'percentage' ? `${settings.markup_value}%` : `R$ ${settings.markup_value}/1k`}
                </p>
              </div>
              <div>
                <span className="text-gray-500">USD → BRL</span>
                <p className="font-medium">R$ {settings.usd_to_brl_rate}</p>
              </div>
              <div>
                <span className="text-gray-500">Alerta Mínimo</span>
                <p className="font-medium">{formatBrl(settings.min_balance_warning_brl)}</p>
              </div>
              <div>
                <span className="text-gray-500">Bloquear sem saldo</span>
                <p className="font-medium">{settings.block_on_zero_balance ? 'Sim' : 'Não'}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-4 w-32" />
            </div>
          )}
        </div>
      </div>

      {/* Packages */}
      <div className="card">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5" /> Pacotes de Créditos
          </h2>
          <button onClick={() => setShowNewPackage(true)} className="btn-primary btn-sm">
            <Plus className="w-3 h-3" /> Novo Pacote
          </button>
        </div>
        <div className="p-6 space-y-4">
          {showNewPackage && (
            <PackageForm onSave={(data) => createPkg.mutate(data)} onCancel={() => setShowNewPackage(false)} />
          )}
          {packagesData?.packages?.map((pkg) => (
            <div key={pkg.id}>
              {editingPkg === pkg.id ? (
                <PackageForm pkg={pkg} onSave={(data) => updatePkg.mutate({ id: pkg.id, ...data })} onCancel={() => setEditingPkg(null)} />
              ) : (
                <div className="card card-hover p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{pkg.name}</span>
                      {!pkg.is_active && <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full font-medium">Inativo</span>}
                    </div>
                    {pkg.description && <p className="text-sm text-gray-500 mt-0.5">{pkg.description}</p>}
                    <p className="text-sm text-gray-600 mt-1">
                      Preço: <strong>{formatBrl(pkg.price_brl)}</strong> → Créditos: <strong>{formatBrl(pkg.credit_amount_brl)}</strong>
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditingPkg(pkg.id)} className="btn-ghost btn-sm">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => { if (confirm('Excluir pacote?')) deletePkg.mutate(pkg.id); }}
                      className="btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!packagesData?.packages?.length && !showNewPackage && (
            <div className="empty-state py-8">
              <p className="empty-state-text">Nenhum pacote cadastrado</p>
            </div>
          )}
        </div>
      </div>

      {/* Tenant Balances + Manual Credit */}
      <div className="card">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" /> Saldos dos Tenants
          </h2>
          <button onClick={() => setShowManualForm(!showManualForm)}
            className="btn-sm flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            <Plus className="w-3 h-3" /> Crédito Manual
          </button>
        </div>

        {showManualForm && (
          <div className="p-6 bg-green-50 border-b space-y-3">
            <h3 className="font-medium text-green-900">Adicionar Crédito Manual</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="input-label">Tenant</label>
                <select value={manualCredit.tenantId}
                  onChange={e => setManualCredit({ ...manualCredit, tenantId: e.target.value })}
                  className="input-field">
                  <option value="">Selecione...</option>
                  {tenantsData?.tenants?.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({formatBrl(t.balance_brl)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Valor (R$)</label>
                <input type="number" step="0.01" value={manualCredit.amount}
                  onChange={e => setManualCredit({ ...manualCredit, amount: e.target.value })}
                  className="input-field" placeholder="50.00" />
              </div>
              <div>
                <label className="input-label">Descrição</label>
                <input value={manualCredit.description}
                  onChange={e => setManualCredit({ ...manualCredit, description: e.target.value })}
                  className="input-field" placeholder="Motivo do crédito" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowManualForm(false)} className="btn-secondary btn-sm">Cancelar</button>
              <button
                onClick={() => addCredit.mutate({
                  tenantId: manualCredit.tenantId,
                  amount_brl: parseFloat(manualCredit.amount),
                  description: manualCredit.description,
                })}
                disabled={!manualCredit.tenantId || !manualCredit.amount || !manualCredit.description}
                className="btn-sm flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                Creditar
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Tenant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Saldo</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Comprado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Consumido</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Usuários</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tenantsLoading ? (
                [1, 2, 3].map(i => (
                  <tr key={i}>
                    <td className="px-6 py-3"><div className="skeleton h-4 w-32" /></td>
                    <td className="px-6 py-3"><div className="skeleton h-4 w-16" /></td>
                    <td className="px-6 py-3"><div className="skeleton h-4 w-20 ml-auto" /></td>
                    <td className="px-6 py-3"><div className="skeleton h-4 w-20 ml-auto" /></td>
                    <td className="px-6 py-3"><div className="skeleton h-4 w-20 ml-auto" /></td>
                    <td className="px-6 py-3"><div className="skeleton h-4 w-10 ml-auto" /></td>
                  </tr>
                ))
              ) : tenantsData?.tenants?.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{t.name}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>{t.status}</span>
                  </td>
                  <td className={`px-6 py-3 text-sm text-right font-medium ${t.balance_brl <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatBrl(t.balance_brl)}
                  </td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{formatBrl(t.total_purchased_brl)}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{formatBrl(t.total_consumed_brl)}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{t.users_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
