import { useMemo } from 'react';
import { CurveMetrics, StrategyMetrics } from '../../types/trade';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { sortByTenor } from '../../utils/tenorSort';
import Heatmap from '../charts/Heatmap';

interface CurveAnalysisProps {
  curveMetrics: CurveMetrics | undefined;
  strategyMetrics?: StrategyMetrics;
}

export default function CurveAnalysis({ curveMetrics, strategyMetrics }: CurveAnalysisProps) {
  const formatNotional = (value: number) => {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    } else if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    return value.toLocaleString();
  };

  const formatRate = (value: number) => {
    return `${(value * 100).toFixed(4)}%`;
  };

  // Sort tenor distribution by tenor order
  const sortedTenorDistribution = useMemo(() => 
    sortByTenor(curveMetrics?.tenor_distribution || []),
    [curveMetrics]
  );

  if (!curveMetrics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No curve data available
      </div>
    );
  }

  // Prepare data for rate by tenor chart
  const rateByTenorData = Object.entries(curveMetrics.average_rate_by_tenor).map(([tenor, rate]) => ({
    tenor,
    rate: rate * 100 // Convert to percentage
  }));

  // Tenor spread cards
  const spreads = Object.entries(curveMetrics.tenor_spread).map(([spread, value]) => ({
    name: spread,
    value: value * 100, // Convert to bps
    color: value > 0 ? 'text-green-600' : 'text-red-600'
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Tenor Spread Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {spreads.map((spread) => (
          <div key={spread.name} className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">{spread.name}</div>
            <div className={`text-3xl font-bold ${spread.color}`}>
              {spread.value.toFixed(2)} bps
            </div>
          </div>
        ))}
        {spreads.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">No spread data available</div>
          </div>
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenor Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tenor Distribution by Notional</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sortedTenorDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="tenor" 
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={formatNotional} />
              <Tooltip formatter={(value: number) => formatNotional(value)} />
              <Bar dataKey="notional" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Average Rate by Tenor */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Rate by Tenor</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rateByTenorData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="tenor" 
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                tickFormatter={(value) => `${value.toFixed(2)}%`}
              />
              <Tooltip formatter={(value: number) => `${value.toFixed(4)}%`} />
              <Line 
                type="monotone" 
                dataKey="rate" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tenor Details Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Tenor Details</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tenor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notional (EUR)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Rate
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTenorDistribution.map((tenor) => (
                <tr key={tenor.tenor}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {tenor.tenor}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatNotional(tenor.notional)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tenor.count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tenor.avg_rate !== null ? formatRate(tenor.avg_rate) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Most Popular Tenor Pairs */}
      {strategyMetrics?.tenor_pair_distribution && strategyMetrics.tenor_pair_distribution.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Most Popular Tenor Pairs</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={strategyMetrics.tenor_pair_distribution.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="tenor_pair" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" name="Number of Strategies" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tenor Pair Statistics Table */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tenor Pair Statistics</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tenor Pair
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Count
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Notional
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Notional
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {strategyMetrics.tenor_pair_distribution.map((pair) => (
                    <tr key={pair.tenor_pair}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {pair.tenor_pair}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {pair.count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatNotional(pair.total_notional)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatNotional(pair.avg_notional)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

