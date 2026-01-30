import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export default function DataTable({
  columns,
  data = [],
  pagination,
  onPageChange,
  onSort,
  emptyMessage = 'Nenhum registro encontrado',
  isLoading = false,
}) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (field) => {
    const newDir = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(newDir);
    onSort?.(field, newDir);
  };

  // Skeleton rows for loading state
  const skeletonRows = Array.from({ length: 5 }, (_, i) => (
    <tr key={`skel-${i}`}>
      {columns.map((col) => (
        <td key={col.key} className="px-5 py-4">
          <div className="skeleton h-4 w-3/4 rounded" />
        </td>
      ))}
    </tr>
  ));

  return (
    <div className="card overflow-hidden">
      {/* Desktop table */}
      <div className="overflow-x-auto hidden sm:block">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/80 ${
                    col.sortable ? 'cursor-pointer select-none hover:text-gray-700 hover:bg-gray-100/50 transition-colors' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortField === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp className="w-3.5 h-3.5 text-primary-600" />
                        : <ChevronDown className="w-3.5 h-3.5 text-primary-600" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? skeletonRows : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className="hover:bg-primary-50/30 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-3.5 text-sm text-gray-700">
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden divide-y divide-gray-100">
        {isLoading ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={`mskel-${i}`} className="p-4 space-y-3">
              <div className="skeleton h-4 w-1/2 rounded" />
              <div className="skeleton h-3 w-3/4 rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          ))
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {emptyMessage}
          </div>
        ) : (
          data.map((row, idx) => (
            <div key={row.id || idx} className="p-4 space-y-2">
              {columns.map((col) => {
                const value = col.render ? col.render(row[col.key], row) : row[col.key];
                if (!value && value !== 0) return null;
                return (
                  <div key={col.key} className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-gray-500 flex-shrink-0 min-w-[80px]">
                      {col.label}
                    </span>
                    <span className="text-sm text-gray-900 text-right">
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.last_page > 1 && (
        <div className="px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500 order-2 sm:order-1">
            {((pagination.current_page - 1) * pagination.per_page) + 1}–{Math.min(pagination.current_page * pagination.per_page, pagination.total)} de {pagination.total}
          </p>
          <div className="flex items-center gap-1 order-1 sm:order-2">
            <button
              onClick={() => onPageChange?.(pagination.current_page - 1)}
              disabled={pagination.current_page <= 1}
              className="btn-icon disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(pagination.last_page, 5) }, (_, i) => {
              let page;
              if (pagination.last_page <= 5) {
                page = i + 1;
              } else if (pagination.current_page <= 3) {
                page = i + 1;
              } else if (pagination.current_page >= pagination.last_page - 2) {
                page = pagination.last_page - 4 + i;
              } else {
                page = pagination.current_page - 2 + i;
              }
              return (
                <button
                  key={page}
                  onClick={() => onPageChange?.(page)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    page === pagination.current_page
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange?.(pagination.current_page + 1)}
              disabled={pagination.current_page >= pagination.last_page}
              className="btn-icon disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
