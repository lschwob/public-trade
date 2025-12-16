import { useState, useMemo } from 'react';
import { ProTraderMetrics, ProTraderDelta, InstrumentDetail } from '../../types/trade';
import MiniSparkline from '../charts/MiniSparkline';
import SpreadBadge from '../charts/SpreadBadge';
import OrderFlowBar from '../charts/OrderFlowBar';
import VolatilityGauge from '../charts/VolatilityGauge';
import PercentileBadge from '../charts/PercentileBadge';
import AlertBadge from '../charts/AlertBadge';
import PriceImpactIndicator from '../charts/PriceImpactIndicator';
import Gauge from '../charts/Gauge';

interface ProTraderProps {
  proTraderMetrics?: Record<string, ProTraderMetrics>;
  proTraderDeltas?: ProTraderDelta;
}

const TIME_WINDOWS = ['10min', '15min', '20min', '30min', '60min'] as const;
type TimeWindow = typeof TIME_WINDOWS[number];

export default function ProTrader({ proTraderMetrics, proTraderDeltas }: ProTraderProps) {
  const [activeWindow, setActiveWindow] = useState<TimeWindow>('10min');
  const [showDeltas, setShowDeltas] = useState(false);

  const currentMetrics = proTraderMetrics?.[activeWindow];
  const referenceMetrics = showDeltas ? proTraderMetrics?.['60min'] : null;

  const formatNotional = (value: number) => {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    } else if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    return value.toLocaleString();
  };

  const formatRate = (rate: number | null) => {
    if (rate === null) return '-';
    return `${rate.toFixed(3)}%`;
  };

  if (!currentMetrics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No pro trader data available
      </div>
    );
  }

  // Focus instruments: 5Y, 10Y, 30Y
  const focusInstruments = ['5Y', '10Y', '30Y'];
  const instrumentDetails = focusInstruments
    .map(instrument => ({ instrument, detail: currentMetrics.instrument_metrics[instrument] }))
    .filter(({ detail }) => detail !== undefined);

  // Check if we have any data
  const hasData = instrumentDetails.length > 0 || 
    Object.keys(currentMetrics.instrument_metrics).length > 0 ||
    currentMetrics.flow_metrics.new_trades_count > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <div className="text-xl font-semibold mb-2">No EUR IRS trades in selected time window</div>
        <div className="text-sm">
          Try selecting a longer time window (30min or 1h) or check if there are trades in the blotter.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header with time windows and controls */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            {TIME_WINDOWS.map((window) => {
              const metrics = proTraderMetrics?.[window];
              const tradeCount = metrics?.instrument_metrics ? 
                Object.values(metrics.instrument_metrics).reduce((sum, d) => sum + (d?.trade_count || 0), 0) : 0;
              
              return (
                <button
                  key={window}
                  onClick={() => setActiveWindow(window)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors relative ${
                    activeWindow === window
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {window}
                  {tradeCount > 0 && (
                    <span className="ml-2 text-xs opacity-75">
                      ({tradeCount})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDeltas}
                onChange={(e) => setShowDeltas(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Show Δ vs 1h</span>
            </label>
            
            {currentMetrics.alerts && currentMetrics.alerts.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-red-600">
                  🔴 {currentMetrics.alerts.length} Alert{currentMetrics.alerts.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Instrument Cards and Order Flow */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {instrumentDetails.map(({ instrument, detail }) => (
            <InstrumentCard
              key={instrument}
              instrument={instrument}
              detail={detail}
              formatNotional={formatNotional}
              formatRate={formatRate}
              showDelta={showDeltas}
              referenceDetail={referenceMetrics?.instrument_metrics[instrument]}
            />
          ))}
          
          {/* Order Flow Indicator */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Flow</h3>
            <OrderFlowBar
              direction={currentMetrics.flow_metrics.net_flow_direction}
              intensity={currentMetrics.flow_metrics.flow_intensity}
              buyVolumeRatio={currentMetrics.flow_metrics.buy_volume_ratio}
            />
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Dominant:</span>
                <span className="font-medium">{currentMetrics.flow_metrics.dominant_instrument}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">New Trades:</span>
                <span className="font-medium">{currentMetrics.flow_metrics.new_trades_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Large Blocks:</span>
                <span className="font-medium text-orange-600">
                  {currentMetrics.flow_metrics.large_block_count} &gt;500M
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Spread Monitor */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Spread Monitor (EUR IRS)</h3>
          <SpreadMonitorTable spreadMetrics={currentMetrics.spread_metrics} />
        </div>

        {/* Metrics Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Volatility */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Volatility</h3>
            <VolatilityGauge
              value={currentMetrics.volatility_metrics.realized_volatility}
              percentile={currentMetrics.volatility_metrics.volatility_percentile}
            />
            <div className="mt-4 space-y-2 text-sm">
              <div className="font-medium text-gray-700">Rate Velocity (bps/min):</div>
              {Object.entries(currentMetrics.volatility_metrics.rate_velocity).map(([instrument, velocity]) => (
                <div key={instrument} className="flex justify-between">
                  <span className="text-gray-600">{instrument}:</span>
                  <span className="font-mono">{velocity > 0 ? '+' : ''}{velocity.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Execution Quality */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Execution Quality</h3>
            <Gauge
              value={currentMetrics.execution_metrics.execution_quality_score}
              min={0}
              max={100}
              thresholds={{ low: 40, medium: 60, high: 80 }}
              label="Quality Score"
              size={120}
            />
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Slippage:</span>
                <span className="font-mono">{currentMetrics.execution_metrics.avg_slippage.toFixed(2)} bps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Spread Cross:</span>
                <span className="font-mono">{currentMetrics.execution_metrics.spread_crossing_rate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Effective Spread:</span>
                <span className="font-mono">{currentMetrics.execution_metrics.effective_spread.toFixed(2)} bps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">VWAP Dev:</span>
                <span className="font-mono">{currentMetrics.execution_metrics.vwap_deviation.toFixed(2)} bps</span>
              </div>
            </div>
          </div>

          {/* Price Impact */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Price Impact</h3>
            <PriceImpactIndicator
              impactByBucket={currentMetrics.price_impact_metrics.impact_by_size_bucket}
              maxImpactTrade={currentMetrics.price_impact_metrics.max_impact_trade}
              recoveryVelocity={currentMetrics.price_impact_metrics.impact_velocity}
            />
          </div>
        </div>

        {/* Forward Curve & Historical Context */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Forward Curve */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Forward Curve Analysis</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Shape:</span>
                <span className="font-medium">{currentMetrics.forward_curve_metrics.curve_shape}</span>
              </div>
              {Object.keys(currentMetrics.forward_curve_metrics.spot_vs_forward).length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">Spot vs Forward:</div>
                  {Object.entries(currentMetrics.forward_curve_metrics.spot_vs_forward).map(([instrument, spread]) => (
                    <div key={instrument} className="flex justify-between text-sm">
                      <span className="text-gray-600">{instrument}:</span>
                      <span className="font-mono">{spread > 0 ? '+' : ''}{spread.toFixed(2)} bps</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Historical Context */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Historical Context</h3>
            <div className="space-y-3">
              {Object.entries(currentMetrics.historical_context.percentile_30d).slice(0, 5).map(([key, percentile]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{key}:</span>
                  <div className="flex items-center space-x-2">
                    <PercentileBadge percentile={percentile} />
                    {currentMetrics.historical_context.z_score[key] !== undefined && (
                      <span className={`text-xs font-mono ${
                        Math.abs(currentMetrics.historical_context.z_score[key]) > 2 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        (z: {currentMetrics.historical_context.z_score[key].toFixed(1)})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alerts Panel */}
        {currentMetrics.alerts && currentMetrics.alerts.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Alerts</h3>
            <div className="space-y-2">
              {currentMetrics.alerts.map((alert) => (
                <AlertBadge key={alert.alert_id} alert={alert} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Instrument Card Component
interface InstrumentCardProps {
  instrument: string;
  detail: InstrumentDetail;
  formatNotional: (value: number) => string;
  formatRate: (rate: number | null) => string;
  showDelta?: boolean;
  referenceDetail?: InstrumentDetail;
}

function InstrumentCard({ instrument, detail, formatNotional, formatRate, showDelta, referenceDetail }: InstrumentCardProps) {
  const deltaMid = showDelta && referenceDetail?.mid !== undefined && detail.mid !== undefined
    ? (detail.mid - referenceDetail.mid) * 100 // Convert to bps
    : null;

  // Generate sparkline data (simplified - would need actual rate history)
  const sparklineData = useMemo(() => {
    // Placeholder: generate some sample data
    const data: number[] = [];
    if (detail.high !== null && detail.low !== null) {
      const range = detail.high - detail.low;
      for (let i = 0; i < 10; i++) {
        data.push(detail.low + (range * Math.random()));
      }
    }
    return data;
  }, [detail.high, detail.low]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900">{instrument} EUR IRS</h3>
        <div className="text-right">
          <div className="text-sm text-gray-600">Volume</div>
          <div className="text-lg font-semibold">{formatNotional(detail.volume)}€</div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">HIGH</span>
          <span className="font-mono text-sm">{formatRate(detail.high)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">VWAP</span>
          <span className="font-mono text-sm font-semibold">{formatRate(detail.vwap)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">MID</span>
          <span className="font-mono text-sm">{formatRate(detail.mid)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">LOW</span>
          <span className="font-mono text-sm">{formatRate(detail.low)}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-sm text-gray-600">LAST</span>
          <span className={`font-mono text-sm font-bold ${
            detail.last !== null && detail.vwap !== null
              ? detail.last > detail.vwap ? 'text-green-600' : 'text-red-600'
              : ''
          }`}>
            {formatRate(detail.last)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
        <div>
          <div className="text-gray-600">Spread</div>
          <div className="font-mono">{detail.bid_ask_spread !== null ? `${detail.bid_ask_spread.toFixed(1)} bps` : '-'}</div>
        </div>
        <div>
          <div className="text-gray-600">Volatility</div>
          <div className="font-mono">{detail.volatility !== null ? `${detail.volatility.toFixed(1)}%` : '-'}</div>
        </div>
        <div>
          <div className="text-gray-600">Impact</div>
          <div className="font-mono">{detail.price_impact !== null ? `${detail.price_impact.toFixed(2)} bps/100M` : '-'}</div>
        </div>
        <div>
          <div className="text-gray-600">Trades</div>
          <div className="font-mono">{detail.trade_count}</div>
        </div>
      </div>

      {showDelta && deltaMid !== null && (
        <div className="mt-2 pt-2 border-t text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">Δ vs 1h:</span>
            <span className={`font-mono font-semibold ${deltaMid > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {deltaMid > 0 ? '+' : ''}{deltaMid.toFixed(1)} bps
            </span>
          </div>
        </div>
      )}

      <div className="mt-2">
        <MiniSparkline data={sparklineData} width={200} height={30} />
      </div>
    </div>
  );
}

// Spread Monitor Table Component
interface SpreadMonitorTableProps {
  spreadMetrics: ProTraderMetrics['spread_metrics'];
}

function SpreadMonitorTable({ spreadMetrics }: SpreadMonitorTableProps) {
  const spreads = [
    { name: '5Y-10Y', detail: spreadMetrics.spread_5y_10y },
    { name: '10Y-30Y', detail: spreadMetrics.spread_10y_30y },
    { name: '2Y-10Y', detail: spreadMetrics.spread_2y_10y },
    { name: '2Y-30Y', detail: spreadMetrics.spread_2y_30y },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Spread
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Current
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              High
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Low
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Change
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Z-Score
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Alert
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {spreads.map(({ name, detail }) => (
            <tr key={name} className={Math.abs(detail.change_bps) > 1 ? 'bg-yellow-50' : ''}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                {detail.current.toFixed(1)} bps
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                {detail.high.toFixed(1)} bps
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                {detail.low.toFixed(1)} bps
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <SpreadBadge
                  value={detail.change_bps}
                  showZScore={detail.z_score !== null && Math.abs(detail.z_score) > 2}
                  zScore={detail.z_score}
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {detail.z_score !== null ? (
                  <span className={`font-mono ${
                    Math.abs(detail.z_score) > 2 ? 'text-red-600 font-bold' : 'text-gray-600'
                  }`}>
                    {detail.z_score > 0 ? '+' : ''}{detail.z_score.toFixed(1)} σ
                  </span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {detail.z_score !== null && Math.abs(detail.z_score) > 2 && (
                  <span className="text-red-600">⚠️</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
