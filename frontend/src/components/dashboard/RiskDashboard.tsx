import { RiskMetrics } from '../../types/trade';
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

interface RiskDashboardProps {
  riskMetrics: RiskMetrics | undefined;
}

export default function RiskDashboard({ riskMetrics }: RiskDashboardProps) {
  const formatNotional = (value: number) => {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    } else if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    return value.toLocaleString();
  };

  const formatDV01 = (value: number) => {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    } else if (value >= 1_000) {
      return `${(value / 1_000).toFixed(2)}K`;
    }
    return value.toFixed(2);
  };

  if (!riskMetrics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No risk data available
      </div>
    );
  }

  // HHI interpretation
  const hhiStatus = riskMetrics.concentration_hhi < 1500 ? 'Low' : 
                    riskMetrics.concentration_hhi < 2500 ? 'Moderate' : 'High';
  const hhiColor = riskMetrics.concentration_hhi < 1500 ? 'green' : 
                   riskMetrics.concentration_hhi < 2500 ? 'yellow' : 'red';

  return (
    <div className="p-6 space-y-6">
      {/* Risk KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Total DV01</div>
          <div className="text-3xl font-bold text-gray-900">{formatDV01(riskMetrics.total_dv01)}</div>
          <div className="text-xs text-gray-500 mt-1">EUR per 1bp</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Concentration (HHI)</div>
          <div className="text-3xl font-bold text-gray-900">{riskMetrics.concentration_hhi.toFixed(0)}</div>
          <div className={`text-xs mt-1 text-${hhiColor}-600`}>{hhiStatus} Concentration</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Top 5 Concentration</div>
          <div className="text-3xl font-bold text-gray-900">{riskMetrics.top5_concentration.toFixed(1)}%</div>
          <div className="text-xs text-gray-500 mt-1">of total notional</div>
        </div>
      </div>

      {/* HHI Gauge */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Concentration (HHI)</h3>
        <div className="flex justify-center">
          <Gauge
            value={riskMetrics.concentration_hhi}
            min={0}
            max={10000}
            thresholds={{ low: 1500, medium: 2500, high: 10000 }}
            label="HHI Index"
            size={200}
          />
        </div>
        <div className="mt-4 text-sm text-gray-600 text-center">
          <p>HHI &lt; 1500: Low concentration (competitive market)</p>
          <p>HHI 1500-2500: Moderate concentration</p>
          <p>HHI &gt; 2500: High concentration (oligopolistic market)</p>
        </div>
      </div>

      {/* Notional Distribution */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notional Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={riskMetrics.notional_distribution}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="bucket" 
              tick={{ fontSize: 12 }}
            />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Percentiles */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Notional Percentiles</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(riskMetrics.percentiles).map(([percentile, value]) => (
            <div key={percentile} className="text-center">
              <div className="text-sm text-gray-600 mb-1">{percentile.toUpperCase()}</div>
              <div className="text-xl font-bold text-gray-900">{formatNotional(value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Summary Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Summary</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Metric
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Interpretation
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Total DV01
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDV01(riskMetrics.total_dv01)} EUR
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  Price sensitivity per 1bp rate change
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Concentration HHI
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {riskMetrics.concentration_hhi.toFixed(0)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {hhiStatus} concentration ({hhiStatus === 'Low' ? 'competitive' : hhiStatus === 'Moderate' ? 'moderate' : 'oligopolistic'} market)
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Top 5 Concentration
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {riskMetrics.top5_concentration.toFixed(1)}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  Percentage of total notional in top 5 underlyings
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

