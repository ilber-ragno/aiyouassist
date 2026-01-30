import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { Eye, Plus, Pencil, Trash2, Check, X, Users } from 'lucide-react';

export default function AdminViewProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [allMenuItems, setAllMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', menu_items: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [profilesRes, itemsRes] = await Promise.all([
        api.get('/admin/view-profiles'),
        api.get('/admin/view-profiles/menu-items'),
      ]);
      setProfiles(profilesRes.data.profiles);
      setAllMenuItems(itemsRes.data.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingProfile(null);
    setForm({ name: '', description: '', menu_items: [] });
    setShowForm(true);
  };

  const openEdit = (profile) => {
    setEditingProfile(profile);
    setForm({
      name: profile.name,
      description: profile.description || '',
      menu_items: profile.menu_items || [],
    });
    setShowForm(true);
  };

  const toggleItem = (key) => {
    setForm(prev => ({
      ...prev,
      menu_items: prev.menu_items.includes(key)
        ? prev.menu_items.filter(k => k !== key)
        : [...prev.menu_items, key],
    }));
  };

  const selectAll = () => {
    setForm(prev => ({ ...prev, menu_items: allMenuItems.map(i => i.key) }));
  };

  const selectNone = () => {
    setForm(prev => ({ ...prev, menu_items: [] }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.menu_items.length === 0) return;
    setSaving(true);
    try {
      if (editingProfile) {
        await api.put(`/admin/view-profiles/${editingProfile.id}`, form);
      } else {
        await api.post('/admin/view-profiles', form);
      }
      setShowForm(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (profile) => {
    if (!confirm(`Excluir perfil "${profile.name}"? Tenants serão movidos para o perfil Comum.`)) return;
    try {
      await api.delete(`/admin/view-profiles/${profile.id}`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 rounded-xl" />
            <div>
              <div className="skeleton h-6 w-48" />
              <div className="skeleton h-4 w-64 mt-1" />
            </div>
          </div>
          <div className="skeleton h-10 w-32 rounded-lg" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 space-y-3">
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-4 w-48" />
              <div className="flex gap-1">
                <div className="skeleton h-6 w-16 rounded-full" />
                <div className="skeleton h-6 w-20 rounded-full" />
                <div className="skeleton h-6 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-icon bg-gradient-to-br from-primary-500 to-primary-600">
            <Eye className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Perfis de Visualização</h1>
            <p className="page-subtitle">Gerencie quais itens do menu cada perfil pode ver</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Perfil
        </button>
      </div>

      {/* Profiles list */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {profiles.map((profile) => (
          <div key={profile.id} className="card card-hover p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{profile.name}</h3>
                {profile.description && (
                  <p className="text-xs text-gray-500 mt-1">{profile.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {profile.is_system && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Sistema</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
              <Users className="w-3.5 h-3.5" />
              <span>{profile.tenants_count} tenant(s)</span>
              <span className="text-gray-300">|</span>
              <span>{profile.menu_items?.length || 0} itens</span>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {profile.menu_items?.map((key) => {
                const item = allMenuItems.find(i => i.key === key);
                return (
                  <span key={key} className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                    {item?.label || key}
                  </span>
                );
              })}
            </div>

            <div className="flex gap-2 pt-3 border-t">
              <button
                onClick={() => openEdit(profile)}
                className="btn-ghost btn-sm text-primary-600"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
              {!profile.is_system && (
                <button
                  onClick={() => handleDelete(profile)}
                  className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editingProfile ? 'Editar Perfil' : 'Novo Perfil'}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Nome</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="input-field"
                placeholder="Ex: Intermediário"
                disabled={editingProfile?.is_system}
              />
            </div>

            <div>
              <label className="input-label">Descrição</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                className="input-field"
                placeholder="Descrição opcional"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="input-label mb-0">Itens do Menu</label>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-primary-600 hover:underline font-medium">
                    Selecionar todos
                  </button>
                  <button onClick={selectNone} className="text-xs text-gray-500 hover:underline">
                    Limpar
                  </button>
                </div>
              </div>
              <div className="space-y-1 border rounded-lg p-3">
                {allMenuItems.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.menu_items.includes(item.key)}
                      onChange={() => toggleItem(item.key)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{item.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{item.key}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {form.menu_items.length} item(s) selecionado(s)
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || form.menu_items.length === 0}
                className="btn-primary"
              >
                {saving ? 'Salvando...' : (editingProfile ? 'Salvar' : 'Criar')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
