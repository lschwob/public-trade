import { ProAlert } from '../../types/trade';

interface AlertBadgeProps {
  alert: ProAlert;
  onDismiss?: () => void;
}

export default function AlertBadge({ alert, onDismiss }: AlertBadgeProps) {
  const getIcon = () => {
    switch (alert.alert_type) {
      case 'ABNORMAL_SPREAD':
        return '⚠️';
      case 'LARGE_BLOCK':
        return '🚨';
      case 'CURVE_INVERSION':
        return '📉';
      case 'VOLATILITY_SPIKE':
        return '📊';
      default:
        return '⚠️';
    }
  };

  const getSeverityColor = () => {
    switch (alert.severity) {
      case 'CRITICAL':
        return 'bg-red-600 text-white border-red-700';
      case 'HIGH':
        return 'bg-orange-500 text-white border-orange-600';
      case 'MEDIUM':
        return 'bg-yellow-500 text-white border-yellow-600';
      case 'LOW':
        return 'bg-gray-400 text-white border-gray-500';
      default:
        return 'bg-gray-400 text-white border-gray-500';
    }
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getSeverityColor()} animate-pulse`}>
      <span className="text-lg">{getIcon()}</span>
      <div className="flex-1">
        <div className="font-semibold text-sm">{alert.alert_type.replace('_', ' ')}</div>
        <div className="text-xs opacity-90">{alert.message}</div>
      </div>
      {alert.tenor && (
        <span className="text-xs font-mono bg-white bg-opacity-20 px-2 py-1 rounded">
          {alert.tenor}
        </span>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-2 text-white hover:bg-white hover:bg-opacity-20 rounded px-2 py-1"
        >
          ×
        </button>
      )}
    </div>
  );
}
