import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, QrCode, FileText, CheckCircle, Loader2, ArrowRight, ArrowLeft, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function Checkout() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: plano, 2: pagamento, 3: confirmação
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [billingType, setBillingType] = useState('PIX');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [paymentResult, setPaymentResult] = useState(null);

  const { data: plansData, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then(r => r.data),
  });

  const createSubscription = useMutation({
    mutationFn: (data) => api.post('/subscription/create', data).then(r => r.data),
    onSuccess: (data) => {
      setPaymentResult(data);
      setStep(3);
      if (data.redirect_url) {
        window.open(data.redirect_url, '_blank');
      }
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao criar assinatura'),
  });

  const plans = Array.isArray(plansData) ? plansData : plansData?.plans || [];

  const handleCreateSubscription = () => {
    if (!selectedPlan) return;
    createSubscription.mutate({
      plan_id: selectedPlan.id,
      billing_type: billingType,
      cpf_cnpj: cpfCnpj || undefined,
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <div className="skeleton h-8 w-64 mb-2" />
          <div className="skeleton h-5 w-96" />
        </div>
        <div className="skeleton h-10 w-80 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-6 space-y-4">
              <div className="skeleton h-6 w-24" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-10 w-32" />
              <div className="space-y-2">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-5/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">Escolha seu plano</h1>
        <p className="page-subtitle">Selecione o plano ideal e a forma de pagamento para começar a usar o AiYou Assist.</p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 sm:gap-4 mb-8 overflow-x-auto">
        {[
          { n: 1, label: 'Plano' },
          { n: 2, label: 'Pagamento' },
          { n: 3, label: 'Confirmação' },
        ].map(({ n, label }) => (
          <div key={n} className="flex items-center gap-2 flex-shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              step >= n ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {step > n ? <CheckCircle className="w-4 h-4" /> : n}
            </div>
            <span className={`text-sm font-medium ${step >= n ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
            {n < 3 && <div className={`w-8 sm:w-12 h-0.5 ${step > n ? 'bg-primary-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Plano */}
      {step === 1 && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.filter(p => p.is_active).map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`card card-hover p-6 cursor-pointer transition-all border-2 ${
                    isSelected
                      ? 'border-primary-600 shadow-lg ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-primary-300 hover:shadow-md'
                  }`}
                >
                  <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                  <div className="mb-4">
                    <span className="text-3xl font-extrabold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
                      R$ {parseFloat(plan.price_monthly).toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-gray-500 text-sm ml-1">/mês</span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-600">
                    {plan.limits?.map(l => (
                      <li key={l.limit_key} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        {l.limit_value === -1 ? 'Ilimitado' : l.limit_value} {l.description}
                      </li>
                    ))}
                  </ul>
                  {isSelected && (
                    <div className="mt-4 text-center">
                      <span className="text-primary-600 font-semibold text-sm">Selecionado</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-8 flex justify-between">
            <button
              onClick={() => navigate('/')}
              className="btn-ghost"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao painel
            </button>
            <button
              onClick={() => selectedPlan && setStep(2)}
              disabled={!selectedPlan}
              className="btn-primary px-6 py-3 text-base"
            >
              Continuar
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Pagamento */}
      {step === 2 && selectedPlan && (
        <div className="max-w-lg mx-auto">
          <div className="card p-6 mb-6">
            <h3 className="font-semibold mb-1">Plano selecionado: {selectedPlan.name}</h3>
            <p className="text-2xl font-extrabold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
              R$ {parseFloat(selectedPlan.price_monthly).toFixed(2).replace('.', ',')}<span className="text-sm font-normal text-gray-500">/mês</span>
            </p>
          </div>

          <div className="card p-6 space-y-6">
            <div>
              <label className="input-label mb-3">Como você quer pagar?</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'PIX', label: 'PIX', icon: QrCode, desc: 'Pague na hora' },
                  { value: 'BOLETO', label: 'Boleto', icon: FileText, desc: '3 dias úteis' },
                  { value: 'CREDIT_CARD', label: 'Cartão', icon: CreditCard, desc: 'Aprovação imediata' },
                ].map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    onClick={() => setBillingType(value)}
                    className={`card p-4 text-center transition-all border-2 ${
                      billingType === value
                        ? 'border-primary-600 bg-primary-50 shadow-sm'
                        : 'border-gray-200 hover:border-primary-300'
                    }`}
                  >
                    <Icon className={`w-6 h-6 mx-auto mb-2 ${billingType === value ? 'text-primary-600' : 'text-gray-400'}`} />
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="input-label">CPF ou CNPJ</label>
              <input
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                className="input-field"
              />
              <p className="text-xs text-gray-500 mt-1">Necessário para emissão da cobrança</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="btn-secondary"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
              <button
                onClick={handleCreateSubscription}
                disabled={createSubscription.isPending || !cpfCnpj}
                className="btn-primary flex-1 py-3 text-base"
              >
                {createSubscription.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
                ) : (
                  <>Assinar Agora <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Confirmação */}
      {step === 3 && paymentResult && (
        <div className="max-w-lg mx-auto">
          <div className="card p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Assinatura criada!</h2>
            <p className="text-gray-500 mb-6">{paymentResult.message || 'Sua assinatura foi criada com sucesso.'}</p>

            {/* PIX */}
            {paymentResult.pix?.payload && (
              <div className="card p-6 mb-6 text-left">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-primary-600" />
                  Pague via PIX
                </h3>
                <p className="text-sm text-gray-500 mb-3">Copie o código abaixo e cole no app do seu banco:</p>
                <div className="bg-white border rounded-lg p-3 mb-3">
                  <p className="text-xs font-mono break-all text-gray-700">{paymentResult.pix.payload}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(paymentResult.pix.payload)}
                  className="btn-primary w-full justify-center"
                >
                  <Copy className="w-4 h-4" />
                  Copiar Código PIX
                </button>
                {paymentResult.pix.expiration_date && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Válido até: {new Date(paymentResult.pix.expiration_date).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            )}

            {/* Boleto */}
            {paymentResult.invoice_url && !paymentResult.pix?.payload && (
              <div className="mb-6">
                <a
                  href={paymentResult.invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary w-full justify-center py-3 text-base"
                >
                  <FileText className="w-5 h-5" />
                  Abrir Boleto
                </a>
              </div>
            )}

            {/* Stripe redirect */}
            {paymentResult.redirect_url && (
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-3">Você será redirecionado para o pagamento.</p>
                <a
                  href={paymentResult.redirect_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary w-full justify-center py-3 text-base"
                >
                  <CreditCard className="w-5 h-5" />
                  Ir para Pagamento
                </a>
              </div>
            )}

            <button
              onClick={() => navigate('/')}
              className="text-primary-600 font-medium hover:underline"
            >
              Ir para o Painel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
