import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Send, Trash2, Wifi, WifiOff, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Modal from '../components/Modal';

const STATUS_MAP = {
  connected: { label: 'Conectado', color: 'text-green-700 bg-green-100', icon: CheckCircle2 },
  disconnected: { label: 'Desconectado', color: 'text-gray-600 bg-gray-100', icon: WifiOff },
  error: { label: 'Erro', color: 'text-red-700 bg-red-100', icon: XCircle },
};

export default function TelegramConnection() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [token, setToken] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['telegram-bots'],
    queryFn: () => api.get('/telegram/bots').then(r => r.data),
    refetchInterval: 10000,
  });

  const addMutation = useMutation({
    mutationFn: (botToken) => api.post('/telegram/bots', { bot_token: botToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-bots'] });
      setShowAddModal(false);
      setToken('');
      setTestResult(null);
      toast.success('Bot registrado com sucesso');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao registrar bot'),
  });

  const connectMutation = useMutation({
    mutationFn: (botId) => api.post(`/telegram/bots/${botId}/connect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-bots'] });
      toast.success('Bot conectado');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao conectar'),
  });

  const disconnectMutation = useMutation({
    mutationFn: (botId) => api.post(`/telegram/bots/${botId}/disconnect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-bots'] });
      toast.success('Bot desconectado');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao desconectar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (botId) => api.delete(`/telegram/bots/${botId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-bots'] });
      toast.success('Bot removido');
    },
    onError: () => toast.error('Erro ao remover bot'),
  });

  const handleTest = async () => {
    if (!token.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/telegram/bots/test', { bot_token: token });
      setTestResult({ valid: true, bot: res.data.bot });
    } catch (err) {
      setTestResult({ valid: false, error: err.response?.data?.error || 'Token invalido' });
    } finally {
      setTesting(false);
    }
  };

  const handleAdd = () => {
    if (!token.trim()) return;
    addMutation.mutate(token);
  };

  const bots = data?.bots || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-blue-500 to-blue-700">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Telegram</h1>
            <p className="page-subtitle">Conecte bots do Telegram para atender clientes</p>
          </div>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Adicionar Bot
        </button>
      </div>

      {/* Info banner */}
      <div className="card bg-blue-50 border border-blue-200">
        <div className="p-4 flex items-start gap-3">
          <Send className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Como configurar</p>
            <p className="text-sm text-blue-600 mt-1">
              1. Abra o <strong>@BotFather</strong> no Telegram e crie um bot com <code>/newbot</code>.{' '}
              2. Copie o token gerado e cole aqui.{' '}
              3. Conecte o bot e ele comecara a responder automaticamente com IA.
            </p>
          </div>
        </div>
      </div>

      {/* Bot List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="skeleton h-5 w-48" />
              <div className="skeleton h-4 w-32" />
            </div>
          ))}
        </div>
      ) : bots.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Send className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="empty-state-title">Nenhum bot configurado</h3>
          <p className="empty-state-text">
            Adicione um bot do Telegram para comecar a atender clientes por la.
          </p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">
            <Plus className="w-4 h-4" />
            Adicionar Bot
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {bots.map((bot) => {
            const status = STATUS_MAP[bot.status] || STATUS_MAP.disconnected;
            const StatusIcon = status.icon;
            const isBusy = connectMutation.isPending || disconnectMutation.isPending;

            return (
              <div key={bot.id} className="card card-hover p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Send className="w-6 h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {bot.bot_name || bot.bot_username}
                        </h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">@{bot.bot_username}</p>
                      {bot.last_error && bot.status === 'error' && (
                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {bot.last_error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    {bot.status === 'connected' ? (
                      <button
                        onClick={() => disconnectMutation.mutate(bot.id)}
                        disabled={isBusy}
                        className="btn-secondary btn-sm text-amber-600 hover:text-amber-700"
                      >
                        <WifiOff className="w-4 h-4" />
                        Desconectar
                      </button>
                    ) : (
                      <button
                        onClick={() => connectMutation.mutate(bot.id)}
                        disabled={isBusy}
                        className="btn-primary btn-sm"
                      >
                        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                        Conectar
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm('Remover este bot?')) deleteMutation.mutate(bot.id);
                      }}
                      className="btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Bot Modal */}
      {showAddModal && (
        <Modal
          onClose={() => { setShowAddModal(false); setToken(''); setTestResult(null); }}
          title="Adicionar Bot do Telegram"
        >
          <div className="space-y-4">
            <div>
              <label className="input-label">Token do Bot</label>
              <input
                value={token}
                onChange={(e) => { setToken(e.target.value); setTestResult(null); }}
                className="input-field font-mono text-sm"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              />
              <p className="text-xs text-gray-500 mt-1">
                Obtenha o token criando um bot com o @BotFather no Telegram.
              </p>
            </div>

            {testResult && (
              <div className={`p-3 rounded-lg text-sm ${
                testResult.valid
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {testResult.valid ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>
                      Bot valido: <strong>@{testResult.bot.username}</strong> ({testResult.bot.first_name})
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span>{testResult.error}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleTest}
                disabled={!token.trim() || testing}
                className="btn-secondary"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Testar Token
              </button>
              <button
                onClick={handleAdd}
                disabled={!token.trim() || addMutation.isPending}
                className="btn-primary"
              >
                <Plus className="w-4 h-4" />
                {addMutation.isPending ? 'Registrando...' : 'Registrar Bot'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
