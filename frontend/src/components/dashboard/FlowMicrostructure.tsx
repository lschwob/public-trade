import { FlowMetrics, CurrencyMetrics } from '../../types/trade';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import Treemap from '../charts/Treemap';

interface FlowMicrostructureProps {
  flowMetrics: FlowMetrics | undefined;
  currencyMetrics: CurrencyMetrics | undefined;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

export default function FlowMicrostructure({ flowMetrics, currencyMetrics }: FlowMicrostructureProps) {
  const formatNotional = (value: number) => {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    } else if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    return value.toLocaleString();
  };

  if (!flowMetrics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No flow data available
      </div>
    );
  }

  // Action breakdown data
  const actionBreakdownData = Object.entries(flowMetrics.action_breakdown).map(([name, value]) => ({
    name,
    value
  }));

  // Platform treemap data
  const platformTreemapData = flowMetrics.platform_market_share.map(p => ({
    name: p.platform,
    size: p.notional
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Action Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Action Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={actionBreakdownData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry) => `${entry.name}: ${entry.value}`}
              >
                {actionBreakdownData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Flow Direction */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Flow Direction</h3>
          <div className="space-y-4">
            {Object.entries(flowMetrics.flow_direction).map(([direction, count]) => (
              <div key={direction} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 capitalize">{direction}</span>
                <span className="text-lg font-bold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Platform Market Share */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Market Share (Treemap)</h3>
        <Treemap data={platformTreemapData} />
      </div>

      {/* Average Trade Size by Platform */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Trade Size by Platform</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={flowMetrics.avg_trade_size_by_platform.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="platform" 
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fontSize: 12 }}
            />
            <YAxis tickFormatter={formatNotional} />
            <Tooltip formatter={(value: number) => formatNotional(value)} />
            <Bar dataKey="avg_size" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Currency Breakdown */}
      {currencyMetrics && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Currency Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={currencyMetrics.currency_breakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="currency" 
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={formatNotional} />
              <Tooltip formatter={(value: number) => formatNotional(value)} />
              <Bar dataKey="notional" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Platform Market Share Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Market Share Details</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notional (EUR)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Market Share
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {flowMetrics.platform_market_share.map((platform) => (
                <tr key={platform.platform}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {platform.platform}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatNotional(platform.notional)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {platform.percentage.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

