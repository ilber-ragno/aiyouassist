import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import api from '../lib/api';

const LOG_TYPE_LABELS = {
  system: 'Sistema',
  audit: 'Auditoria',
  webhook: 'Webhook',
  integration: 'Integração',
  credit: 'Créditos',
  ai: 'Agente IA',
  message: 'Mensagens',
};

const LOG_TYPE_COLORS = {
  system: 'bg-gray-100 text-gray-700',
  audit: 'bg-purple-100 text-purple-700',
  webhook: 'bg-blue-100 text-blue-700',
  integration: 'bg-cyan-100 text-cyan-700',
  credit: 'bg-green-100 text-green-700',
  ai: 'bg-amber-100 text-amber-700',
  message: 'bg-indigo-100 text-indigo-700',
};

const SEVERITY_COLORS = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-700',
  critical: 'bg-red-200 text-red-900 font-semibold',
};

function DetailsCell({ details }) {
  const [expanded, setExpanded] = useState(false);

  if (!details || (typeof details === 'object' && Object.keys(details).length === 0)) {
    return <span className="text-xs text-gray-400">-</span>;
  }

  const text = typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details);
  const short = text.length > 80 ? text.substring(0, 80) + '...' : text;

  if (text.length <= 80) {
    return (
      <span className="text-xs text-gray-500 font-mono max-w-xs block whitespace-pre-wrap">
        {text}
      </span>
    );
  }

  return (
    <div className="max-w-xs">
      <span className="text-xs text-gray-500 font-mono block whitespace-pre-wrap">
        {expanded ? text : short}
      </span>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 flex items-center gap-1"
      >
        {expanded ? <><ChevronUp className="w-3 h-3" /> Menos</> : <><ChevronDown className="w-3 h-3" /> Mais</>}
      </button>
    </div>
  );
}

export default function Logs() {
  const [filters, setFilters] = useState({
    log_type: '',
    severity: '',
    date_from: '',
    date_to: '',
    search: '',
    page: 1,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logs', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      return api.get(`/logs?${params}`).then(r => r.data);
    },
    refetchInterval: 15000,
  });

  const columns = [
    {
      key: 'severity',
      label: 'Severidade',
      sortable: true,
      render: (v) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[v] || 'bg-gray-100 text-gray-700'}`}>
          {v}
        </span>
      ),
    },
    {
      key: 'log_type',
      label: 'Tipo',
      sortable: true,
      render: (v) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${LOG_TYPE_COLORS[v] || 'bg-gray-100 text-gray-700'}`}>
          {LOG_TYPE_LABELS[v] || v}
        </span>
      ),
    },
    { key: 'source', label: 'Fonte', sortable: true },
    {
      key: 'action',
      label: 'Ação',
      render: (v) => (
        <span className="text-sm text-gray-900 max-w-md block truncate" title={v}>
          {v}
        </span>
      ),
    },
    {
      key: 'details',
      label: 'Detalhes',
      render: (v) => <DetailsCell details={v} />,
    },
    {
      key: 'created_at',
      label: 'Data',
      sortable: true,
      render: (v) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {new Date(v).toLocaleString('pt-BR')}
        </span>
      ),
    },
  ];

  const updateFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value, page: 1 }));
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Logs
          </h1>
          <p className="page-subtitle">Logs de execução do sistema — mensagens, webhooks, créditos, IA e mais</p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="input-label">Tipo</label>
            <select
              value={filters.log_type}
              onChange={(e) => updateFilter('log_type', e.target.value)}
              className="input-field"
            >
              <option value="">Todos</option>
              <option value="system">Sistema</option>
              <option value="audit">Auditoria</option>
              <option value="webhook">Webhook</option>
              <option value="integration">Integração</option>
              <option value="credit">Créditos</option>
              <option value="ai">Agente IA</option>
              <option value="message">Mensagens</option>
            </select>
          </div>
          <div>
            <label className="input-label">Severidade</label>
            <select
              value={filters.severity}
              onChange={(e) => updateFilter('severity', e.target.value)}
              className="input-field"
            >
              <option value="">Todas</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
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
          <div>
            <label className="input-label">Buscar</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Buscar em ação, fonte ou detalhes..."
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data?.logs?.data || []}
        pagination={data?.logs}
        onPageChange={(page) => setFilters(f => ({ ...f, page }))}
        isLoading={isLoading}
        emptyMessage="Nenhum log encontrado"
      />
    </div>
  );
}
