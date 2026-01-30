import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Trash2, Key, Copy } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function Team() {
  const [showInvite, setShowInvite] = useState(false);
  const [showTokenCreate, setShowTokenCreate] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'operator' });
  const [tokenName, setTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState(null);
  const queryClient = useQueryClient();

  const { data: membersData, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => api.get('/team/members').then(r => r.data),
  });

  const { data: rolesData } = useQuery({
    queryKey: ['team-roles'],
    queryFn: () => api.get('/team/roles').then(r => r.data),
  });

  const { data: tokensData } = useQuery({
    queryKey: ['team-tokens'],
    queryFn: () => api.get('/team/tokens').then(r => r.data),
  });

  const createMember = useMutation({
    mutationFn: (data) => api.post('/team/members', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setShowInvite(false);
      setInviteForm({ name: '', email: '', role: 'operator' });
      toast.success(`Membro criado. Senha temporária: ${res.data.member?.temp_password}`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erro'),
  });

  const removeMember = useMutation({
    mutationFn: (id) => api.delete(`/team/members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Membro removido');
    },
  });

  const createToken = useMutation({
    mutationFn: (name) => api.post('/team/tokens', { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['team-tokens'] });
      setCreatedToken(res.data.token);
      setTokenName('');
    },
    onError: () => toast.error('Erro ao criar token'),
  });

  const revokeToken = useMutation({
    mutationFn: (id) => api.delete(`/team/tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-tokens'] });
      toast.success('Token revogado');
    },
  });

  const members = membersData?.members || [];
  const roles = rolesData?.roles || [];
  const tokens = tokensData?.tokens || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="page-title">Equipe</h1>
            <p className="page-subtitle">Gerencie membros e permissões</p>
          </div>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo membro
        </button>
      </div>

      {/* Create member modal */}
      {showInvite && (
        <Modal onClose={() => setShowInvite(false)} title="Novo Membro">
          <div className="space-y-4">
            <div>
              <label className="input-label">Nome</label>
              <input
                value={inviteForm.name}
                onChange={(e) => setInviteForm(f => ({ ...f, name: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="input-label">Email</label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="input-label">Cargo</label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm(f => ({ ...f, role: e.target.value }))}
                className="input-field"
              >
                {roles.map(r => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
                {roles.length === 0 && (
                  <>
                    <option value="admin">Admin</option>
                    <option value="operator">Operador</option>
                  </>
                )}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowInvite(false)} className="btn-ghost">
                Cancelar
              </button>
              <button
                onClick={() => createMember.mutate(inviteForm)}
                disabled={!inviteForm.name || !inviteForm.email || createMember.isPending}
                className="btn-primary"
              >
                Criar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Token created modal */}
      {createdToken && (
        <Modal onClose={() => setCreatedToken(null)} title="Token Criado">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Copie este token. Ele não será exibido novamente.</p>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg font-mono text-sm border border-gray-200">
              <code className="flex-1 break-all">{createdToken}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(createdToken); toast.success('Copiado'); }}
                className="btn-ghost btn-sm p-1.5 flex-shrink-0"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Members */}
      {isLoading ? (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="skeleton h-5 w-32" />
          </div>
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-full" />
                  <div className="space-y-2">
                    <div className="skeleton h-4 w-32" />
                    <div className="skeleton h-3 w-44" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Membros ({members.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {members.map((member) => (
              <div
                key={member.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors duration-150"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                    <span className="text-sm font-medium text-white">{member.name?.charAt(0) || '?'}</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{member.name}</p>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {(member.roles || []).map(r => (
                      <span key={r} className="badge bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20">{r}</span>
                    ))}
                  </div>
                  <StatusBadge status={member.is_active ? 'active' : 'inactive'} />
                  <button
                    onClick={() => removeMember.mutate(member.id)}
                    className="btn-ghost btn-sm p-1.5 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Tokens */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Tokens de API</h2>
          <button onClick={() => setShowTokenCreate(true)} className="btn-ghost btn-sm">
            <Key className="w-4 h-4" />
            Novo token
          </button>
        </div>

        {showTokenCreate && (
          <Modal onClose={() => setShowTokenCreate(false)} title="Novo Token">
            <div className="space-y-4">
              <div>
                <label className="input-label">Nome do Token</label>
                <input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  className="input-field"
                  placeholder="Ex: CI/CD Pipeline"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTokenCreate(false)} className="btn-ghost">
                  Cancelar
                </button>
                <button
                  onClick={() => { createToken.mutate(tokenName); setShowTokenCreate(false); }}
                  disabled={!tokenName}
                  className="btn-primary"
                >
                  Criar
                </button>
              </div>
            </div>
          </Modal>
        )}

        <div className="divide-y divide-gray-100">
          {tokens.length === 0 ? (
            <div className="empty-state py-10">
              <Key className="w-10 h-10 text-gray-300 mb-3" />
              <p className="empty-state-text">Nenhum token de API criado</p>
            </div>
          ) : tokens.map((token) => (
            <div
              key={token.id}
              className="px-6 py-3 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors duration-150"
            >
              <div>
                <p className="font-medium text-gray-900">{token.name}</p>
                <p className="text-xs text-gray-500">
                  Último uso: {token.last_used_at ? new Date(token.last_used_at).toLocaleString('pt-BR') : 'Nunca'}
                </p>
              </div>
              <button
                onClick={() => revokeToken.mutate(token.id)}
                className="btn-danger btn-sm"
              >
                Revogar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
