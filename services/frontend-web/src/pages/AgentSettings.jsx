import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  Bot,
  Save,
  Loader2,
  Clock,
  ShieldAlert,
  MessageSquare,
  Sliders,
  Send,
  X,
  Plus,
  Users,
  UserCheck,
  Globe,
} from 'lucide-react';

const TONE_OPTIONS = [
  { value: 'professional', label: 'Profissional' },
  { value: 'friendly', label: 'Amigável' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
];

const LANGUAGE_OPTIONS = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

const DAYS = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

export default function AgentSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    persona: '',
    tone: 'professional',
    language: 'pt-BR',
    response_mode: 'all',
    whitelisted_phones: [],
    operating_hours: {},
    forbidden_topics: [],
    escalation_rules: { keywords: [], min_confidence: 0.5 },
    max_response_tokens: 1024,
    confidence_threshold: 0.7,
    is_active: true,
  });

  // Test prompt state
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState(null);
  const [testing, setTesting] = useState(false);

  // Temp inputs for tag fields
  const [newForbidden, setNewForbidden] = useState('');
  const [newEscalation, setNewEscalation] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/agent-settings');
      const agent = res.data.agent;
      setForm({
        persona: agent.persona || '',
        tone: agent.tone || 'professional',
        language: agent.language || 'pt-BR',
        response_mode: agent.response_mode || 'all',
        whitelisted_phones: agent.whitelisted_phones || [],
        operating_hours: agent.operating_hours || {},
        forbidden_topics: agent.forbidden_topics || [],
        escalation_rules: agent.escalation_rules || { keywords: [], min_confidence: 0.5 },
        max_response_tokens: agent.max_response_tokens || 1024,
        confidence_threshold: parseFloat(agent.confidence_threshold) || 0.7,
        is_active: agent.is_active ?? true,
      });
    } catch {
      setError('Erro ao carregar configurações do agente');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.put('/agent-settings', form);
      setSuccess('Configurações salvas com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResponse(null);
    try {
      const res = await api.post('/agent-settings/test-prompt', { message: testMessage });
      setTestResponse(res.data);
    } catch (err) {
      setTestResponse({ error: err.response?.data?.error || 'Erro ao testar' });
    } finally {
      setTesting(false);
    }
  };

  const addTag = (field, value, setter) => {
    if (!value.trim()) return;
    if (field === 'forbidden_topics') {
      setForm(f => ({ ...f, forbidden_topics: [...f.forbidden_topics, value.trim()] }));
    } else if (field === 'escalation_keywords') {
      setForm(f => ({
        ...f,
        escalation_rules: {
          ...f.escalation_rules,
          keywords: [...(f.escalation_rules.keywords || []), value.trim()],
        },
      }));
    } else if (field === 'whitelisted_phones') {
      setForm(f => ({ ...f, whitelisted_phones: [...f.whitelisted_phones, value.trim()] }));
    }
    setter('');
  };

  const removeTag = (field, index) => {
    if (field === 'forbidden_topics') {
      setForm(f => ({ ...f, forbidden_topics: f.forbidden_topics.filter((_, i) => i !== index) }));
    } else if (field === 'escalation_keywords') {
      setForm(f => ({
        ...f,
        escalation_rules: {
          ...f.escalation_rules,
          keywords: (f.escalation_rules.keywords || []).filter((_, i) => i !== index),
        },
      }));
    } else if (field === 'whitelisted_phones') {
      setForm(f => ({ ...f, whitelisted_phones: f.whitelisted_phones.filter((_, i) => i !== index) }));
    }
  };

  // Operating hours helpers
  const hoursEnabled = Object.keys(form.operating_hours).length > 0 && form.operating_hours.schedule;
  const toggleHours = (enabled) => {
    if (enabled) {
      const defaultSchedule = {};
      DAYS.forEach(d => { defaultSchedule[d.key] = { enabled: true, start: '08:00', end: '18:00' }; });
      setForm(f => ({ ...f, operating_hours: { timezone: 'America/Sao_Paulo', schedule: defaultSchedule } }));
    } else {
      setForm(f => ({ ...f, operating_hours: {} }));
    }
  };

  const updateDaySchedule = (day, field, value) => {
    setForm(f => ({
      ...f,
      operating_hours: {
        ...f.operating_hours,
        schedule: {
          ...(f.operating_hours.schedule || {}),
          [day]: { ...(f.operating_hours.schedule?.[day] || {}), [field]: value },
        },
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Agente IA</h1>
          <p className="page-subtitle">Configure como seu assistente virtual se comporta</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className={form.is_active ? 'text-green-700 font-medium' : 'text-gray-500'}>
              {form.is_active ? 'Ativo' : 'Inativo'}
            </span>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.is_active ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                form.is_active ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </label>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex justify-between">
          {error}
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700">{success}</div>
      )}

      {/* Card 1: Persona & Prompt */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <MessageSquare className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold">Persona & Prompt</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Defina a personalidade e instruções do seu assistente virtual. Este texto será usado como "system prompt".
        </p>
        <textarea
          value={form.persona}
          onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
          placeholder="Você é um assistente de atendimento da empresa XYZ. Seja educado e prestativo. Ajude os clientes com dúvidas sobre produtos, pedidos e suporte técnico. Se não souber a resposta, encaminhe para um atendente humano."
          className="input-field min-h-[160px] resize-y"
          maxLength={2000}
        />
        <div className="flex justify-end mt-1">
          <span className={`text-xs ${form.persona.length > 1800 ? 'text-amber-600' : 'text-gray-400'}`}>
            {form.persona.length} / 2000
          </span>
        </div>
      </div>

      {/* Card 2: Comportamento */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sliders className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Comportamento</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="input-label">Tom</label>
            <select
              value={form.tone}
              onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}
              className="input-field"
            >
              {TONE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Idioma</label>
            <select
              value={form.language}
              onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
              className="input-field"
            >
              {LANGUAGE_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">
              Max Tokens de Resposta: {form.max_response_tokens}
            </label>
            <input
              type="range"
              min="256"
              max="4096"
              step="128"
              value={form.max_response_tokens}
              onChange={e => setForm(f => ({ ...f, max_response_tokens: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>256 (curta)</span>
              <span>4096 (longa)</span>
            </div>
          </div>
          <div>
            <label className="input-label">
              Nível de Confiança: {form.confidence_threshold}
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={form.confidence_threshold}
              onChange={e => setForm(f => ({ ...f, confidence_threshold: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>0.1 (flexível)</span>
              <span>1.0 (rigoroso)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Modo de Atendimento */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold">Modo de Atendimento</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Defina para quem a IA deve responder no WhatsApp.</p>
        <div className="space-y-3">
          {[
            { value: 'all', icon: Globe, label: 'Atender todos', desc: 'Responde a qualquer contato que enviar mensagem' },
            { value: 'owner_only', icon: UserCheck, label: 'Apenas meu número', desc: 'Responde apenas ao dono do número WhatsApp conectado' },
            { value: 'whitelist', icon: Users, label: 'Lista de números', desc: 'Responde apenas a números cadastrados na lista abaixo' },
          ].map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                form.response_mode === opt.value
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="response_mode"
                value={opt.value}
                checked={form.response_mode === opt.value}
                onChange={e => setForm(f => ({ ...f, response_mode: e.target.value }))}
                className="mt-1"
              />
              <opt.icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                form.response_mode === opt.value ? 'text-indigo-600' : 'text-gray-400'
              }`} />
              <div>
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {form.response_mode === 'whitelist' && (
          <div className="mt-4 pt-4 border-t">
            <label className="input-label">Números autorizados</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('whitelisted_phones', newPhone, setNewPhone))}
                placeholder="Ex: 5561999998888"
                className="input-field flex-1"
              />
              <button
                type="button"
                onClick={() => addTag('whitelisted_phones', newPhone, setNewPhone)}
                className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm hover:bg-indigo-200"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.whitelisted_phones.map((phone, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 text-sm rounded-full">
                  {phone}
                  <button onClick={() => removeTag('whitelisted_phones', i)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Card 4: Horário de Funcionamento */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold">Horário de Funcionamento</h2>
          </div>
          <button
            type="button"
            onClick={() => toggleHours(!hoursEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              hoursEnabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              hoursEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {!hoursEnabled ? (
          <p className="text-sm text-gray-500">A IA responde 24 horas por dia. Ative para definir horários.</p>
        ) : (
          <div className="space-y-2">
            <div className="mb-3">
              <label className="input-label">Fuso horário</label>
              <select
                value={form.operating_hours.timezone || 'America/Sao_Paulo'}
                onChange={e => setForm(f => ({ ...f, operating_hours: { ...f.operating_hours, timezone: e.target.value } }))}
                className="input-field max-w-xs"
              >
                <option value="America/Sao_Paulo">Brasília (UTC-3)</option>
                <option value="America/Manaus">Manaus (UTC-4)</option>
                <option value="America/Belem">Belém (UTC-3)</option>
                <option value="America/New_York">New York (UTC-5)</option>
                <option value="Europe/Lisbon">Lisboa (UTC+0)</option>
              </select>
            </div>
            {DAYS.map(d => {
              const dayConf = form.operating_hours.schedule?.[d.key] || { enabled: true, start: '08:00', end: '18:00' };
              return (
                <div key={d.key} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-28">
                    <input
                      type="checkbox"
                      checked={dayConf.enabled}
                      onChange={e => updateDaySchedule(d.key, 'enabled', e.target.checked)}
                      className="rounded text-green-600"
                    />
                    <span className="text-sm text-gray-700">{d.label}</span>
                  </label>
                  {dayConf.enabled && (
                    <>
                      <input
                        type="time"
                        value={dayConf.start}
                        onChange={e => updateDaySchedule(d.key, 'start', e.target.value)}
                        className="input-field w-auto"
                      />
                      <span className="text-gray-400">até</span>
                      <input
                        type="time"
                        value={dayConf.end}
                        onChange={e => updateDaySchedule(d.key, 'end', e.target.value)}
                        className="input-field w-auto"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Card 5: Regras Avançadas */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold">Regras Avançadas</h2>
        </div>

        <div className="space-y-6">
          {/* Forbidden Topics */}
          <div>
            <label className="input-label">
              Tópicos Proibidos
            </label>
            <p className="text-xs text-gray-500 mb-2">A IA se recusará a discutir esses assuntos.</p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newForbidden}
                onChange={e => setNewForbidden(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('forbidden_topics', newForbidden, setNewForbidden))}
                placeholder="Ex: política, religião"
                className="input-field flex-1"
              />
              <button
                type="button"
                onClick={() => addTag('forbidden_topics', newForbidden, setNewForbidden)}
                className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm hover:bg-amber-200"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.forbidden_topics.map((topic, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 text-sm rounded-full">
                  {topic}
                  <button onClick={() => removeTag('forbidden_topics', i)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Escalation Keywords */}
          <div>
            <label className="input-label">
              Palavras de Escalonamento
            </label>
            <p className="text-xs text-gray-500 mb-2">Se o cliente usar essas palavras, a conversa será transferida para um humano.</p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newEscalation}
                onChange={e => setNewEscalation(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('escalation_keywords', newEscalation, setNewEscalation))}
                placeholder="Ex: falar com humano, reclamação"
                className="input-field flex-1"
              />
              <button
                type="button"
                onClick={() => addTag('escalation_keywords', newEscalation, setNewEscalation)}
                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(form.escalation_rules.keywords || []).map((kw, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full">
                  {kw}
                  <button onClick={() => removeTag('escalation_keywords', i)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Min confidence for escalation */}
          <div>
            <label className="input-label">
              Confiança mínima para escalonar: {form.escalation_rules.min_confidence || 0.5}
            </label>
            <p className="text-xs text-gray-500 mb-2">Abaixo deste nível, a conversa será encaminhada para humano.</p>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.1"
              value={form.escalation_rules.min_confidence || 0.5}
              onChange={e => setForm(f => ({
                ...f,
                escalation_rules: { ...f.escalation_rules, min_confidence: parseFloat(e.target.value) },
              }))}
              className="w-full max-w-xs"
            />
          </div>
        </div>
      </div>

      {/* Card 6: Testar */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bot className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Testar Agente</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Envie uma mensagem de teste para ver como seu agente responde. Salve as configurações antes de testar.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTest()}
            placeholder="Ex: Qual o horário de funcionamento?"
            className="input-field flex-1"
          />
          <button
            onClick={handleTest}
            disabled={testing || !testMessage.trim()}
            className="btn-primary flex items-center gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Testar
          </button>
        </div>

        {testResponse && (
          <div className={`mt-4 p-4 rounded-lg ${testResponse.error ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
            {testResponse.error ? (
              <p className="text-sm text-red-700">{testResponse.error}</p>
            ) : (
              <>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{testResponse.response}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                  {testResponse.model_used && <span>Modelo: {testResponse.model_used}</span>}
                  {testResponse.tokens?.input && <span>Tokens: {testResponse.tokens.input} in / {testResponse.tokens.output} out</span>}
                  {testResponse.cost_usd != null && <span>Custo: ${Number(testResponse.cost_usd).toFixed(4)}</span>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
