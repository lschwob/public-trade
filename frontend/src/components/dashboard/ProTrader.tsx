import { useMemo, useState } from 'react';
import type { InstrumentDetail, ProTraderMetrics } from '../../types/trade';
import AlertBadge from '../charts/AlertBadge';
import OrderFlowBar from '../charts/OrderFlowBar';
import SpreadBadge from '../charts/SpreadBadge';

interface ProTraderProps {
  proTraderMetrics?: Record<string, ProTraderMetrics>;
}

const TIME_WINDOWS = ['10min', '15min', '20min', '30min', '60min'] as const;
type TimeWindow = typeof TIME_WINDOWS[number];

function formatNotional(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return value.toLocaleString();
}

function formatRatePct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  // Backend uses % already for ProTraderInstrumentDetail fields.
  return `${value.toFixed(3)}%`;
}

function formatBps(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)} bps`;
}

function sumInstrumentMetric(metrics: Record<string, InstrumentDetail> | undefined, pick: (d: InstrumentDetail) => number): number {
  if (!metrics) return 0;
  return Object.values(metrics).reduce((acc, d) => acc + (Number.isFinite(pick(d)) ? pick(d) : 0), 0);
}

export default function ProTrader({ proTraderMetrics }: ProTraderProps) {
  const [activeWindow, setActiveWindow] = useState<TimeWindow>('15min');

  const current = proTraderMetrics?.[activeWindow];
  const m15 = proTraderMetrics?.['15min'];
  const m30 = proTraderMetrics?.['30min'];

  const totals = useMemo(() => {
    const totalVolume = sumInstrumentMetric(current?.instrument_metrics, d => d.volume);
    const totalTrades = sumInstrumentMetric(current?.instrument_metrics, d => d.trade_count);
    const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;

    return {
      totalVolume,
      totalTrades,
      avgTradeSize,
      newTrades: current?.flow_metrics.new_trades_count ?? 0,
      largeBlocks: current?.flow_metrics.large_block_count ?? 0,
      buyRatio: current?.flow_metrics.buy_volume_ratio ?? 0,
      netFlow: current?.flow_metrics.net_flow_direction ?? 'BALANCED',
      intensity: current?.flow_metrics.flow_intensity ?? 0,
      dominant: current?.flow_metrics.dominant_instrument ?? '—',
      alertsCount: current?.alerts?.length ?? 0,
    };
  }, [current]);

  const volume15v30 = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(m15?.instrument_metrics ?? {}),
      ...Object.keys(m30?.instrument_metrics ?? {}),
    ]);

    const rows = Array.from(keys).map((instrument) => {
      const d15 = m15?.instrument_metrics?.[instrument];
      const d30 = m30?.instrument_metrics?.[instrument];

      const v15 = d15?.volume ?? 0;
      const v30 = d30?.volume ?? 0;
      const t15 = d15?.trade_count ?? 0;
      const t30 = d30?.trade_count ?? 0;
      const avg15 = t15 > 0 ? v15 / t15 : 0;

      const direction15 = m15?.flow_metrics.flow_by_instrument?.[instrument] ?? null;

      return {
        instrument,
        v15,
        v30,
        t15,
        t30,
        avg15,
        direction15,
      };
    });

    const max15 = Math.max(1, ...rows.map(r => r.v15));
    const sorted = rows
      .filter(r => r.v15 > 0 || r.v30 > 0)
      .sort((a, b) => b.v15 - a.v15);

    return { rows: sorted, max15 };
  }, [m15, m30]);

  const topRates = useMemo(() => {
    const focus = ['2Y', '5Y', '10Y', '30Y'];
    const metrics = current?.instrument_metrics ?? {};
    return focus
      .map(i => ({ instrument: i, d: metrics[i] }))
      .filter((x): x is { instrument: string; d: InstrumentDetail } => Boolean(x.d));
  }, [current]);

  if (!current) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No pro trader data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="text-sm text-gray-500">EUR IRS — Trader Dashboard</div>
            <div className="text-lg font-semibold text-gray-900">Flow • Volumes • Spreads</div>
          </div>

          <div className="flex items-center gap-2">
            {TIME_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setActiveWindow(w)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeWindow === w
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Snapshot */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-xs text-gray-500">Volume ({activeWindow})</div>
            <div className="text-2xl font-bold text-gray-900">{formatNotional(totals.totalVolume)}€</div>
            <div className="mt-2 text-sm text-gray-600 flex justify-between">
              <span>Trades</span>
              <span className="font-mono text-gray-900">{totals.totalTrades}</span>
            </div>
            <div className="text-sm text-gray-600 flex justify-between">
              <span>Avg size</span>
              <span className="font-mono text-gray-900">{formatNotional(totals.avgTradeSize)}€</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-xs text-gray-500">Net flow</div>
            <div className="mt-2">
              <OrderFlowBar
                direction={totals.netFlow}
                intensity={totals.intensity}
                buyVolumeRatio={totals.buyRatio}
              />
            </div>
            <div className="mt-3 text-sm text-gray-600 flex justify-between">
              <span>Dominant</span>
              <span className="font-semibold text-gray-900">{totals.dominant}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-xs text-gray-500">Tape</div>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">New prints</span>
                <span className="font-mono text-gray-900">{totals.newTrades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Blocks &gt;500M</span>
                <span className="font-mono text-orange-700">{totals.largeBlocks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Buy ratio</span>
                <span className="font-mono text-gray-900">{Math.round(totals.buyRatio * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-xs text-gray-500">Alerts</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{totals.alertsCount}</div>
            <div className="text-sm text-gray-600 mt-2">
              {totals.alertsCount === 0 ? 'No active alerts' : 'See below'}
            </div>
          </div>
        </div>

        {/* Volumes 15m vs 30m */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Volumes by instrument</div>
              <div className="text-lg font-semibold text-gray-900">15 min vs 30 min</div>
            </div>
            <div className="text-xs text-gray-500">
              Source: `pro_trader_metrics['15min']` & `['30min']`
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Instrument</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flow (15m)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Vol (15m)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Trades</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Avg size</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Vol (30m)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {volume15v30.rows.slice(0, 20).map((r) => {
                  const barW = Math.max(2, Math.round((r.v15 / volume15v30.max15) * 140));
                  const flowColor =
                    r.direction15 === 'BUY_PRESSURE'
                      ? 'text-green-700 bg-green-50'
                      : r.direction15 === 'SELL_PRESSURE'
                      ? 'text-red-700 bg-red-50'
                      : 'text-gray-700 bg-gray-50';

                  return (
                    <tr key={r.instrument} className="hover:bg-gray-50/60">
                      <td className="px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <div className="flex items-center gap-3">
                          <span className="w-14">{r.instrument}</span>
                          <div className="h-2 rounded bg-blue-100" style={{ width: 140 }}>
                            <div className="h-2 rounded bg-blue-500" style={{ width: barW }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${flowColor}`}>{r.direction15 ?? '—'}</span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-900">
                        {formatNotional(r.v15)}€
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">{r.t15}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                        {formatNotional(r.avg15)}€
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                        {formatNotional(r.v30)}€
                      </td>
                    </tr>
                  );
                })}
                {volume15v30.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                      No instrument activity in 15m/30m windows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rates & microstructure (focus tenors) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="text-sm text-gray-500">Rates snapshot</div>
              <div className="text-lg font-semibold text-gray-900">Key tenors ({activeWindow})</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenor</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Mid</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">High</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Low</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Bid/ask</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Vol</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {topRates.map(({ instrument, d }) => (
                    <tr key={instrument} className="hover:bg-gray-50/60">
                      <td className="px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{instrument}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-900">{formatRatePct(d.mid)}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">{formatRatePct(d.high)}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">{formatRatePct(d.low)}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">{formatBps(d.bid_ask_spread, 1)}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">{d.volatility !== null ? `${d.volatility.toFixed(1)}%` : '-'}</td>
                    </tr>
                  ))}
                  {topRates.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                        No key-tenor metrics available in this window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Spreads */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="text-sm text-gray-500">Curve</div>
              <div className="text-lg font-semibold text-gray-900">Core spreads (EUR IRS)</div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spread</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Current</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Change</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Z</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {[
                    { name: '2s5s', d: current.spread_metrics.spread_2y_5y },
                    { name: '5s10s', d: current.spread_metrics.spread_5y_10y },
                    { name: '10s30s', d: current.spread_metrics.spread_10y_30y },
                    { name: '2s10s', d: current.spread_metrics.spread_2y_10y },
                    { name: '2s30s', d: current.spread_metrics.spread_2y_30y },
                  ].map(({ name, d }) => (
                    <tr key={name} className="hover:bg-gray-50/60">
                      <td className="px-6 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{name}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-900">{d.current.toFixed(1)} bps</td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right">
                        <SpreadBadge value={d.change_bps} showZScore={false} zScore={d.z_score} />
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                        {d.z_score === null ? '-' : `${d.z_score > 0 ? '+' : ''}${d.z_score.toFixed(1)}σ`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {current.alerts && current.alerts.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="text-sm text-gray-500">Alerts ({activeWindow})</div>
              <div className="text-lg font-semibold text-gray-900">Actionable signals</div>
            </div>
            <div className="p-6 space-y-2">
              {current.alerts.slice(0, 20).map((a) => (
                <AlertBadge key={a.alert_id} alert={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
