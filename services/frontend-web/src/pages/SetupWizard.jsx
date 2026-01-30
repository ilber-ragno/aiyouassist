import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Smartphone,
  Bot,
  PartyPopper,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Circle,
  Loader2,
  Save,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import useSetupStatus from '../hooks/useSetupStatus';

const STEPS = [
  { key: 'company', label: 'Dados da Empresa', icon: Building2 },
  { key: 'whatsapp', label: 'Conectar WhatsApp', icon: Smartphone },
  { key: 'agent', label: 'Configurar Agente IA', icon: Bot },
  { key: 'test', label: 'Tudo Pronto', icon: PartyPopper },
];

// ──────────── Step 1: Company ────────────
function StepCompany({ onNext }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings').then(r => {
      setName(r.data.company?.name || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!name.trim() || name.trim().length < 3) {
      toast.error('Digite um nome válido para a empresa');
      return;
    }
    setSaving(true);
    try {
      await api.put('/settings/company', { name: name.trim() });
      toast.success('Dados salvos!');
      onNext();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Dados da Empresa</h2>
        <p className="text-gray-500">Informe o nome da sua empresa. Ele será exibido para seus clientes no WhatsApp.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Empresa</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input w-full max-w-md"
          placeholder="Ex: Minha Empresa Ltda"
        />
      </div>

      <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar e Continuar
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ──────────── Step 2: WhatsApp ────────────
function StepWhatsApp({ onNext }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeQr, setActiveQr] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [connected, setConnected] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get('/whatsapp/sessions');
      const list = res.data.sessions || res.data || [];
      setSessions(list);
      const hasConnected = list.some(s => s.status === 'connected');
      setConnected(hasConnected);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Poll QR status
  useEffect(() => {
    if (!activeQr) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/whatsapp/sessions/${activeQr}/status`);
        if (res.data.status === 'connected') {
          toast.success('WhatsApp conectado com sucesso!');
          setConnected(true);
          setActiveQr(null);
          setQrData(null);
          fetchSessions();
        } else if (res.data.qr_code) {
          setQrData(res.data.qr_code);
        }
      } catch { /* ignore */ }
    }, 2500);
    return () => clearInterval(interval);
  }, [activeQr, fetchSessions]);

  const createAndConnect = async () => {
    setCreating(true);
    try {
      const createRes = await api.post('/whatsapp/sessions', { session_name: 'Principal' });
      const session = createRes.data.session || createRes.data;
      const id = session.id;
      const connectRes = await api.post(`/whatsapp/sessions/${id}/connect`);
      setActiveQr(id);
      if (connectRes.data.session?.qr_code) {
        setQrData(connectRes.data.session.qr_code);
      }
      toast.success('QR Code gerado! Escaneie com seu WhatsApp.');
      fetchSessions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erro ao criar sessão');
    } finally {
      setCreating(false);
    }
  };

  const connectExisting = async (id) => {
    try {
      const res = await api.post(`/whatsapp/sessions/${id}/connect`);
      setActiveQr(id);
      if (res.data.session?.qr_code) {
        setQrData(res.data.session.qr_code);
      }
      toast.success('QR Code gerado! Escaneie com seu WhatsApp.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erro ao conectar');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Conectar WhatsApp</h2>
        <p className="text-gray-500">Conecte seu número de WhatsApp para que o agente IA possa responder seus clientes.</p>
      </div>

      {connected && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">WhatsApp conectado!</span>
        </div>
      )}

      {/* QR Code display */}
      {activeQr && (
        <div className="flex flex-col items-center gap-4 p-6 bg-white border-2 border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2 text-emerald-600 font-medium">
            <QrCode className="w-5 h-5" />
            Escaneie o QR Code com seu WhatsApp
          </div>
          {qrData ? (
            <QRCodeSVG value={qrData} size={240} />
          ) : (
            <div className="w-60 h-60 flex items-center justify-center bg-gray-50 rounded-lg">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          )}
          <p className="text-sm text-gray-500 text-center max-w-sm">
            Abra o WhatsApp no celular → Mais opções (⋮) → Dispositivos conectados → Conectar um dispositivo
          </p>
        </div>
      )}

      {/* Actions */}
      {!connected && !activeQr && (
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <button onClick={createAndConnect} disabled={creating} className="btn-primary inline-flex items-center gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              Conectar WhatsApp
            </button>
          ) : (
            sessions.filter(s => s.status !== 'connected').map(s => (
              <button
                key={s.id}
                onClick={() => connectExisting(s.id)}
                className="btn-primary inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reconectar "{s.session_name}"
              </button>
            ))
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        {connected ? (
          <button onClick={onNext} className="btn-primary inline-flex items-center gap-2">
            Próximo
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={onNext} className="text-sm text-gray-400 hover:text-gray-600 underline">
            Pular por enquanto
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────── Step 3: Agent ────────────
function StepAgent({ onNext }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    persona: '',
    tone: 'professional',
    language: 'pt-BR',
  });

  useEffect(() => {
    api.get('/agent-settings').then(r => {
      const agent = r.data.agent || {};
      setForm({
        persona: agent.persona || '',
        tone: agent.tone || 'professional',
        language: agent.language || 'pt-BR',
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!form.persona.trim()) {
      toast.error('Descreva como o agente deve se comportar');
      return;
    }
    setSaving(true);
    try {
      await api.put('/agent-settings', form);
      toast.success('Agente configurado!');
      onNext();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Configurar Agente IA</h2>
        <p className="text-gray-500">Defina a personalidade e o comportamento do seu assistente virtual.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Persona do Agente
        </label>
        <textarea
          value={form.persona}
          onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
          className="input w-full h-32 resize-y"
          placeholder="Ex: Você é um assistente da Loja XYZ. Responda de forma educada e ajude os clientes com dúvidas sobre produtos, preços e entregas."
        />
        <p className="text-xs text-gray-400 mt-1">Descreva como o agente deve se comportar ao conversar com seus clientes.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tom de Voz</label>
          <select
            value={form.tone}
            onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}
            className="input w-full"
          >
            <option value="professional">Profissional</option>
            <option value="friendly">Amigável</option>
            <option value="casual">Casual</option>
            <option value="formal">Formal</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
          <select
            value={form.language}
            onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
            className="input w-full"
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar e Continuar
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ──────────── Step 4: Complete ────────────
function StepComplete() {
  const navigate = useNavigate();
  const { data, refetch } = useSetupStatus();

  useEffect(() => {
    refetch();
  }, [refetch]);

  const allDone = data?.all_complete;
  const steps = data?.steps || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          {allDone ? 'Tudo Pronto!' : 'Quase lá...'}
        </h2>
        <p className="text-gray-500">
          {allDone
            ? 'Seu AiYou Assist está configurado e pronto para uso!'
            : 'Algumas etapas ainda precisam ser concluídas.'}
        </p>
      </div>

      <div className="space-y-3">
        {Object.entries(steps).map(([key, step]) => (
          <div
            key={key}
            className={`flex items-center gap-3 p-4 rounded-xl border ${
              step.complete
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {step.complete ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <Circle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="font-medium">{step.label}</span>
          </div>
        ))}
      </div>

      {allDone ? (
        <button
          onClick={() => navigate('/')}
          className="btn-primary inline-flex items-center gap-2 text-lg px-6 py-3"
        >
          <PartyPopper className="w-5 h-5" />
          Ir para o Painel
        </button>
      ) : (
        <p className="text-sm text-gray-500">
          Volte para as etapas anteriores para concluir a configuração.
        </p>
      )}
    </div>
  );
}

// ──────────── Main Wizard ────────────
export default function SetupWizard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const stepParam = parseInt(searchParams.get('step') || '1', 10);
  const [currentStep, setCurrentStep] = useState(Math.max(1, Math.min(4, stepParam)) - 1);

  const goTo = (idx) => {
    setCurrentStep(idx);
    setSearchParams({ step: idx + 1 });
  };

  const onNext = () => {
    queryClient.invalidateQueries({ queryKey: ['setup-status'] });
    if (currentStep < STEPS.length - 1) {
      goTo(currentStep + 1);
    }
  };

  const onBack = () => {
    if (currentStep > 0) goTo(currentStep - 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuração Inicial</h1>
          <p className="page-subtitle">Siga os passos para começar a usar o sistema</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="card p-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStep;
            const isPast = idx < currentStep;
            const Icon = step.icon;
            return (
              <button
                key={step.key}
                onClick={() => goTo(idx)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-700'
                    : isPast
                    ? 'text-emerald-600 hover:bg-emerald-50'
                    : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive
                    ? 'bg-emerald-500 text-white'
                    : isPast
                    ? 'bg-emerald-200 text-emerald-700'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {isPast ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                </div>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="card p-6">
        {currentStep === 0 && <StepCompany onNext={onNext} />}
        {currentStep === 1 && <StepWhatsApp onNext={onNext} />}
        {currentStep === 2 && <StepAgent onNext={onNext} />}
        {currentStep === 3 && <StepComplete />}
      </div>

      {/* Back button */}
      {currentStep > 0 && currentStep < 3 && (
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
      )}
    </div>
  );
}
