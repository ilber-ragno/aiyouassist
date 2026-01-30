import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Zap, Save, Eye, EyeOff, Shield } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';

const PROVIDER_INFO = {
  asaas: { name: 'Asaas', description: 'Gateway de pagamento brasileiro (PIX, Boleto, Cartão)', color: 'from-green-500 to-green-700' },
  stripe: { name: 'Stripe', description: 'Gateway de pagamento global (Cartão, ACH)', color: 'from-purple-500 to-purple-700' },
};

export default function AdminPaymentGateways() {
  const queryClient = useQueryClient();
  const [editProvider, setEditProvider] = useState(null);
  const [form, setForm] = useState({ api_key: '', webhook_secret: '', is_active: false, sandbox: false });
  const [showKey, setShowKey] = useState({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-payment-gateways'],
    queryFn: () => api.get('/admin/payment-gateways').then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ provider, ...data }) => api.put(`/admin/payment-gateways/${provider}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payment-gateways'] });
      toast.success('Gateway atualizado');
      setEditProvider(null);
      setForm({ api_key: '', webhook_secret: '', is_active: false, sandbox: false });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao atualizar'),
  });

  const testMutation = useMutation({
    mutationFn: (provider) => api.post(`/admin/payment-gateways/${provider}/test`),
    onSuccess: (res) => toast.success(res.data.message || 'Conexao OK'),
    onError: (err) => toast.error(err.response?.data?.message || 'Falha no teste'),
  });

  function startEdit(gw) {
    setEditProvider(gw.provider);
    setForm({
      api_key: '',
      webhook_secret: '',
      is_active: gw.is_active,
      sandbox: gw.sandbox,
    });
  }

  function handleSave(e) {
    e.preventDefault();
    const payload = { provider: editProvider };
    if (form.api_key) payload.api_key = form.api_key;
    if (form.webhook_secret) payload.webhook_secret = form.webhook_secret;
    payload.is_active = form.is_active;
    payload.sandbox = form.sandbox;
    updateMutation.mutate(payload);
  }

  const gateways = data?.gateways || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-emerald-500 to-emerald-700">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Gateways de Pagamento</h1>
            <p className="page-subtitle">Configure os provedores de pagamento para cobrar clientes</p>
          </div>
        </div>
      </div>

      <div className="card bg-blue-50 border border-blue-200">
        <div className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Configuracao Centralizada</p>
            <p className="text-sm text-blue-600 mt-1">
              As chaves de API configuradas aqui sao usadas para processar todos os pagamentos dos clientes.
              As credenciais sao armazenadas de forma criptografada.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="card bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">Erro ao carregar gateways: {error.message}</p>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map(i => (
            <div key={i} className="card p-6 space-y-4">
              <div className="skeleton h-6 w-32" />
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-10 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {gateways.map(gw => {
            const info = PROVIDER_INFO[gw.provider] || { name: gw.provider, description: '', color: 'from-gray-500 to-gray-700' };
            const isEditing = editProvider === gw.provider;

            return (
              <div key={gw.provider} className="card">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`stat-icon bg-gradient-to-br ${info.color}`}>
                        <CreditCard className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{info.name}</h3>
                        <p className="text-sm text-gray-500">{info.description}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      gw.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {gw.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Chave API:</span>
                      <span className="font-mono text-gray-700">{gw.api_key_masked || 'Nao configurada'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Webhook Secret:</span>
                      <span className="font-mono text-gray-700">{gw.webhook_secret_masked || 'Nao configurado'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Modo:</span>
                      <span className={`font-medium ${gw.sandbox ? 'text-amber-600' : 'text-green-600'}`}>
                        {gw.sandbox ? 'Sandbox (Teste)' : 'Producao'}
                      </span>
                    </div>
                  </div>

                  {isEditing ? (
                    <form onSubmit={handleSave} className="space-y-3 border-t pt-4">
                      <div>
                        <label className="input-label">Chave API (deixe vazio para manter)</label>
                        <input
                          type="password"
                          value={form.api_key}
                          onChange={e => setForm({ ...form, api_key: e.target.value })}
                          className="input-field"
                          placeholder="Insira nova chave..."
                        />
                      </div>
                      <div>
                        <label className="input-label">Webhook Secret (deixe vazio para manter)</label>
                        <input
                          type="password"
                          value={form.webhook_secret}
                          onChange={e => setForm({ ...form, webhook_secret: e.target.value })}
                          className="input-field"
                          placeholder="Insira novo secret..."
                        />
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={e => setForm({ ...form, is_active: e.target.checked })}
                            className="rounded"
                          />
                          Ativo
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.sandbox}
                            onChange={e => setForm({ ...form, sandbox: e.target.checked })}
                            className="rounded"
                          />
                          Modo Sandbox
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={updateMutation.isPending} className="btn-primary btn-sm">
                          <Save className="w-4 h-4" /> Salvar
                        </button>
                        <button type="button" onClick={() => setEditProvider(null)} className="btn-secondary btn-sm">
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex gap-2 border-t pt-4">
                      <button onClick={() => startEdit(gw)} className="btn-secondary btn-sm">
                        Editar
                      </button>
                      {gw.has_api_key && (
                        <button
                          onClick={() => testMutation.mutate(gw.provider)}
                          disabled={testMutation.isPending}
                          className="btn-ghost btn-sm"
                        >
                          <Zap className="w-4 h-4" /> Testar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
