import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Settings, Save, Eye, EyeOff, Zap, CreditCard, Bot, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.some(r => r === 'admin' || r.name === 'admin');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data),
  });

  const { data: credentialsData } = useQuery({
    queryKey: ['settings-credentials'],
    queryFn: () => api.get('/settings/credentials').then(r => r.data),
  });

  const { data: aiData } = useQuery({
    queryKey: ['settings-ai'],
    queryFn: () => api.get('/settings/ai').then(r => r.data),
  });

  // Company state
  const [companyName, setCompanyName] = useState('');
  const [notifications, setNotifications] = useState({});

  // Credentials state
  const [credForm, setCredForm] = useState({
    billing_provider: 'asaas',
    asaas_key: '',
    stripe_key: '',
    webhook_secret: '',
  });
  const [showCreds, setShowCreds] = useState(false);

  // AI state
  const [aiForm, setAiForm] = useState({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    api_key: '',
  });
  const [showAiKey, setShowAiKey] = useState(false);

  useEffect(() => {
    if (data) {
      setCompanyName(data.company?.name || '');
      setNotifications(data.notifications || {});
    }
  }, [data]);

  useEffect(() => {
    if (credentialsData) {
      setCredForm(f => ({
        ...f,
        billing_provider: credentialsData.billing_provider || 'asaas',
      }));
    }
  }, [credentialsData]);

  useEffect(() => {
    if (aiData?.ai) {
      setAiForm(f => ({
        ...f,
        provider: aiData.ai.provider || 'anthropic',
        model: aiData.ai.model || 'claude-sonnet-4-20250514',
      }));
    }
  }, [aiData]);

  // Mutations
  const updateCompany = useMutation({
    mutationFn: (d) => api.put('/settings/company', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Dados da empresa atualizados'); },
    onError: () => toast.error('Erro ao salvar'),
  });

  const updateNotifications = useMutation({
    mutationFn: (d) => api.put('/settings/notifications', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Notificações atualizadas'); },
    onError: () => toast.error('Erro ao salvar'),
  });

  const updateCredentials = useMutation({
    mutationFn: (d) => api.put('/settings/credentials', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-credentials'] });
      toast.success('Credenciais de pagamento atualizadas');
      setCredForm(f => ({ ...f, asaas_key: '', stripe_key: '', webhook_secret: '' }));
    },
    onError: () => toast.error('Erro ao salvar credenciais'),
  });

  const testCredentials = useMutation({
    mutationFn: (provider) => api.post('/settings/credentials/test', { provider }),
    onSuccess: (res) => toast.success(res.data.message || 'Conexão OK'),
    onError: (err) => toast.error(err.response?.data?.message || 'Falha no teste'),
  });

  const updateAi = useMutation({
    mutationFn: (d) => api.put('/settings/ai', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-ai'] });
      toast.success('Configurações de IA atualizadas');
      setAiForm(f => ({ ...f, api_key: '' }));
    },
    onError: () => toast.error('Erro ao salvar configurações de IA'),
  });

  const testAi = useMutation({
    mutationFn: () => api.post('/settings/ai/test'),
    onSuccess: (res) => toast.success(res.data.message || 'IA funcionando!'),
    onError: (err) => toast.error(err.response?.data?.message || 'Falha no teste'),
  });

  const availableModels = aiData?.available_providers?.find(p => p.id === aiForm.provider)?.models || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Configurações
          </h1>
          <p className="page-subtitle">{isAdmin ? 'Configure sua empresa, IA, pagamentos e notificações' : 'Configure sua empresa e notificações'}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6">
          <div className="skeleton h-48 rounded-lg" />
          <div className="skeleton h-64 rounded-lg" />
          <div className="skeleton h-48 rounded-lg" />
          <div className="skeleton h-40 rounded-lg" />
        </div>
      ) : (
        <>
          {/* -- Inteligencia Artificial (admin only) -- */}
          {isAdmin && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Bot className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-semibold">Inteligência Artificial</h2>
              </div>
              <a
                href="/llm-providers"
                className="text-sm font-medium text-purple-600 hover:text-purple-800 hover:underline"
              >
                Gerenciar Provedores de IA &rarr;
              </a>
            </div>
            <p className="text-sm text-gray-500">
              Configure múltiplos provedores de IA (Claude, ChatGPT, Groq, Mistral, etc.) com monitoramento de créditos e orçamento mensal.
            </p>
          </div>
          )}

          {/* -- Gateway de Pagamento (admin only) -- */}
          {isAdmin && (
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <CreditCard className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold">Gateway de Pagamento</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Configure o provedor de pagamento para cobrar seus clientes. O Asaas aceita PIX, boleto e cartão no Brasil.
              O Stripe aceita cartão de crédito internacional.
            </p>
            <div className="space-y-4">
              <div>
                <label className="input-label">Provedor de pagamento</label>
                <select
                  value={credForm.billing_provider}
                  onChange={(e) => setCredForm({ ...credForm, billing_provider: e.target.value })}
                  className="input-field max-w-xs"
                >
                  <option value="asaas">Asaas (PIX, Boleto, Cartão - Brasil)</option>
                  <option value="stripe">Stripe (Cartão - Internacional)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {credForm.billing_provider === 'asaas' ? (
                  <div>
                    <label className="input-label">API Key do Asaas</label>
                    <input
                      type={showCreds ? 'text' : 'password'}
                      value={credForm.asaas_key}
                      onChange={(e) => setCredForm({ ...credForm, asaas_key: e.target.value })}
                      placeholder={credentialsData?.credentials?.asaas_key ? 'Configurada (deixe vazio para manter)' : 'Cole sua API key do Asaas'}
                      className="input-field"
                    />
                    {credentialsData?.credentials?.asaas_key && (
                      <p className="text-xs text-green-600 mt-1">Configurada: {credentialsData.credentials.asaas_key}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="input-label">Secret Key do Stripe</label>
                    <input
                      type={showCreds ? 'text' : 'password'}
                      value={credForm.stripe_key}
                      onChange={(e) => setCredForm({ ...credForm, stripe_key: e.target.value })}
                      placeholder={credentialsData?.credentials?.stripe_key ? 'Configurada (deixe vazio para manter)' : 'Cole sua Secret Key do Stripe'}
                      className="input-field"
                    />
                    {credentialsData?.credentials?.stripe_key && (
                      <p className="text-xs text-green-600 mt-1">Configurada: {credentialsData.credentials.stripe_key}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="input-label">Webhook Secret</label>
                  <input
                    type={showCreds ? 'text' : 'password'}
                    value={credForm.webhook_secret}
                    onChange={(e) => setCredForm({ ...credForm, webhook_secret: e.target.value })}
                    placeholder={credentialsData?.credentials?.webhook_secret ? 'Configurado (deixe vazio para manter)' : 'Secret para validar webhooks'}
                    className="input-field"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCreds}
                  onChange={(e) => setShowCreds(e.target.checked)}
                  className="rounded text-green-600"
                />
                Mostrar valores
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => updateCredentials.mutate(credForm)}
                  disabled={updateCredentials.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {updateCredentials.isPending ? 'Salvando...' : 'Salvar Pagamento'}
                </button>
                <button
                  onClick={() => testCredentials.mutate(credForm.billing_provider)}
                  disabled={testCredentials.isPending}
                  className="btn-secondary flex items-center gap-2"
                >
                  {testCredentials.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {testCredentials.isPending ? 'Testando...' : 'Testar Conexão'}
                </button>
              </div>
            </div>
          </div>
          )}

          {/* -- Dados da Empresa -- */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Settings className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold">Dados da Empresa</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="input-label">Nome da empresa</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Slug</p>
                  <p className="font-medium font-mono">{data?.company?.slug}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <p className="font-medium capitalize">{data?.company?.status}</p>
                </div>
              </div>
              <button
                onClick={() => updateCompany.mutate({ name: companyName })}
                disabled={updateCompany.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {updateCompany.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          {/* -- Notificações -- */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Notificações</h2>
            <div className="space-y-3">
              {[
                { key: 'email_alerts', label: 'Alertas por email' },
                { key: 'webhook_failures', label: 'Falhas de webhook' },
                { key: 'usage_warnings', label: 'Avisos de uso' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-700">{label}</span>
                  <input
                    type="checkbox"
                    checked={notifications[key] ?? true}
                    onChange={(e) => setNotifications(n => ({ ...n, [key]: e.target.checked }))}
                    className="rounded text-primary-600"
                  />
                </label>
              ))}
              <button
                onClick={() => updateNotifications.mutate(notifications)}
                disabled={updateNotifications.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {updateNotifications.isPending ? 'Salvando...' : 'Salvar notificações'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
