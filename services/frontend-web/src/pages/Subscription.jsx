import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, AlertTriangle, ExternalLink, XCircle, QrCode, Users, Smartphone, MessageSquare, CheckCircle } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useState } from 'react';

export default function Subscription() {
  const queryClient = useQueryClient();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [pixModal, setPixModal] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get('/subscription').then(r => r.data),
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['subscription-invoices'],
    queryFn: () => api.get('/subscription/invoices').then(r => r.data),
  });

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then(r => r.data),
  });

  const changePlan = useMutation({
    mutationFn: (planId) => api.post('/subscription/change-plan', { plan_id: planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-invoices'] });
      toast.success('Plano alterado com sucesso');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao alterar plano'),
  });

  const cancelSubscription = useMutation({
    mutationFn: () => api.post('/subscription/cancel', { reason: cancelReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      setCancelModalOpen(false);
      setCancelReason('');
      toast.success('Assinatura cancelada');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao cancelar assinatura'),
  });

  const getInvoiceLink = useMutation({
    mutationFn: (invoiceId) => api.get(`/subscription/invoices/${invoiceId}/link`).then(r => r.data),
    onSuccess: (data) => {
      if (data.pix?.payload) {
        setPixModal(data);
      } else if (data.invoice_url) {
        window.open(data.invoice_url, '_blank');
      } else {
        toast.error('Link da fatura não disponível');
      }
    },
    onError: () => toast.error('Erro ao buscar link da fatura'),
  });

  const statusLabel = {
    active: 'Ativo',
    trial: 'Trial',
    past_due: 'Inadimplente',
    cancelled: 'Cancelado',
    paused: 'Pausado',
  };

  const invoiceColumns = [
    {
      key: 'due_date',
      label: 'Vencimento',
      render: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '-',
    },
    {
      key: 'amount',
      label: 'Valor',
      render: (v) => `R$ ${parseFloat(v).toFixed(2)}`,
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <StatusBadge status={v} label={{
        pending: 'Pendente',
        paid: 'Pago',
        failed: 'Falhou',
        refunded: 'Estornado',
        cancelled: 'Cancelado',
      }[v] || v} />,
    },
    {
      key: 'paid_at',
      label: 'Pago em',
      render: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '-',
    },
    {
      key: 'id',
      label: 'Ação',
      render: (v, row) => {
        if (row.status === 'pending') {
          return (
            <button
              onClick={() => getInvoiceLink.mutate(v)}
              disabled={getInvoiceLink.isPending}
              className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              Pagar
            </button>
          );
        }
        if (row.invoice_url && row.status === 'paid') {
          return (
            <a
              href={row.invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ExternalLink className="w-4 h-4" />
              Ver
            </a>
          );
        }
        return null;
      },
    },
  ];

  const isBlocked = data?.is_blocked;
  const subscriptionStatus = data?.subscription?.status || 'trial';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Assinatura
          </h1>
          <p className="page-subtitle">Gerencie seu plano e faturas</p>
        </div>
      </div>

      {/* Blocked banner */}
      {isBlocked && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-red-800">Conta Bloqueada</h3>
            <p className="text-sm text-red-700 mt-1">
              {data?.blocked_reason || 'Sua conta está bloqueada por falta de pagamento. Regularize suas faturas pendentes para continuar usando o sistema.'}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card p-5">
              <div className="space-y-3">
                <div className="skeleton h-5 w-32 rounded" />
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-10 w-40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Current Plan */}
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">Plano Atual</h2>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={subscriptionStatus}
                  label={statusLabel[subscriptionStatus] || subscriptionStatus}
                />
                {isBlocked && (
                  <StatusBadge status="error" label="Bloqueado" />
                )}
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="flex items-center gap-3">
                  <div className="stat-icon bg-gradient-to-br from-purple-500 to-purple-700 shadow-sm">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Plano</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">
                      {data?.plan?.name || 'Trial'}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Valor Mensal</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {data?.plan?.price_monthly ? `R$ ${data.plan.price_monthly}` : 'Grátis'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Próximo vencimento</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {data?.subscription?.current_period_end
                      ? new Date(data.subscription.current_period_end).toLocaleDateString('pt-BR')
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Provedor</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5 capitalize">
                    {data?.subscription?.payment_provider || '-'}
                  </p>
                </div>
              </div>

              {/* Cancel button */}
              {data?.subscription && !['cancelled'].includes(subscriptionStatus) && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setCancelModalOpen(true)}
                    className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700 btn-sm"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancelar assinatura
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Usage Quotas */}
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Uso e Limites</h2>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">Usuários</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {data?.usage?.users || 0}
                    <span className="text-sm text-gray-400 font-normal">
                      {' '}/ {data?.limits?.users === -1 ? 'Ilimitado' : data?.limits?.users || 0}
                    </span>
                  </p>
                  {data?.limits?.users > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-primary-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((data?.usage?.users || 0) / data.limits.users) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">Conexões WhatsApp</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {data?.usage?.whatsapp_connections || 0}
                    <span className="text-sm text-gray-400 font-normal">
                      {' '}/ {data?.limits?.whatsapp_connections || 0}
                    </span>
                  </p>
                  {data?.limits?.whatsapp_connections > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-green-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((data?.usage?.whatsapp_connections || 0) / data.limits.whatsapp_connections) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">Mensagens/mês</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    <span className="text-sm text-gray-400 font-normal">
                      Limite: {data?.limits?.messages_monthly === -1 ? 'Ilimitado' : data?.limits?.messages_monthly || 0}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Available Plans */}
          {plans?.plans?.length > 0 && (
            <div className="card">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Planos Disponíveis</h2>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plans.plans.map((plan) => {
                    const isCurrent = data?.plan?.id === plan.id;
                    return (
                      <div
                        key={plan.id}
                        className={`card-hover p-5 border-2 transition-all ${
                          isCurrent
                            ? 'ring-2 ring-primary-500 border-primary-500 bg-primary-50/50'
                            : 'border-transparent'
                        }`}
                      >
                        {isCurrent && (
                          <span className="badge bg-primary-100 text-primary-700 mb-3">
                            <CheckCircle className="w-3 h-3" />
                            Plano atual
                          </span>
                        )}
                        <h3 className="font-semibold text-lg text-gray-900">{plan.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                        <p className="text-2xl font-bold text-primary-600 mt-3">
                          R$ {plan.price_monthly}
                          <span className="text-sm text-gray-400 font-normal">/mês</span>
                        </p>
                        {isCurrent ? (
                          <span className="mt-4 inline-block w-full text-center btn-sm bg-primary-100 text-primary-700 rounded-lg font-medium">
                            Plano atual
                          </span>
                        ) : (
                          <button
                            onClick={() => changePlan.mutate(plan.id)}
                            disabled={changePlan.isPending}
                            className="btn-primary w-full mt-4"
                          >
                            {changePlan.isPending ? 'Processando...' : 'Alterar plano'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Invoices */}
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Faturas</h2>
            </div>
            <DataTable
              columns={invoiceColumns}
              data={invoicesData?.invoices?.data || []}
              pagination={invoicesData?.invoices}
              emptyMessage="Nenhuma fatura encontrada"
            />
          </div>
        </>
      )}

      {/* Cancel Modal */}
      {cancelModalOpen && (
        <Modal onClose={() => setCancelModalOpen(false)} title="Cancelar Assinatura">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Tem certeza que deseja cancelar sua assinatura? Você perderá acesso aos recursos do plano atual.
            </p>
            <div>
              <label className="input-label">
                Motivo do cancelamento (opcional)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="input-field"
                rows={3}
                placeholder="Conte-nos por que está cancelando..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCancelModalOpen(false)}
                className="btn-ghost"
              >
                Voltar
              </button>
              <button
                onClick={() => cancelSubscription.mutate()}
                disabled={cancelSubscription.isPending}
                className="btn-danger"
              >
                {cancelSubscription.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* PIX QR Code Modal */}
      {pixModal && (
        <Modal onClose={() => setPixModal(null)} title="Pagamento via PIX">
          <div className="space-y-4 text-center">
            <div className="stat-icon bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm mx-auto">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm text-gray-600">
              Copie o código PIX abaixo para realizar o pagamento:
            </p>
            <div className="card bg-gray-50 p-4">
              <code className="text-xs break-all text-gray-700">{pixModal.pix?.payload}</code>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(pixModal.pix?.payload || '');
                toast.success('Código PIX copiado!');
              }}
              className="btn-primary"
            >
              Copiar código PIX
            </button>
            {pixModal.invoice_url && (
              <div>
                <a
                  href={pixModal.invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-600 hover:underline font-medium"
                >
                  Ou pague via boleto
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
