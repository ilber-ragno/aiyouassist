import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, TrendingDown, TrendingUp, Package, Clock, AlertTriangle, CreditCard, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';

function formatBrl(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function TransactionTypeBadge({ type }) {
  const styles = {
    purchase: 'bg-green-100 text-green-700',
    deduction: 'bg-red-100 text-red-700',
    manual_credit: 'bg-blue-100 text-blue-700',
    refund: 'bg-yellow-100 text-yellow-700',
  };
  const labels = {
    purchase: 'Compra',
    deduction: 'Uso IA',
    manual_credit: 'Crédito Manual',
    refund: 'Reembolso',
    plan_replenishment: 'Reposição Plano',
  };
  return (
    <span className={`badge ${styles[type] || 'bg-gray-100 text-gray-700'}`}>
      {labels[type] || type}
    </span>
  );
}

export default function Credits() {
  const queryClient = useQueryClient();
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [billingType, setBillingType] = useState('PIX');
  const [txPage, setTxPage] = useState(1);

  const { data: balance, isLoading: loadingBalance } = useQuery({
    queryKey: ['credits-balance'],
    queryFn: () => api.get('/credits/balance').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: packages } = useQuery({
    queryKey: ['credits-packages'],
    queryFn: () => api.get('/credits/packages').then(r => r.data),
  });

  const { data: transactions, isLoading: loadingTx } = useQuery({
    queryKey: ['credits-transactions', txPage],
    queryFn: () => api.get(`/credits/transactions?page=${txPage}`).then(r => r.data),
  });

  const purchaseMutation = useMutation({
    mutationFn: (packageId) => api.post(`/credits/purchase/${packageId}`, { billing_type: billingType }),
    onSuccess: (res) => {
      const payment = res.data.payment;
      queryClient.invalidateQueries({ queryKey: ['credits-balance'] });
      queryClient.invalidateQueries({ queryKey: ['credits-transactions'] });
      setSelectedPackage(null);

      if (payment?.invoice_url) {
        toast.success('Pagamento criado! Redirecionando...');
        window.open(payment.invoice_url, '_blank');
      } else if (payment?.pix_payload) {
        toast.success('PIX gerado! Copie o código para pagar.');
        navigator.clipboard.writeText(payment.pix_payload).catch(() => {});
      } else {
        toast.success('Pagamento criado com sucesso!');
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Erro ao criar pagamento');
    },
  });

  const totalPages = transactions?.last_page || 1;
  const currentPage = transactions?.current_page || 1;

  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pageNumbers.push(i);
    } else if (pageNumbers[pageNumbers.length - 1] !== '...') {
      pageNumbers.push('...');
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Coins className="w-6 h-6" />
            Créditos
          </h1>
          <p className="page-subtitle">Gerencie seus créditos para uso de IA</p>
        </div>
      </div>

      {/* Renewal Banner */}
      {balance?.needs_addon_purchase && (
        <div className="card bg-red-50 border border-red-200 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-800">Seus créditos acabaram!</p>
              <p className="text-sm text-red-700 mt-1">
                Os créditos do seu plano e avulsos foram esgotados. Adquira um pacote de créditos abaixo para continuar usando a IA.
              </p>
              {balance?.plan_resets_at && (
                <p className="text-xs text-red-600 mt-2">
                  Seus créditos do plano serão repostos em {new Date(balance.plan_resets_at).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {balance?.plan_credits_exhausted && !balance?.needs_addon_purchase && (
        <div className="card bg-amber-50 border border-amber-200 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-800">Créditos do plano esgotados</p>
              <p className="text-sm text-amber-700 mt-1">
                Você está usando créditos avulsos. Adquira mais créditos ou aguarde a renovação do plano.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balance Cards */}
      {loadingBalance ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center gap-4">
                <div className="skeleton w-12 h-12 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <div className="skeleton h-3 w-20 rounded" />
                  <div className="skeleton h-7 w-28 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-hover p-5">
              <div className="flex items-center gap-4">
                <div className={`stat-icon bg-gradient-to-br ${balance?.low_balance ? 'from-red-500 to-red-700' : 'from-green-500 to-green-700'} shadow-sm`}>
                  <Coins className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Saldo Total</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">
                    {formatBrl(balance?.balance_brl)}
                  </p>
                  {balance?.low_balance && (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3" /> Saldo baixo
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="card-hover p-5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Créditos do Plano</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">
                  {formatBrl(balance?.plan_balance_brl)}
                </p>
                {balance?.plan_included_brl > 0 && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((balance?.plan_balance_brl || 0) / balance.plan_included_brl) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatBrl(balance?.plan_balance_brl)} / {formatBrl(balance?.plan_included_brl)}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="card-hover p-5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Créditos Avulsos</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">
                  {formatBrl(balance?.addon_balance_brl)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Comprados separadamente</p>
              </div>
            </div>

            <div className="card-hover p-5">
              <div className="flex items-center gap-4">
                <div className="stat-icon bg-gradient-to-br from-orange-500 to-orange-700 shadow-sm">
                  <TrendingDown className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Consumido</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">
                    {formatBrl(balance?.total_consumed_brl)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Packages */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Pacotes de Créditos
          </h2>
          <p className="text-sm text-gray-500 mt-1">Adquira créditos para usar o assistente de IA</p>
        </div>
        <div className="p-5">
          {packages?.packages?.length === 0 && (
            <div className="empty-state">
              <Package className="empty-state-icon" />
              <p className="empty-state-title">Nenhum pacote disponível</p>
              <p className="empty-state-text">Não há pacotes de créditos disponíveis no momento.</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages?.packages?.map((pkg) => (
              <div
                key={pkg.id}
                className={`card-hover p-5 cursor-pointer border-2 ${
                  selectedPackage?.id === pkg.id
                    ? 'ring-2 ring-primary-500 border-primary-500 bg-primary-50/50'
                    : 'border-transparent'
                }`}
                onClick={() => setSelectedPackage(pkg)}
              >
                <h3 className="font-semibold text-gray-900">{pkg.name}</h3>
                {pkg.description && (
                  <p className="text-sm text-gray-500 mt-1">{pkg.description}</p>
                )}
                <div className="mt-3">
                  <p className="text-2xl font-bold text-primary-600">{formatBrl(pkg.price_brl)}</p>
                  <p className="text-sm text-gray-500">
                    Receba {formatBrl(pkg.credit_amount_brl)} em créditos
                  </p>
                </div>
              </div>
            ))}
          </div>

          {selectedPackage && (
            <div className="mt-6 p-5 card bg-gray-50/50">
              <h3 className="font-medium text-gray-900 mb-3">
                Comprar: {selectedPackage.name} — {formatBrl(selectedPackage.price_brl)}
              </h3>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <label className="input-label mb-0">Forma de pagamento:</label>
                <div className="flex gap-2">
                  {['PIX', 'BOLETO', 'CREDIT_CARD'].map((bt) => (
                    <button
                      key={bt}
                      onClick={() => setBillingType(bt)}
                      className={`px-4 py-1.5 text-sm rounded-full font-medium transition-all ${
                        billingType === bt
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {bt === 'CREDIT_CARD' ? 'Cartão' : bt}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => purchaseMutation.mutate(selectedPackage.id)}
                disabled={purchaseMutation.isPending}
                className="btn-primary"
              >
                <CreditCard className="w-4 h-4" />
                {purchaseMutation.isPending ? 'Processando...' : 'Comprar Agora'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Histórico de Transações
          </h2>
        </div>

        {loadingTx ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton h-6 w-20 rounded-full" />
                <div className="skeleton h-4 w-48 rounded flex-1" />
                <div className="skeleton h-4 w-20 rounded" />
                <div className="skeleton h-4 w-20 rounded" />
                <div className="skeleton h-4 w-28 rounded" />
              </div>
            ))}
          </div>
        ) : (transactions?.data || []).length === 0 ? (
          <div className="empty-state">
            <Clock className="empty-state-icon" />
            <p className="empty-state-title">Nenhuma transação encontrada</p>
            <p className="empty-state-text">Suas transações de créditos aparecerão aqui.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Após</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(transactions?.data || []).map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <TransactionTypeBadge type={tx.type} />
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-900">{tx.description}</td>
                      <td className={`px-5 py-3 text-sm text-right font-medium ${
                        parseFloat(tx.amount_brl) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {parseFloat(tx.amount_brl) >= 0 ? '+' : ''}{formatBrl(tx.amount_brl)}
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-gray-500">
                        {formatBrl(tx.balance_after_brl)}
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-gray-500 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden divide-y divide-gray-100">
              {(transactions?.data || []).map((tx) => (
                <div key={tx.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <TransactionTypeBadge type={tx.type} />
                    <span className={`text-sm font-medium ${
                      parseFloat(tx.amount_brl) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {parseFloat(tx.amount_brl) >= 0 ? '+' : ''}{formatBrl(tx.amount_brl)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900">{tx.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Saldo: {formatBrl(tx.balance_after_brl)}</span>
                    <span>{new Date(tx.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-sm text-gray-500">
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTxPage(p => Math.max(1, p - 1))}
                disabled={txPage <= 1}
                className="btn-secondary btn-sm"
              >
                Anterior
              </button>
              {pageNumbers.map((page, idx) =>
                page === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-sm text-gray-400">...</span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setTxPage(page)}
                    className={`btn-sm rounded-lg min-w-[2rem] text-center ${
                      page === currentPage
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                )
              )}
              <button
                onClick={() => setTxPage(p => Math.min(totalPages, p + 1))}
                disabled={txPage >= totalPages}
                className="btn-secondary btn-sm"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
