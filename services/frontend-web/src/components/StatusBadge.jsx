const statusStyles = {
  connected: 'bg-green-50 text-green-700 ring-green-600/20',
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  healthy: 'bg-green-50 text-green-700 ring-green-600/20',
  enabled: 'bg-green-50 text-green-700 ring-green-600/20',
  success: 'bg-green-50 text-green-700 ring-green-600/20',
  paid: 'bg-green-50 text-green-700 ring-green-600/20',

  trial: 'bg-blue-50 text-blue-700 ring-blue-600/20',

  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  degraded: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  waiting_qr: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  past_due: 'bg-amber-50 text-amber-700 ring-amber-600/20',

  error: 'bg-red-50 text-red-700 ring-red-600/20',
  failed: 'bg-red-50 text-red-700 ring-red-600/20',
  banned: 'bg-red-50 text-red-700 ring-red-600/20',
  critical: 'bg-red-50 text-red-700 ring-red-600/20',
  blocked: 'bg-red-50 text-red-700 ring-red-600/20',
  refunded: 'bg-red-50 text-red-700 ring-red-600/20',

  disconnected: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  inactive: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  disabled: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  cancelled: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  paused: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  unknown: 'bg-gray-50 text-gray-600 ring-gray-500/20',
};

const dotColors = {
  connected: 'bg-green-500',
  active: 'bg-green-500',
  healthy: 'bg-green-500',
  enabled: 'bg-green-500',
  success: 'bg-green-500',
  paid: 'bg-green-500',

  trial: 'bg-blue-500',

  warning: 'bg-amber-500',
  degraded: 'bg-amber-500',
  waiting_qr: 'bg-amber-500',
  pending: 'bg-amber-500',
  past_due: 'bg-amber-500',

  error: 'bg-red-500',
  failed: 'bg-red-500',
  banned: 'bg-red-500',
  critical: 'bg-red-500',
  blocked: 'bg-red-500',
  refunded: 'bg-red-500',

  disconnected: 'bg-gray-400',
  inactive: 'bg-gray-400',
  disabled: 'bg-gray-400',
  cancelled: 'bg-gray-400',
  paused: 'bg-gray-400',
  unknown: 'bg-gray-400',
};

// Statuses that show an animated pulse dot
const ALIVE_STATUSES = new Set(['connected', 'active', 'healthy', 'enabled', 'waiting_qr', 'trial']);

export default function StatusBadge({ status, label, size = 'md' }) {
  const key = (status || 'unknown').toLowerCase();
  const style = statusStyles[key] || statusStyles.unknown;
  const dot = dotColors[key] || dotColors.unknown;
  const isAlive = ALIVE_STATUSES.has(key);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1 text-sm',
  };

  const dotSizes = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2',
  };

  return (
    <span className={`badge ring-1 ring-inset ${style} ${sizeClasses[size]}`}>
      <span className="relative flex">
        <span className={`rounded-full ${dot} ${dotSizes[size]}`} />
        {isAlive && (
          <span className={`absolute inset-0 rounded-full ${dot} animate-pulse-dot`} />
        )}
      </span>
      {label || status || 'Unknown'}
    </span>
  );
}
