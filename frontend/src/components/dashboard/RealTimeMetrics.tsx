import { RealTimeMetrics as RealTimeMetricsType } from '../../types/trade';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import Gauge from '../charts/Gauge';

interface RealTimeMetricsProps {
  realtimeMetrics: RealTimeMetricsType | undefined;
}

export default function RealTimeMetrics({ realtimeMetrics }: RealTimeMetricsProps) {
  const formatNotional = (value: number) => {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    } else if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    return value.toLocaleString();
  };

  if (!realtimeMetrics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No real-time data available
      </div>
    );
  }

  // Volume momentum data
  const volumeMomentumData = [
    { period: '5min', volume: realtimeMetrics.volume_last_5min },
    { period: '15min', volume: realtimeMetrics.volume_last_15min },
    { period: '1h', volume: realtimeMetrics.volume_last_hour }
  ];

  // Market activity status
  const getActivityStatus = () => {
    const score = realtimeMetrics.liquidity_score;
    if (score >= 70) return { status: 'Hot', color: 'text-red-600', bg: 'bg-red-50' };
    if (score >= 40) return { status: 'Normal', color: 'text-blue-600', bg: 'bg-blue-50' };
    return { status: 'Quiet', color: 'text-gray-600', bg: 'bg-gray-50' };
  };

  const activityStatus = getActivityStatus();

  return (
    <div className="p-6 space-y-6">
      {/* Real-time KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Volume (5min)</div>
          <div className="text-2xl font-bold text-gray-900">{formatNotional(realtimeMetrics.volume_last_5min)}</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Volume (15min)</div>
          <div className="text-2xl font-bold text-gray-900">{formatNotional(realtimeMetrics.volume_last_15min)}</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Volume (1h)</div>
          <div className="text-2xl font-bold text-gray-900">{formatNotional(realtimeMetrics.volume_last_hour)}</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Trades (5min)</div>
          <div className="text-2xl font-bold text-gray-900">{realtimeMetrics.trades_last_5min}</div>
        </div>
      </div>

      {/* Liquidity Score & Activity Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Liquidity Score</h3>
          <div className="flex justify-center">
            <Gauge
              value={realtimeMetrics.liquidity_score}
              min={0}
              max={100}
              thresholds={{ low: 20, medium: 50, high: 80 }}
              label="Liquidity"
              size={200}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Activity Status</h3>
          <div className={`${activityStatus.bg} rounded-lg p-8 text-center`}>
            <div className={`text-4xl font-bold ${activityStatus.color} mb-2`}>
              {activityStatus.status}
            </div>
            <div className="text-sm text-gray-600">
              Based on trade frequency and volume depth
            </div>
          </div>
        </div>
      </div>

      {/* Volume Momentum */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Volume Momentum</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={volumeMomentumData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="period" 
              tick={{ fontSize: 12 }}
            />
            <YAxis tickFormatter={formatNotional} />
            <Tooltip formatter={(value: number) => formatNotional(value)} />
            <Bar dataKey="volume" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Rate Velocity */}
      {Object.keys(realtimeMetrics.rate_velocity).length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Rate Velocity (bps/hour)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Velocity (bps/h)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Direction
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(realtimeMetrics.rate_velocity).map(([tenor, velocity]) => (
                  <tr key={tenor}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {tenor}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {velocity.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${velocity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {velocity >= 0 ? '↑ Rising' : '↓ Falling'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alert Density */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Density</h3>
        <div className="flex items-center justify-center">
          <div className={`text-6xl font-bold ${
            realtimeMetrics.alert_count_last_hour === 0 ? 'text-gray-400' :
            realtimeMetrics.alert_count_last_hour < 3 ? 'text-green-600' :
            realtimeMetrics.alert_count_last_hour < 10 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {realtimeMetrics.alert_count_last_hour}
          </div>
          <div className="ml-4 text-sm text-gray-600">
            <div className="font-medium">Alerts in last hour</div>
            <div className="text-xs mt-1">
              {realtimeMetrics.alert_count_last_hour === 0 ? 'No alerts' :
               realtimeMetrics.alert_count_last_hour < 3 ? 'Low activity' :
               realtimeMetrics.alert_count_last_hour < 10 ? 'Moderate activity' : 'High activity'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

