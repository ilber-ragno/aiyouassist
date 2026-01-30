import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import {
  Globe, Copy, CheckCircle2, Power, PowerOff, Trash2,
  Loader2, Plus, Eye, Palette, MessageSquare, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function WebchatConfig() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: 'Webchat',
    primary_color: '#6366f1',
    welcome_message: 'Olá! Como posso ajudar?',
    bot_name: 'Assistente IA',
    position: 'right',
    allowed_domains: '',
  });
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['webchat-widget'],
    queryFn: () => api.get('/webchat/widget').then(r => r.data),
  });

  const widget = data?.widget;

  useEffect(() => {
    if (widget) {
      setForm({
        name: widget.name || 'Webchat',
        primary_color: widget.primary_color || '#6366f1',
        welcome_message: widget.welcome_message || 'Olá! Como posso ajudar?',
        bot_name: widget.bot_name || 'Assistente IA',
        position: widget.position || 'right',
        allowed_domains: widget.allowed_domains || '',
      });
    }
  }, [widget]);

  const createMutation = useMutation({
    mutationFn: (config) => api.post('/webchat/widget', config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widget'] });
      toast.success('Widget criado com sucesso');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar widget'),
  });

  const updateMutation = useMutation({
    mutationFn: (config) => api.put(`/webchat/widget/${widget.id}`, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widget'] });
      toast.success('Widget atualizado');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar'),
  });

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/webchat/widget/${widget.id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widget'] });
      toast.success('Widget ativado');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => api.post(`/webchat/widget/${widget.id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widget'] });
      toast.success('Widget desativado');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/webchat/widget/${widget.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widget'] });
      toast.success('Widget removido');
    },
  });

  const handleCreate = () => createMutation.mutate(form);
  const handleUpdate = () => updateMutation.mutate(form);

  const handleCopyEmbed = () => {
    const publicUrl = window.location.origin.replace('app.', 'chat.');
    const code = `<script src="${publicUrl}/widget.js" data-key="${widget.widget_key}" async></script>`;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Código copiado!');
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div className="skeleton h-8 w-48" />
        </div>
        <div className="card p-6 space-y-4">
          <div className="skeleton h-5 w-64" />
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-full" />
        </div>
      </div>
    );
  }

  // No widget yet - show create CTA
  if (!widget) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="stat-icon bg-gradient-to-br from-indigo-500 to-indigo-700">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="page-title">Webchat</h1>
              <p className="page-subtitle">Widget de chat para seu site</p>
            </div>
          </div>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon">
            <MessageSquare className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="empty-state-title">Nenhum widget configurado</h3>
          <p className="empty-state-text">
            Crie um widget de chat para adicionar um assistente IA no seu site.
            Os visitantes podem conversar diretamente com sua IA.
          </p>

          <div className="mt-6 max-w-sm mx-auto space-y-4">
            <div>
              <label className="input-label">Nome do Bot</label>
              <input
                value={form.bot_name}
                onChange={(e) => setForm({ ...form, bot_name: e.target.value })}
                className="input-field"
                placeholder="Assistente IA"
              />
            </div>
            <div>
              <label className="input-label">Cor Primária</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  className="h-10 w-14 rounded-lg border border-gray-300 cursor-pointer"
                />
                <input
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  className="input-field font-mono text-sm"
                  placeholder="#6366f1"
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="btn-primary w-full"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Criar Widget
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Widget exists - show config
  const isActive = widget.is_active;
  const publicUrl = window.location.origin.replace('app.', 'chat.');
  const embedCode = `<script src="${publicUrl}/widget.js" data-key="${widget.widget_key}" async></script>`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-indigo-500 to-indigo-700">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Webchat</h1>
            <p className="page-subtitle">Widget de chat para seu site</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isActive ? (
            <button
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              className="btn-secondary text-amber-600"
            >
              <PowerOff className="w-4 h-4" />
              Desativar
            </button>
          ) : (
            <button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="btn-primary"
            >
              <Power className="w-4 h-4" />
              Ativar
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div className={`card p-4 border ${isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className={`text-sm font-medium ${isActive ? 'text-green-800' : 'text-gray-600'}`}>
            {isActive ? 'Widget ativo e recebendo mensagens' : 'Widget inativo'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config Form */}
        <div className="card p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Palette className="w-5 h-5 text-indigo-500" />
            Personalização
          </h2>

          <div>
            <label className="input-label">Nome do Bot</label>
            <input
              value={form.bot_name}
              onChange={(e) => setForm({ ...form, bot_name: e.target.value })}
              className="input-field"
              placeholder="Assistente IA"
            />
          </div>

          <div>
            <label className="input-label">Mensagem de Boas-Vindas</label>
            <textarea
              value={form.welcome_message}
              onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
              className="input-field"
              rows={3}
              placeholder="Olá! Como posso ajudar?"
            />
          </div>

          <div>
            <label className="input-label">Cor Primária</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                className="h-10 w-14 rounded-lg border border-gray-300 cursor-pointer"
              />
              <input
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                className="input-field font-mono text-sm"
                placeholder="#6366f1"
              />
            </div>
          </div>

          <div>
            <label className="input-label">Posição do Widget</label>
            <div className="flex gap-3">
              {['right', 'left'].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setForm({ ...form, position: pos })}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg border transition-all ${
                    form.position === pos
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {pos === 'right' ? 'Direita' : 'Esquerda'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="input-label">Domínios Permitidos</label>
            <input
              value={form.allowed_domains}
              onChange={(e) => setForm({ ...form, allowed_domains: e.target.value })}
              className="input-field text-sm"
              placeholder="meusite.com, loja.com (vazio = qualquer domínio)"
            />
            <p className="text-xs text-gray-500 mt-1">
              Deixe vazio para permitir qualquer domínio.
            </p>
          </div>

          <button
            onClick={handleUpdate}
            disabled={updateMutation.isPending}
            className="btn-primary w-full"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Salvar Alterações
          </button>
        </div>

        {/* Embed Code + Preview */}
        <div className="space-y-6">
          {/* Embed Code */}
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-500" />
              Código de Integração
            </h2>

            <p className="text-sm text-gray-600">
              Cole este código antes do <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">&lt;/body&gt;</code> do seu site:
            </p>

            <div className="relative">
              <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs font-mono overflow-x-auto">
                {embedCode}
              </pre>
              <button
                onClick={handleCopyEmbed}
                className="absolute top-2 right-2 p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                title="Copiar"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium">Widget Key:</span>
              <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">{widget.widget_key}</code>
            </div>
          </div>

          {/* Preview */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-500" />
                Preview
              </h2>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="btn-secondary btn-sm"
              >
                {showPreview ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>

            {showPreview && (
              <div className="relative bg-gray-100 rounded-xl p-6 min-h-[400px] overflow-hidden">
                {/* Mock website background */}
                <div className="space-y-3">
                  <div className="h-8 bg-white rounded w-3/4" />
                  <div className="h-4 bg-white/60 rounded w-full" />
                  <div className="h-4 bg-white/60 rounded w-5/6" />
                  <div className="h-4 bg-white/60 rounded w-2/3" />
                  <div className="h-32 bg-white/40 rounded-lg mt-4" />
                </div>

                {/* Widget bubble */}
                <div
                  className="absolute bottom-4"
                  style={{ [form.position === 'left' ? 'left' : 'right']: '16px' }}
                >
                  <div className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: form.primary_color }}
                  >
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* Widget panel mock */}
                <div
                  className="absolute bottom-20 w-[280px] bg-white rounded-2xl shadow-xl overflow-hidden"
                  style={{ [form.position === 'left' ? 'left' : 'right']: '16px' }}
                >
                  <div className="p-3 text-white flex items-center gap-2" style={{ backgroundColor: form.primary_color }}>
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                      {form.bot_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{form.bot_name}</div>
                      <div className="text-[10px] opacity-80">Online</div>
                    </div>
                  </div>
                  <div className="p-3 space-y-2 bg-gray-50 min-h-[120px]">
                    <div className="bg-white text-xs text-gray-700 rounded-xl rounded-bl-sm p-2.5 shadow-sm max-w-[85%]">
                      {form.welcome_message}
                    </div>
                    <div className="text-xs rounded-xl rounded-br-sm p-2.5 text-white max-w-[85%] ml-auto"
                      style={{ backgroundColor: form.primary_color }}
                    >
                      Como funciona?
                    </div>
                  </div>
                  <div className="p-2 border-t flex gap-2">
                    <div className="flex-1 bg-gray-100 rounded-lg h-8" />
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: form.primary_color }}
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                  <div className="text-center py-1 bg-gray-50 border-t">
                    <span className="text-[9px] text-gray-400">Powered by AiYou</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="card p-6 border border-red-200">
            <h3 className="text-sm font-semibold text-red-700">Zona de Perigo</h3>
            <p className="text-xs text-gray-500 mt-1">
              Remover o widget desconectará todos os visitantes ativos.
            </p>
            <button
              onClick={() => {
                if (confirm('Tem certeza? Isso removerá o widget permanentemente.')) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="btn-ghost btn-sm text-red-500 hover:bg-red-50 mt-3"
            >
              <Trash2 className="w-4 h-4" />
              Remover Widget
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
