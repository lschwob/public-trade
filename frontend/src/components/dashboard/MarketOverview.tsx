import { Analytics } from '../../types/trade';
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
import Gauge from '../charts/Gauge';

interface MarketOverviewProps {
  analytics: Analytics;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

export default function MarketOverview({ analytics }: MarketOverviewProps) {
  const formatNotional = (value: number) => {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    } else if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    return value.toLocaleString();
  };

  // Quick insights
  const mostActiveInstrument = analytics.curve_metrics?.instrument_distribution
    .sort((a, b) => b.notional - a.notional)[0]?.instrument || 'N/A';
  
  const mostActivePlatform = analytics.flow_metrics?.platform_market_share[0]?.platform || 'N/A';
  
  const dominantCurrency = analytics.currency_metrics?.currency_breakdown[0]?.currency || 'N/A';
  
  const alertDensity = analytics.realtime_metrics?.alert_count_last_hour || 0;
  const alertColor = alertDensity === 0 ? 'gray' : alertDensity < 3 ? 'green' : alertDensity < 10 ? 'yellow' : 'red';

  return (
    <div className="p-6 space-y-6">
      {/* Enhanced KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Total Notional (EUR)</div>
          <div className="text-3xl font-bold text-gray-900">{formatNotional(analytics.total_notional_eur)}</div>
          <div className="text-xs text-gray-500 mt-1">Daily volume</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Average Trade Size</div>
          <div className="text-3xl font-bold text-gray-900">{formatNotional(analytics.avg_size_eur)}</div>
          <div className="text-xs text-gray-500 mt-1">EUR per trade</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Market Concentration</div>
          <div className="text-3xl font-bold text-gray-900">
            {analytics.risk_metrics?.concentration_hhi.toFixed(0) || 'N/A'}
          </div>
          <div className="text-xs text-gray-500 mt-1">HHI Index</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Liquidity Score</div>
          {analytics.realtime_metrics ? (
            <Gauge
              value={analytics.realtime_metrics.liquidity_score}
              min={0}
              max={100}
              thresholds={{ low: 20, medium: 50, high: 80 }}
              size={80}
            />
          ) : (
            <div className="text-3xl font-bold text-gray-900">N/A</div>
          )}
        </div>
      </div>

      {/* Quick Insights Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-600 mb-1">Most Active Instrument</div>
          <div className="text-lg font-semibold text-blue-600">{mostActiveInstrument}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-600 mb-1">Most Active Platform</div>
          <div className="text-lg font-semibold text-purple-600">{mostActivePlatform}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-600 mb-1">Dominant Currency</div>
          <div className="text-lg font-semibold text-green-600">{dominantCurrency}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-600 mb-1">Alert Density (1h)</div>
          <div className={`text-lg font-semibold text-${alertColor}-600`}>{alertDensity}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top 10 Underlyings */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Underlyings</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.top_underlyings.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fontSize: 10 }}
              />
              <YAxis tickFormatter={formatNotional} />
              <Tooltip formatter={(value: number) => formatNotional(value)} />
              <Bar dataKey="notional" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Instrument Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Instrument Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.curve_metrics?.instrument_distribution || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="instrument" 
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={formatNotional} />
              <Tooltip formatter={(value: number) => formatNotional(value)} />
              <Bar dataKey="notional" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Platform Market Share */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Market Share</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={analytics.flow_metrics?.platform_market_share.slice(0, 10) || []}
                dataKey="notional"
                nameKey="platform"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry) => `${entry.platform}: ${entry.percentage.toFixed(1)}%`}
              >
                {(analytics.flow_metrics?.platform_market_share.slice(0, 10) || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatNotional(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Total Trades</div>
          <div className="text-2xl font-bold text-gray-900">{analytics.total_trades}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Strategies Detected</div>
          <div className="text-2xl font-bold text-gray-900">{analytics.strategies_count}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-1">Largest Trade</div>
          <div className="text-2xl font-bold text-gray-900">{formatNotional(analytics.largest_trade_eur)}</div>
        </div>
      </div>
    </div>
  );
}



