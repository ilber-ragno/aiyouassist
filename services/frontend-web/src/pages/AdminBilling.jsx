import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  Users,
  AlertTriangle,
  Ban,
  TrendingUp,
  Eye,
  Lock,
  Unlock,
  Send,
  X,
  ArrowLeft,
  FileText,
  Coins,
  CheckCircle,
  Gift,
  CreditCard,
  Calendar,
  Activity,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useState } from 'react';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(v || 0));
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '-';

export default function AdminBilling() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [detailTenantId, setDetailTenantId] = useState(null);
  const [blockModal, setBlockModal] = useState(null);
  const [blockReason, setBlockReason] = useState('');

  if (detailTenantId) {
    return (
      <TenantFinancialDetail
        tenantId={detailTenantId}
        onBack={() => { setDetailTenantId(null); queryClient.invalidateQueries({ queryKey: ['admin-billing-subscribers'] }); }}
      />
    );
  }

  return (
    <BillingOverview
      filter={filter}
      setFilter={setFilter}
      search={search}
      setSearch={setSearch}
      onViewDetail={setDetailTenantId}
      blockModal={blockModal}
      setBlockModal={setBlockModal}
      blockReason={blockReason}
      setBlockReason={setBlockReason}
    />
  );
}

/* ─── Overview (lista de subscribers) ─── */
function BillingOverview({ filter, setFilter, search, setSearch, onViewDetail, blockModal, setBlockModal, blockReason, setBlockReason }) {
  const queryClient = useQueryClient();

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin-billing-overview'],
    queryFn: () => api.get('/admin/billing/overview').then(r => r.data),
  });

  const { data: subscribersData, isLoading: subscribersLoading } = useQuery({
    queryKey: ['admin-billing-subscribers', filter, search],
    queryFn: () =>
      api.get('/admin/billing/subscribers', {
        params: { filter: filter || undefined, search: search || undefined },
      }).then(r => r.data),
  });

  const blockTenant = useMutation({
    mutationFn: ({ tenantId, reason }) =>
      api.post(`/admin/billing/subscribers/${tenantId}/block`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-billing-subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-billing-overview'] });
      setBlockModal(null);
      setBlockReason('');
      toast.success('Tenant bloqueado');
    },
    onError: () => toast.error('Erro ao bloquear tenant'),
  });

  const unblockTenant = useMutation({
    mutationFn: (tenantId) => api.post(`/admin/billing/subscribers/${tenantId}/unblock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-billing-subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-billing-overview'] });
      toast.success('Tenant desbloqueado');
    },
    onError: () => toast.error('Erro ao desbloquear tenant'),
  });

  const sendInvoice = useMutation({
    mutationFn: (tenantId) => api.post(`/admin/billing/subscribers/${tenantId}/send-invoice`),
    onSuccess: (res) => {
      const url = res.data?.invoice_url;
      if (url) {
        navigator.clipboard.writeText(url);
        toast.success('Link da fatura copiado para a área de transferência');
      } else {
        toast.success('Fatura enviada');
      }
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao enviar fatura'),
  });

  const filters = [
    { value: '', label: 'Todos' },
    { value: 'active', label: 'Ativos' },
    { value: 'past_due', label: 'Inadimplentes' },
    { value: 'blocked', label: 'Bloqueados' },
    { value: 'trial', label: 'Trial' },
  ];

  const subscriberColumns = [
    {
      key: 'name',
      label: 'Tenant',
      render: (v, row) => (
        <div>
          <p className="font-medium text-gray-900">{v}</p>
          <p className="text-xs text-gray-500">{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'subscription',
      label: 'Plano',
      render: (v) => v?.plan?.name || '-',
    },
    {
      key: 'subscription',
      label: 'Status',
      render: (v, row) => (
        <div className="flex items-center gap-1">
          <StatusBadge
            status={v?.status || 'trial'}
            label={{
              active: 'Ativo',
              trial: 'Trial',
              past_due: 'Inadimplente',
              cancelled: 'Cancelado',
              paused: 'Pausado',
            }[v?.status] || v?.status || 'Trial'}
          />
          {row.is_blocked && <StatusBadge status="error" label="Bloqueado" />}
        </div>
      ),
    },
    {
      key: 'users_count',
      label: 'Usuários',
    },
    {
      key: 'created_at',
      label: 'Criado em',
      render: (v) => fmtDate(v),
    },
    {
      key: 'id',
      label: 'Ações',
      render: (id, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewDetail(id)}
            className="btn-ghost btn-sm"
            title="Ver detalhes financeiros"
          >
            <Eye className="w-4 h-4" />
          </button>
          {row.is_blocked ? (
            <button
              onClick={() => unblockTenant.mutate(id)}
              className="btn-ghost btn-sm text-green-600 hover:text-green-800 hover:bg-green-50"
              title="Desbloquear"
            >
              <Unlock className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setBlockModal(id)}
              className="btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50"
              title="Bloquear"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => sendInvoice.mutate(id)}
            disabled={sendInvoice.isPending}
            className="btn-ghost btn-sm text-blue-500 hover:text-blue-700 hover:bg-blue-50"
            title="Enviar fatura"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-green-500 to-emerald-600">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Financeiro</h1>
            <p className="page-subtitle">Gestão de assinaturas e pagamentos</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverviewCard icon={Users} label="Assinantes Ativos" value={overview?.active_subscribers ?? '-'} gradient="from-green-500 to-emerald-600" loading={overviewLoading} />
        <OverviewCard icon={TrendingUp} label="MRR" value={overview?.mrr != null ? fmt(overview.mrr) : '-'} gradient="from-primary-500 to-primary-600" loading={overviewLoading} />
        <OverviewCard icon={AlertTriangle} label="Inadimplentes" value={overview?.past_due_subscribers ?? '-'} gradient="from-yellow-500 to-amber-600" loading={overviewLoading} />
        <OverviewCard icon={Ban} label="Bloqueados" value={overview?.blocked_tenants ?? '-'} gradient="from-red-500 to-rose-600" loading={overviewLoading} />
      </div>

      {overview?.revenue_this_month != null && (
        <div className="card p-4 flex items-center gap-4">
          <div className="stat-icon bg-gradient-to-br from-green-500 to-emerald-600">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Receita este mês</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(overview.revenue_this_month)}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-gray-500">Total assinantes</p>
            <p className="text-lg font-semibold text-gray-900">
              {overview.total_subscribers} ({overview.trial_subscribers} trial)
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filter === f.value
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-white hover:shadow-sm'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar tenant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field w-64"
        />
      </div>

      <DataTable
        columns={subscriberColumns}
        data={subscribersData?.data || []}
        pagination={subscribersData}
        isLoading={subscribersLoading}
        emptyMessage="Nenhum assinante encontrado"
      />

      {blockModal && (
        <Modal onClose={() => { setBlockModal(null); setBlockReason(''); }} title="Bloquear Tenant">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              O tenant será bloqueado e não poderá usar o sistema até ser desbloqueado.
            </p>
            <div>
              <label className="input-label">Motivo</label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="input-field"
                rows={2}
                placeholder="Motivo do bloqueio..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setBlockModal(null); setBlockReason(''); }} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={() => blockTenant.mutate({ tenantId: blockModal, reason: blockReason })}
                disabled={blockTenant.isPending}
                className="btn-danger"
              >
                {blockTenant.isPending ? 'Bloqueando...' : 'Confirmar bloqueio'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─── Detalhe financeiro do tenant ─── */
function TenantFinancialDetail({ tenantId, onBack }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [grantForm, setGrantForm] = useState({ amount: '', reason: '' });
  const [grantOpen, setGrantOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-tenant-financial', tenantId],
    queryFn: () => api.get(`/admin/billing/subscribers/${tenantId}/financial`).then(r => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: (invoiceId) => api.post(`/admin/billing/invoices/${invoiceId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-financial', tenantId] });
      toast.success('Pagamento aprovado');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao aprovar'),
  });

  const grantMutation = useMutation({
    mutationFn: (payload) => api.post(`/admin/billing/subscribers/${tenantId}/grant-credits`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-financial', tenantId] });
      setGrantOpen(false);
      setGrantForm({ amount: '', reason: '' });
      toast.success('Créditos concedidos');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao conceder créditos'),
  });

  const blockMutation = useMutation({
    mutationFn: () => api.post(`/admin/billing/subscribers/${tenantId}/block`, { reason: 'Bloqueio administrativo' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-financial', tenantId] });
      toast.success('Tenant bloqueado');
    },
    onError: () => toast.error('Erro ao bloquear'),
  });

  const unblockMutation = useMutation({
    mutationFn: () => api.post(`/admin/billing/subscribers/${tenantId}/unblock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-financial', tenantId] });
      toast.success('Tenant desbloqueado');
    },
    onError: () => toast.error('Erro ao desbloquear'),
  });

  const tabs = [
    { key: 'overview', label: 'Visão Geral', icon: Eye },
    { key: 'invoices', label: 'Faturas', icon: FileText },
    { key: 'credits', label: 'Créditos', icon: Coins },
    { key: 'actions', label: 'Ações', icon: Activity },
  ];

  const tenant = data?.tenant;
  const subscription = data?.subscription;
  const credits = data?.credits;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-green-500 to-emerald-600">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">{tenant?.name || 'Carregando...'}</h1>
            <p className="page-subtitle">Painel financeiro do cliente</p>
          </div>
        </div>
        {tenant && (
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge
              status={subscription?.status || tenant?.status || 'trial'}
              label={{
                active: 'Ativo', trial: 'Trial', past_due: 'Inadimplente',
                cancelled: 'Cancelado', paused: 'Pausado',
              }[subscription?.status] || subscription?.status || 'Trial'}
            />
            {tenant.is_blocked && <StatusBadge status="error" label="Bloqueado" />}
          </div>
        )}
      </div>

      {error && (
        <div className="card bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">Erro ao carregar dados: {error.message}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-8 space-y-4">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      ) : data ? (
        <>
          {tab === 'overview' && <TabOverview data={data} />}
          {tab === 'invoices' && <TabInvoices data={data} approveMutation={approveMutation} />}
          {tab === 'credits' && <TabCredits data={data} />}
          {tab === 'actions' && (
            <TabActions
              data={data}
              grantOpen={grantOpen}
              setGrantOpen={setGrantOpen}
              grantForm={grantForm}
              setGrantForm={setGrantForm}
              grantMutation={grantMutation}
              blockMutation={blockMutation}
              unblockMutation={unblockMutation}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

/* ─── Tab: Visão Geral ─── */
function TabOverview({ data }) {
  const { tenant, subscription, credits, total_revenue } = data;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500">Plano Atual</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{subscription?.plan || '-'}</p>
          <p className="text-xs text-gray-500 mt-1">
            {subscription?.status === 'active' ? 'Ativo' : subscription?.status || 'Sem assinatura'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Receita Total</p>
          <p className="text-lg font-bold text-green-700 mt-1">{fmt(total_revenue)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Créditos (Plano)</p>
          <p className="text-lg font-bold text-primary-700 mt-1">{fmt(credits?.plan_balance_brl)}</p>
          {credits?.plan_included_brl > 0 && (
            <p className="text-xs text-gray-500 mt-1">de {fmt(credits.plan_included_brl)} incluídos</p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Créditos (Avulso)</p>
          <p className="text-lg font-bold text-emerald-700 mt-1">{fmt(credits?.addon_balance_brl)}</p>
          <p className="text-xs text-gray-500 mt-1">Total: {fmt(credits?.total_balance_brl)}</p>
        </div>
      </div>

      {/* Tenant details */}
      <div className="card">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Informações do Tenant</h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Nome</p>
            <p className="font-medium text-gray-900">{tenant?.name}</p>
          </div>
          <div>
            <p className="text-gray-500">Status</p>
            <p className="font-medium text-gray-900 capitalize">{tenant?.status || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">Bloqueado</p>
            <p className={`font-medium ${tenant?.is_blocked ? 'text-red-600' : 'text-green-600'}`}>
              {tenant?.is_blocked ? 'Sim' : 'Não'}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Criado em</p>
            <p className="font-medium text-gray-900">{fmtDate(tenant?.created_at)}</p>
          </div>
          {subscription && (
            <>
              <div>
                <p className="text-gray-500">Provider de Pagamento</p>
                <p className="font-medium text-gray-900 capitalize">{subscription?.provider || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Período Atual Termina</p>
                <p className="font-medium text-gray-900">{fmtDate(subscription?.period_end)}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Credit consumption */}
      <div className="card">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Consumo de Créditos</h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Total Comprado</p>
            <p className="text-lg font-bold text-gray-900">{fmt(credits?.total_purchased_brl)}</p>
          </div>
          <div>
            <p className="text-gray-500">Total Consumido</p>
            <p className="text-lg font-bold text-gray-900">{fmt(credits?.total_consumed_brl)}</p>
          </div>
          <div>
            <p className="text-gray-500">Saldo Total</p>
            <p className="text-lg font-bold text-gray-900">{fmt(credits?.total_balance_brl)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Faturas ─── */
function TabInvoices({ data, approveMutation }) {
  const invoices = data?.invoices || [];

  if (invoices.length === 0) {
    return (
      <div className="card p-8 text-center">
        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Nenhuma fatura encontrada</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Faturas</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {invoices.map((inv) => (
          <div key={inv.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              inv.status === 'paid' ? 'bg-green-100' :
              inv.status === 'pending' ? 'bg-amber-100' :
              inv.status === 'overdue' ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              <FileText className={`w-5 h-5 ${
                inv.status === 'paid' ? 'text-green-600' :
                inv.status === 'pending' ? 'text-amber-600' :
                inv.status === 'overdue' ? 'text-red-600' : 'text-gray-500'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {inv.description || `Fatura #${inv.id?.slice(0, 8)}`}
              </p>
              <p className="text-xs text-gray-500">
                Vencimento: {fmtDate(inv.due_date)}
                {inv.paid_at && ` | Pago: ${fmtDate(inv.paid_at)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">{fmt(inv.amount)}</p>
              <StatusBadge
                status={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'error' : inv.status}
                label={{
                  paid: 'Pago', pending: 'Pendente', overdue: 'Atrasada',
                  cancelled: 'Cancelada', refunded: 'Reembolsada',
                }[inv.status] || inv.status}
              />
            </div>
            {inv.status === 'pending' && (
              <button
                onClick={() => {
                  if (confirm(`Aprovar pagamento de ${fmt(inv.amount)}?`)) {
                    approveMutation.mutate(inv.id);
                  }
                }}
                disabled={approveMutation.isPending}
                className="btn-primary btn-sm flex-shrink-0"
                title="Aprovar pagamento manualmente"
              >
                <CheckCircle className="w-4 h-4" />
                Aprovar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Tab: Créditos ─── */
function TabCredits({ data }) {
  const transactions = data?.credit_transactions || [];
  const credits = data?.credits;

  return (
    <div className="space-y-6">
      {/* Balance cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Coins className="w-4 h-4 text-primary-600" />
            <p className="text-sm text-gray-500">Créditos do Plano</p>
          </div>
          <p className="text-xl font-bold text-primary-700">{fmt(credits?.plan_balance_brl)}</p>
          {credits?.plan_included_brl > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (parseFloat(credits.plan_balance_brl || 0) / parseFloat(credits.plan_included_brl)) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {fmt(credits.plan_balance_brl)} de {fmt(credits.plan_included_brl)}
              </p>
            </div>
          )}
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <p className="text-sm text-gray-500">Créditos Avulsos</p>
          </div>
          <p className="text-xl font-bold text-emerald-700">{fmt(credits?.addon_balance_brl)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-gray-600" />
            <p className="text-sm text-gray-500">Saldo Total</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{fmt(credits?.total_balance_brl)}</p>
        </div>
      </div>

      {/* Transaction history */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Histórico de Transações</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center">
            <Coins className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma transação</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center gap-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  tx.type === 'deduction' ? 'bg-red-100' :
                  tx.type === 'purchase' ? 'bg-green-100' :
                  tx.type === 'manual_credit' ? 'bg-blue-100' :
                  tx.type === 'plan_replenishment' ? 'bg-purple-100' : 'bg-gray-100'
                }`}>
                  <Coins className={`w-4 h-4 ${
                    tx.type === 'deduction' ? 'text-red-600' :
                    tx.type === 'purchase' ? 'text-green-600' :
                    tx.type === 'manual_credit' ? 'text-blue-600' :
                    tx.type === 'plan_replenishment' ? 'text-purple-600' : 'text-gray-500'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {{
                      deduction: 'Dedução (uso IA)',
                      purchase: 'Compra de créditos',
                      manual_credit: 'Crédito manual',
                      refund: 'Reembolso',
                      plan_replenishment: 'Reposição do plano',
                    }[tx.type] || tx.type}
                  </p>
                  <p className="text-xs text-gray-500">
                    {fmtDate(tx.created_at)}
                    {tx.credit_source && ` | Fonte: ${tx.credit_source}`}
                    {tx.description && ` | ${tx.description}`}
                  </p>
                </div>
                <p className={`text-sm font-bold ${
                  tx.type === 'deduction' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {tx.type === 'deduction' ? '-' : '+'}{fmt(Math.abs(parseFloat(tx.amount_brl || 0)))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Ações ─── */
function TabActions({ data, grantOpen, setGrantOpen, grantForm, setGrantForm, grantMutation, blockMutation, unblockMutation }) {
  const tenant = data?.tenant;

  return (
    <div className="space-y-6">
      {/* Grant Credits */}
      <div className="card">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary-600" />
            Conceder Créditos
          </h3>
          <p className="text-sm text-gray-500 mt-1">Adiciona créditos avulsos ao saldo do cliente</p>
        </div>
        <div className="p-5">
          {grantOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                grantMutation.mutate({
                  amount_brl: parseFloat(grantForm.amount),
                  reason: grantForm.reason || undefined,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="input-label">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={grantForm.amount}
                  onChange={(e) => setGrantForm({ ...grantForm, amount: e.target.value })}
                  required
                  className="input-field w-48"
                  placeholder="50.00"
                />
              </div>
              <div>
                <label className="input-label">Motivo (opcional)</label>
                <input
                  type="text"
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                  className="input-field"
                  placeholder="Ex: Cortesia, compensação..."
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={grantMutation.isPending} className="btn-primary">
                  <Gift className="w-4 h-4" />
                  {grantMutation.isPending ? 'Concedendo...' : 'Conceder Créditos'}
                </button>
                <button type="button" onClick={() => setGrantOpen(false)} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setGrantOpen(true)} className="btn-primary">
              <Gift className="w-4 h-4" />
              Conceder Créditos
            </button>
          )}
        </div>
      </div>

      {/* Block/Unblock */}
      <div className="card">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            {tenant?.is_blocked ? <Unlock className="w-5 h-5 text-green-600" /> : <Lock className="w-5 h-5 text-red-600" />}
            {tenant?.is_blocked ? 'Desbloquear Tenant' : 'Bloquear Tenant'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {tenant?.is_blocked
              ? 'O tenant está bloqueado. Desbloqueie para restaurar o acesso.'
              : 'Bloquear impede o tenant de usar o sistema.'}
          </p>
        </div>
        <div className="p-5">
          {tenant?.is_blocked ? (
            <button
              onClick={() => { if (confirm('Desbloquear este tenant?')) unblockMutation.mutate(); }}
              disabled={unblockMutation.isPending}
              className="btn-primary"
            >
              <Unlock className="w-4 h-4" />
              {unblockMutation.isPending ? 'Desbloqueando...' : 'Desbloquear Tenant'}
            </button>
          ) : (
            <button
              onClick={() => { if (confirm('Bloquear este tenant? Ele perderá acesso ao sistema.')) blockMutation.mutate(); }}
              disabled={blockMutation.isPending}
              className="btn-danger"
            >
              <Lock className="w-4 h-4" />
              {blockMutation.isPending ? 'Bloqueando...' : 'Bloquear Tenant'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewCard({ icon: Icon, label, value, gradient, loading }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className={`stat-icon bg-gradient-to-br ${gradient}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          {loading ? (
            <div className="skeleton h-7 w-16 mt-1" />
          ) : (
            <p className="text-xl font-bold text-gray-900">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}
