import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, BookOpen, Search, Tag, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Modal from '../components/Modal';

export default function KnowledgeBase() {
  const queryClient = useQueryClient();
  const [editModal, setEditModal] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [form, setForm] = useState({ title: '', content: '', category: '', is_active: true });

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-base', search, categoryFilter],
    queryFn: () => api.get('/knowledge-base', {
      params: { search: search || undefined, category: categoryFilter || undefined },
    }).then(r => r.data),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['kb-categories'],
    queryFn: () => api.get('/knowledge-base/categories').then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (payload) => {
      if (editModal && editModal !== 'new') {
        return api.put(`/knowledge-base/${editModal.id}`, payload);
      }
      return api.post('/knowledge-base', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      setEditModal(null);
      toast.success('Artigo salvo');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro ao salvar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/knowledge-base/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['kb-categories'] });
      toast.success('Artigo removido');
    },
    onError: () => toast.error('Erro ao remover'),
  });

  const openNew = () => {
    setForm({ title: '', content: '', category: '', is_active: true });
    setEditModal('new');
  };

  const openEdit = (entry) => {
    setForm({
      title: entry.title,
      content: entry.content,
      category: entry.category || '',
      is_active: entry.is_active,
    });
    setEditModal(entry);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const entries = data?.data || [];
  const categories = categoriesData?.categories || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-purple-500 to-purple-700">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Base de Conhecimento</h1>
            <p className="page-subtitle">Artigos e FAQs que a IA usa para responder seus clientes</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Artigo
        </button>
      </div>

      {/* Info banner */}
      <div className="card bg-purple-50 border border-purple-200">
        <div className="p-4 flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-purple-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-purple-800">Como funciona</p>
            <p className="text-sm text-purple-600 mt-1">
              Quando um cliente faz uma pergunta, a IA busca automaticamente nesta base de conhecimento para encontrar respostas relevantes. Quanto mais artigos e FAQs voce cadastrar, melhor a IA responde.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar artigos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 w-full"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setCategoryFilter('')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                !categoryFilter ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white'
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  categoryFilter === cat ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="skeleton h-5 w-48" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <BookOpen className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="empty-state-title">Nenhum artigo cadastrado</h3>
          <p className="empty-state-text">
            {search ? 'Nenhum artigo encontrado para sua busca.' : 'Crie artigos para que a IA possa responder seus clientes com informacoes precisas.'}
          </p>
          {!search && (
            <button onClick={openNew} className="btn-primary mt-4">
              <Plus className="w-4 h-4" />
              Criar primeiro artigo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className={`card card-hover p-5 ${!entry.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-gray-900 truncate">{entry.title}</h3>
                    {!entry.is_active && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Inativo</span>
                    )}
                  </div>
                  {entry.category && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full mb-2">
                      <Tag className="w-3 h-3" />
                      {entry.category}
                    </span>
                  )}
                  <p className="text-sm text-gray-600 line-clamp-2">{entry.content}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(entry)} className="btn-ghost btn-sm">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Remover este artigo?')) deleteMutation.mutate(entry.id); }}
                    className="btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {editModal && (
        <Modal onClose={() => setEditModal(null)} title={editModal === 'new' ? 'Novo Artigo' : `Editar: ${editModal.title}`}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="input-label">Titulo</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                className="input-field"
                placeholder="Ex: Horario de funcionamento"
              />
            </div>

            <div>
              <label className="input-label">Categoria (opcional)</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input-field"
                placeholder="Ex: FAQ, Produtos, Politicas"
                list="kb-categories"
              />
              {categories.length > 0 && (
                <datalist id="kb-categories">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              )}
            </div>

            <div>
              <label className="input-label">Conteudo</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
                className="input-field min-h-[200px] resize-y"
                placeholder="Escreva o conteudo do artigo. A IA vai usar este texto para responder perguntas dos clientes."
              />
              <div className="flex justify-end mt-1">
                <span className={`text-xs ${form.content.length > 45000 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {form.content.length} / 50.000
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded text-primary-600"
              />
              Artigo ativo (visivel para a IA)
            </label>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setEditModal(null)} className="btn-secondary">
                <X className="w-4 h-4" />
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
