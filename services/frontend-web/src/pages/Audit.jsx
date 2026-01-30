import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Download } from 'lucide-react';
import DataTable from '../components/DataTable';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function Audit() {
  const [filters, setFilters] = useState({
    action: '',
    user_id: '',
    date_from: '',
    date_to: '',
    page: 1,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      return api.get(`/audit?${params}`).then(r => r.data);
    },
  });

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);

      const response = await api.get(`/audit/export?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Exportação concluída');
    } catch {
      toast.error('Erro na exportação');
    }
  };

  const columns = [
    {
      key: 'created_at',
      label: 'Data',
      sortable: true,
      render: (v) => new Date(v).toLocaleString('pt-BR'),
    },
    {
      key: 'user',
      label: 'Usuário',
      render: (v) => v?.name || 'Sistema',
    },
    { key: 'action', label: 'Ação', sortable: true },
    { key: 'source', label: 'Módulo' },
    {
      key: 'details',
      label: 'Detalhes',
      render: (v) => {
        if (!v || typeof v !== 'object') return '-';
        return (
          <details className="text-xs">
            <summary className="cursor-pointer text-blue-600">Ver detalhes</summary>
            <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-auto max-h-32">
              {JSON.stringify(v, null, 2)}
            </pre>
          </details>
        );
      },
    },
    { key: 'ip_address', label: 'IP' },
  ];

  const updateFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value, page: 1 }));
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Auditoria
          </h1>
          <p className="page-subtitle">Trilha de auditoria de ações dos usuários</p>
        </div>
        <button
          onClick={exportCsv}
          className="btn-secondary flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="input-label">Ação</label>
            <input
              type="text"
              value={filters.action}
              onChange={(e) => updateFilter('action', e.target.value)}
              placeholder="Buscar por ação..."
              className="input-field"
            />
          </div>
          <div>
            <label className="input-label">De</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => updateFilter('date_from', e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="input-label">Até</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => updateFilter('date_to', e.target.value)}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data?.audits?.data || []}
        pagination={data?.audits}
        onPageChange={(page) => setFilters(f => ({ ...f, page }))}
        isLoading={isLoading}
        emptyMessage="Nenhum registro de auditoria"
      />
    </div>
  );
}
