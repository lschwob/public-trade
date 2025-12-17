import { useState, useRef, useEffect } from 'react';
import { Alert } from '../types/trade';

interface AlertPanelProps {
  alerts: Alert[];
  onDismiss: (alertId: string) => void;
  onClear: () => void;
}

export default function AlertPanel({ alerts, onDismiss, onClear }: AlertPanelProps) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const prevAlertsLengthRef = useRef(0);

  // Play sound on new alert
  useEffect(() => {
    if (soundEnabled && alerts.length > prevAlertsLengthRef.current && alerts.length > 0) {
      // Create audio context for beep sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    }
    prevAlertsLengthRef.current = alerts.length;
  }, [alerts, soundEnabled]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 border-red-500 text-red-900';
      case 'high':
        return 'bg-orange-100 border-orange-500 text-orange-900';
      case 'medium':
        return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-900';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-semibold text-gray-900">Alerts</h2>
          {alerts.length > 0 && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-sm ${getSeverityBadge(alerts[0]?.severity || 'medium')}`}>
              {alerts.length}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
              soundEnabled 
                ? 'bg-blue-100 text-blue-700 shadow-sm hover:bg-blue-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="Toggle sound notifications"
          >
            🔊
          </button>
          {alerts.length > 0 && (
            <button
              onClick={onClear}
              className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors shadow-sm"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Alert List */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {alerts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-2">🔔</div>
              <div className="text-sm">No alerts</div>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.alert_id}
                className={`border-l-4 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${getSeverityBadge(alert.severity)} text-white`}>
                        {alert.severity}
                      </span>
                      <span className="text-xs text-gray-600">{formatTime(alert.timestamp)}</span>
                    </div>
                    <div className="font-medium mb-1">{alert.alert_type}</div>
                    <div className="text-sm">{alert.message}</div>
                    {alert.notional_eur && (
                      <div className="text-xs mt-2 font-semibold">
                        {alert.notional_eur >= 1_000_000_000
                          ? `${(alert.notional_eur / 1_000_000_000).toFixed(2)}B EUR`
                          : alert.notional_eur >= 1_000_000
                          ? `${(alert.notional_eur / 1_000_000).toFixed(2)}M EUR`
                          : `${alert.notional_eur.toLocaleString()} EUR`}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onDismiss(alert.alert_id)}
                    className="text-gray-500 hover:text-gray-700 ml-2"
                    title="Dismiss alert"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


