import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import {
  Smartphone,
  Plus,
  Trash2,
  RefreshCw,
  WifiOff,
  QrCode,
  CheckCircle,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function WhatsappConnection() {
  const queryClient = useQueryClient();
  const [createModal, setCreateModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [activeQrSession, setActiveQrSession] = useState(null);
  const [diagnosticsSession, setDiagnosticsSession] = useState(null);

  // List sessions - poll faster when QR is active
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-sessions'],
    queryFn: () => api.get('/whatsapp/sessions').then(r => r.data),
    refetchInterval: activeQrSession ? 3000 : 10000,
  });

  // Poll session status when waiting for QR
  const { data: qrStatus } = useQuery({
    queryKey: ['whatsapp-qr-status', activeQrSession],
    queryFn: () => api.get(`/whatsapp/sessions/${activeQrSession}/status`).then(r => r.data),
    enabled: !!activeQrSession,
    refetchInterval: 2000,
  });

  // Auto-close QR modal when connected
  useEffect(() => {
    if (qrStatus?.status === 'connected') {
      toast.success('WhatsApp conectado com sucesso!');
      setActiveQrSession(null);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
    }
  }, [qrStatus?.status]);

  // Diagnostics query
  const { data: diagnostics } = useQuery({
    queryKey: ['whatsapp-diagnostics', diagnosticsSession],
    queryFn: () => api.get(`/whatsapp/sessions/${diagnosticsSession}/diagnostics`).then(r => r.data),
    enabled: !!diagnosticsSession,
  });

  // Create session
  const createSession = useMutation({
    mutationFn: (name) => api.post('/whatsapp/sessions', { session_name: name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      setCreateModal(false);
      setSessionName('');
      toast.success('Sessão criada');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar sessão'),
  });

  // Connect (request QR code)
  const connectSession = useMutation({
    mutationFn: (id) => api.post(`/whatsapp/sessions/${id}/connect`).then(r => r.data),
    onSuccess: (data, id) => {
      setActiveQrSession(id);
      if (data.session?.qr_code) {
        toast.success('QR Code gerado! Escaneie com seu WhatsApp.');
      } else {
        toast('Gerando QR Code, aguarde...', { icon: '\u23F3' });
      }
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao conectar'),
  });

  // Disconnect
  const disconnectSession = useMutation({
    mutationFn: (id) => api.post(`/whatsapp/sessions/${id}/disconnect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success('Sessão desconectada');
    },
    onError: () => toast.error('Erro ao desconectar'),
  });

  // Delete
  const deleteSession = useMutation({
    mutationFn: (id) => api.delete(`/whatsapp/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success('Sessão removida');
    },
    onError: () => toast.error('Erro ao remover sessão'),
  });

  // Heartbeat
  const heartbeat = useMutation({
    mutationFn: (id) => api.post(`/whatsapp/sessions/${id}/heartbeat`).then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] });
      toast.success(data.alive ? 'Sessão ativa!' : 'Sessão inativa');
    },
  });

  const sessions = data?.sessions || [];

  const statusConfig = {
    connected: { icon: CheckCircle, color: 'text-green-600', border: 'border-l-green-500', label: 'Conectado' },
    waiting_qr: { icon: QrCode, color: 'text-yellow-600', border: 'border-l-yellow-500', label: 'Aguardando QR' },
    disconnected: { icon: WifiOff, color: 'text-gray-400', border: 'border-l-gray-300', label: 'Desconectado' },
    reconnecting: { icon: RefreshCw, color: 'text-blue-500', border: 'border-l-blue-500', label: 'Reconectando' },
    error: { icon: AlertTriangle, color: 'text-red-500', border: 'border-l-red-500', label: 'Erro' },
    banned: { icon: AlertTriangle, color: 'text-red-700', border: 'border-l-red-700', label: 'Banido' },
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="page-title">WhatsApp</h1>
            <p className="page-subtitle">Gerencie suas conexões WhatsApp</p>
          </div>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="btn-success btn-sm"
        >
          <Plus className="w-4 h-4" />
          Nova Sessão
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="skeleton h-5 w-32" />
                  <div className="skeleton h-4 w-24" />
                </div>
                <div className="skeleton h-5 w-5 rounded-full" />
              </div>
              <div className="skeleton h-6 w-28 rounded-full" />
              <div className="skeleton h-4 w-40" />
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <div className="skeleton h-7 w-20 rounded" />
                <div className="skeleton h-7 w-7 rounded" />
                <div className="skeleton h-7 w-7 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Smartphone className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhuma sessão WhatsApp</h3>
            <p className="empty-state-text">
              Crie uma sessão e escaneie o QR Code para conectar seu WhatsApp.
            </p>
            <button
              onClick={() => setCreateModal(true)}
              className="btn-success btn-sm mt-5"
            >
              <Plus className="w-4 h-4" />
              Criar primeira sessão
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => {
            const status = statusConfig[session.status] || statusConfig.disconnected;
            const StatusIcon = status.icon;
            const isWaitingQr = session.status === 'waiting_qr';
            const isConnected = session.status === 'connected';

            return (
              <div
                key={session.id}
                className={`card-hover p-5 border-l-4 ${status.border}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{session.session_name}</h3>
                    <p className="text-sm text-gray-500">
                      {session.phone_number || 'Não conectado'}
                    </p>
                  </div>
                  <StatusIcon className={`w-5 h-5 ${status.color} ${isWaitingQr || session.status === 'reconnecting' ? 'animate-pulse' : ''}`} />
                </div>

                <div className="mb-3">
                  <StatusBadge status={session.status} label={status.label} />
                </div>

                {session.last_error && (
                  <div className="mb-3 text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                    {session.last_error}
                  </div>
                )}

                {session.last_connected_at && (
                  <p className="text-xs text-gray-400 mb-3">
                    Última conexão: {new Date(session.last_connected_at).toLocaleString('pt-BR')}
                  </p>
                )}

                <div className="flex items-center gap-1.5 pt-3 border-t border-gray-100">
                  {!isConnected && (
                    <button
                      onClick={() => connectSession.mutate(session.id)}
                      disabled={connectSession.isPending}
                      className="btn-success btn-sm"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      {isWaitingQr ? 'Gerar novo QR' : 'Conectar'}
                    </button>
                  )}
                  {isConnected && (
                    <button
                      onClick={() => disconnectSession.mutate(session.id)}
                      disabled={disconnectSession.isPending}
                      className="btn-secondary btn-sm"
                    >
                      <WifiOff className="w-3.5 h-3.5" />
                      Desconectar
                    </button>
                  )}
                  <button
                    onClick={() => heartbeat.mutate(session.id)}
                    className="btn-ghost btn-sm p-1.5"
                    title="Verificar status"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDiagnosticsSession(session.id)}
                    className="btn-ghost btn-sm p-1.5"
                    title="Diagnósticos"
                  >
                    <Activity className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Remover esta sessão?')) {
                        deleteSession.mutate(session.id);
                      }
                    }}
                    className="btn-ghost btn-sm p-1.5 ml-auto text-gray-400 hover:text-red-600"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR Code Modal */}
      {activeQrSession && (
        <Modal onClose={() => setActiveQrSession(null)} title="Escanear QR Code - WhatsApp">
          <div className="text-center space-y-4">
            {qrStatus?.status === 'connected' ? (
              <div className="bg-green-50 p-6 rounded-xl">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <p className="text-green-700 font-semibold text-lg">WhatsApp conectado!</p>
                {qrStatus.phone_number && (
                  <p className="text-sm text-green-600 mt-1">Número: {qrStatus.phone_number}</p>
                )}
              </div>
            ) : qrStatus?.qr_code ? (
              <>
                <div className="inline-block p-4 bg-white border-2 border-gray-200 rounded-xl">
                  {qrStatus.qr_code.startsWith('data:image') ? (
                    <img src={qrStatus.qr_code} alt="QR Code WhatsApp" width={256} height={256} />
                  ) : (
                    <QRCodeSVG value={qrStatus.qr_code} size={256} level="M" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600">
                    Abra o <strong>WhatsApp</strong> no celular &rarr; <strong>Dispositivos Conectados</strong> &rarr; <strong>Conectar Dispositivo</strong>
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    O QR Code atualiza automaticamente
                  </p>
                </div>
              </>
            ) : (
              <div className="py-8">
                <div className="w-64 h-64 mx-auto rounded-xl skeleton mb-4" />
                <p className="text-sm text-gray-600">
                  Gerando QR Code, aguarde...
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Aguarde enquanto iniciamos a conexão WhatsApp.
                </p>
                <button
                  onClick={() => connectSession.mutate(activeQrSession)}
                  disabled={connectSession.isPending}
                  className="btn-secondary btn-sm mt-4"
                >
                  <RefreshCw className={`w-4 h-4 ${connectSession.isPending ? 'animate-spin' : ''}`} />
                  Tentar novamente
                </button>
              </div>
            )}

            {qrStatus?.last_error && (
              <div className="bg-red-50 p-3 rounded-lg text-sm text-red-600">
                {qrStatus.last_error}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Diagnostics Modal */}
      {diagnosticsSession && diagnostics && (
        <Modal onClose={() => setDiagnosticsSession(null)} title="Diagnósticos">
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Sessão</h4>
              <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                <p>Status: <StatusBadge status={diagnostics.session?.status || 'unknown'} /></p>
                <p>Última conexão: {diagnostics.session?.last_connected_at
                  ? new Date(diagnostics.session.last_connected_at).toLocaleString('pt-BR')
                  : 'Nunca'}</p>
                {diagnostics.session?.last_error && (
                  <p className="text-red-600">Erro: {diagnostics.session.last_error}</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Conector (WhatsApp Service)</h4>
              <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                {diagnostics.connector ? (
                  <>
                    <p>Status: {diagnostics.connector.status || 'N/A'}</p>
                    <p>Gateway: {diagnostics.connector.gateway_connected ? 'Conectado' : 'Desconectado'}</p>
                  </>
                ) : (
                  <p className="text-gray-500">Indisponível</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Canais</h4>
              <div className="bg-gray-50 p-3 rounded-lg">
                {diagnostics.channels ? (
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(diagnostics.channels, null, 2)}
                  </pre>
                ) : (
                  <p className="text-gray-500">Indisponível</p>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Session Modal */}
      {createModal && (
        <Modal onClose={() => setCreateModal(false)} title="Nova Sessão WhatsApp">
          <div className="space-y-4">
            <div>
              <label className="input-label">
                Nome da Sessão
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Ex: WhatsApp Principal, Suporte, Vendas..."
                className="input-field"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && sessionName.trim() && createSession.mutate(sessionName)}
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Cada sessão corresponde a um número de WhatsApp conectado.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCreateModal(false)}
                className="btn-ghost"
              >
                Cancelar
              </button>
              <button
                onClick={() => createSession.mutate(sessionName)}
                disabled={!sessionName.trim() || createSession.isPending}
                className="btn-success"
              >
                {createSession.isPending ? 'Criando...' : 'Criar Sessão'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
