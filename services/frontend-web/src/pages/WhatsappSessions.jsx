import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Loader } from 'lucide-react';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';

const statusColors = {
  connected: 'text-green-600',
  waiting_qr: 'text-yellow-600',
  disconnected: 'text-gray-400',
  error: 'text-red-600',
};

const statusBorders = {
  connected: 'border-l-green-500',
  waiting_qr: 'border-l-yellow-500',
  disconnected: 'border-l-gray-300',
  error: 'border-l-red-500',
};

const statusIcons = {
  connected: CheckCircle,
  waiting_qr: Loader,
  disconnected: XCircle,
  error: XCircle,
};

export default function WhatsappSessions() {
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('/whatsapp/sessions').then(r => r.data),
    refetchInterval: 5000,
  });

  const createSession = useMutation({
    mutationFn: (name) => api.post('/whatsapp/sessions', { session_name: name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      setShowNewSession(false);
      setSessionName('');
      toast.success('Sessão criada');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Erro ao criar sessão');
    },
  });

  const connectSession = useMutation({
    mutationFn: (id) => api.post(`/whatsapp/sessions/${id}/connect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Erro ao conectar');
    },
  });

  const deleteSession = useMutation({
    mutationFn: (id) => api.delete(`/whatsapp/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success('Sessão removida');
    },
  });

  const sessions = data?.sessions || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="page-title">Conexões WhatsApp</h1>
            <p className="page-subtitle">Gerencie suas conexões</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewSession(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Nova conexão
        </button>
      </div>

      {/* New session modal */}
      {showNewSession && (
        <Modal onClose={() => setShowNewSession(false)} title="Nova conexão WhatsApp">
          <div className="space-y-4">
            <div>
              <label className="input-label">Nome da conexão</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Ex: Vendas, Suporte..."
                className="input-field"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && sessionName.trim() && createSession.mutate(sessionName)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewSession(false)}
                className="btn-ghost"
              >
                Cancelar
              </button>
              <button
                onClick={() => createSession.mutate(sessionName)}
                disabled={!sessionName.trim() || createSession.isPending}
                className="btn-primary"
              >
                {createSession.isPending ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Sessions list */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="skeleton w-10 h-10 rounded-full" />
                    <div className="space-y-2">
                      <div className="skeleton h-5 w-28" />
                      <div className="skeleton h-4 w-36" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="skeleton w-8 h-8 rounded" />
                    <div className="skeleton w-8 h-8 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Smartphone className="empty-state-icon" />
              <h3 className="empty-state-title">Nenhuma conexão configurada</h3>
              <p className="empty-state-text">
                Adicione uma conexão WhatsApp para começar a receber mensagens.
              </p>
              <button
                onClick={() => setShowNewSession(true)}
                className="btn-primary btn-sm mt-5"
              >
                <Plus className="w-4 h-4" />
                Adicionar primeira conexão
              </button>
            </div>
          </div>
        ) : (
          sessions.map((session) => {
            const StatusIcon = statusIcons[session.status] || XCircle;
            const borderClass = statusBorders[session.status] || 'border-l-gray-300';

            return (
              <div key={session.id} className={`card-hover p-6 border-l-4 ${borderClass}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full bg-gray-100 ${statusColors[session.status]}`}>
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div className="ml-4">
                      <h3 className="font-semibold text-gray-900">{session.session_name}</h3>
                      <div className="flex items-center text-sm text-gray-500">
                        <StatusIcon className={`w-4 h-4 mr-1 ${statusColors[session.status]}`} />
                        {session.status === 'connected'
                          ? session.phone_number
                          : session.status.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {session.status !== 'connected' && (
                      <button
                        onClick={() => connectSession.mutate(session.id)}
                        className="btn-ghost btn-sm p-2"
                        title="Conectar"
                      >
                        <RefreshCw className="w-5 h-5 text-primary-600" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteSession.mutate(session.id)}
                      className="btn-ghost btn-sm p-2 text-gray-400 hover:text-red-600"
                      title="Remover"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* QR Code */}
                {session.status === 'waiting_qr' && session.qr_code && (
                  <div className="mt-4 flex justify-center">
                    <div className="p-4 bg-white border-2 border-gray-200 rounded-xl">
                      <QRCodeSVG value={session.qr_code} size={200} />
                      <p className="text-center text-sm text-gray-500 mt-3">
                        Escaneie com seu WhatsApp
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
