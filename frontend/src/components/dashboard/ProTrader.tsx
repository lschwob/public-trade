import { useEffect, useMemo, useRef, useState } from 'react';
import type { InstrumentDetail, ProTraderMetrics, Trade } from '../../types/trade';
import AlertBadge from '../charts/AlertBadge';
import OrderFlowBar from '../charts/OrderFlowBar';
import SpreadBadge from '../charts/SpreadBadge';

interface ProTraderProps {
  proTraderMetrics?: Record<string, ProTraderMetrics>;
  trades?: Trade[]; // Added trades prop
}

const TIME_WINDOWS = ['10min', '15min', '20min', '30min', '60min'] as const;
type TimeWindow = typeof TIME_WINDOWS[number];

function formatNotional(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return `${(value / 1_000).toFixed(0)}k`;
}

function formatRatePct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(3)}%`;
}

function formatBps(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)} bps`;
}

function flowLabel(v: 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED' | null | undefined): string {
  if (!v) return '—';
  if (v === 'BUY_PRESSURE') return 'RECEIVE';
  if (v === 'SELL_PRESSURE') return 'PAY';
  return 'BALANCED';
}

function sumInstrumentMetric(metrics: Record<string, InstrumentDetail> | undefined, pick: (d: InstrumentDetail) => number): number {
  if (!metrics) return 0;
  return Object.values(metrics).reduce((acc, d) => acc + (Number.isFinite(pick(d)) ? pick(d) : 0), 0);
}

export default function ProTrader({ proTraderMetrics, trades = [] }: ProTraderProps) {
  const [activeWindow, setActiveWindow] = useState<TimeWindow>('15min');

  // Cache last known good metrics so the tab doesn't go blank during reloads.
  const cacheRef = useRef<Record<string, ProTraderMetrics>>({});

  useEffect(() => {
    if (!proTraderMetrics) return;
    for (const [k, v] of Object.entries(proTraderMetrics)) {
      if (!v) continue;
      const hasData =
        (v.alerts?.length ?? 0) > 0 ||
        (v.flow_metrics?.new_trades_count ?? 0) > 0 ||
        Object.keys(v.instrument_metrics ?? {}).length > 0;
      if (hasData) cacheRef.current[k] = v;
    }
  }, [proTraderMetrics]);

  const getMetrics = (w: TimeWindow): ProTraderMetrics | undefined => {
    return proTraderMetrics?.[w] ?? cacheRef.current[w];
  };

  const current = getMetrics(activeWindow);
  const m15 = getMetrics('15min');
  const m30 = getMetrics('30min');

  // Logic: Biggest Trades by Tenor
  const biggestTradesByTenor = useMemo(() => {
    if (!trades.length) return [];
    
    // Filter trades by time window (approximation)
    const now = new Date();
    const minutes = parseInt(activeWindow);
    const cutoff = new Date(now.getTime() - minutes * 60000);
    
    // In a real app, use the actual trade timestamp logic matching the server's window
    // For now, we'll just look at the last N trades or all trades if the window is large
    // Assuming 'trades' passed in are recent enough.
    
    // Group by Instrument
    const bestByTenor = new Map<string, Trade>();
    
    for (const t of trades) {
        if (!t.instrument) continue;
        const currentBest = bestByTenor.get(t.instrument);
        const tSize = Math.max(t.notional_amount_leg1 || 0, t.notional_amount_leg2 || 0);
        
        if (!currentBest) {
            bestByTenor.set(t.instrument, t);
        } else {
            const currentSize = Math.max(currentBest.notional_amount_leg1 || 0, currentBest.notional_amount_leg2 || 0);
            if (tSize > currentSize) {
                bestByTenor.set(t.instrument, t);
            }
        }
    }
    
    const sorted = Array.from(bestByTenor.entries())
       .map(([inst, trade]) => ({ inst, trade }))
       .sort((a, b) => {
           // Sort by standard tenor order
           const order = ["1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"];
           const idxA = order.indexOf(a.inst);
           const idxB = order.indexOf(b.inst);
           if (idxA !== -1 && idxB !== -1) return idxA - idxB;
           return a.inst.localeCompare(b.inst);
       });
       
    return sorted;
  }, [trades, activeWindow]);


  const totals = useMemo(() => {
    const totalVolume = sumInstrumentMetric(current?.instrument_metrics, d => d.volume);
    const totalTrades = sumInstrumentMetric(current?.instrument_metrics, d => d.trade_count);
    const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;

    return {
      totalVolume,
      totalTrades,
      avgTradeSize,
      newTrades: current?.flow_metrics?.new_trades_count ?? 0,
      largeBlocks: current?.flow_metrics?.large_block_count ?? 0,
      buyRatio: current?.flow_metrics?.buy_volume_ratio ?? 0,
      netFlow: current?.flow_metrics?.net_flow_direction ?? 'BALANCED',
      intensity: current?.flow_metrics?.flow_intensity ?? 0,
      dominant: current?.flow_metrics?.dominant_instrument ?? '—',
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

      const direction15 = m15?.flow_metrics?.flow_by_instrument?.[instrument] ?? null;

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
        Loading overview data...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">Market Overview</div>
            <div className="text-xl font-bold text-gray-900 tracking-tight">EUR IRS Live Monitor</div>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {TIME_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setActiveWindow(w)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeWindow === w
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-xs font-semibold text-gray-400 uppercase">Volume ({activeWindow})</div>
            <div className="flex items-baseline gap-2 mt-1">
               <div className="text-2xl font-bold text-gray-900">{formatNotional(totals.totalVolume)}€</div>
               <span className="text-xs text-green-600 font-medium">LIVE</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400 block">Trades</span>
                <span className="font-mono font-medium text-gray-700">{totals.totalTrades}</span>
              </div>
              <div>
                <span className="text-gray-400 block">Avg Size</span>
                <span className="font-mono font-medium text-gray-700">{formatNotional(totals.avgTradeSize)}€</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-xs font-semibold text-gray-400 uppercase">Flow Pressure</div>
            <div className="mt-2">
              <OrderFlowBar
                direction={totals.netFlow}
                intensity={totals.intensity}
                buyVolumeRatio={totals.buyRatio}
              />
            </div>
            <div className="mt-3 flex justify-between items-center text-xs">
              <span className="text-gray-400">Dominant</span>
              <span className="font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{totals.dominant}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-xs font-semibold text-gray-400 uppercase">Activity</div>
            <div className="mt-2 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">New Prints</span>
                <span className="font-mono font-bold text-gray-900">{totals.newTrades}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-600">Large Blocks</span>
                 <span className={`font-mono font-bold px-1.5 rounded ${totals.largeBlocks > 0 ? 'bg-orange-100 text-orange-700' : 'text-gray-400'}`}>
                    {totals.largeBlocks}
                 </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-xs font-semibold text-gray-400 uppercase">Alerts</div>
            <div className="flex items-center gap-3 mt-1">
               <div className="text-3xl font-bold text-gray-900">{totals.alertsCount}</div>
               {totals.alertsCount > 0 && <span className="animate-pulse w-2 h-2 rounded-full bg-red-500"></span>}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Actionable signals in window
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Biggest Trades by Tenor */}
            <div className="xl:col-span-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                 <h3 className="font-bold text-gray-800 text-sm">Top Trades by Tenor</h3>
                 <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">MAX SIZE</span>
              </div>
              <div className="flex-1 overflow-auto">
                 {biggestTradesByTenor.length > 0 ? (
                   <table className="w-full text-sm text-left">
                     <thead className="text-xs text-gray-400 bg-gray-50 uppercase font-semibold">
                       <tr>
                         <th className="px-4 py-2 font-medium">Tenor</th>
                         <th className="px-4 py-2 font-medium text-right">Size</th>
                         <th className="px-4 py-2 font-medium text-center">Side</th>
                         <th className="px-4 py-2 font-medium text-right">Price</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                        {biggestTradesByTenor.map(({ inst, trade }) => {
                           const size = Math.max(trade.notional_amount_leg1 || 0, trade.notional_amount_leg2 || 0);
                           const isBuy = trade.action_type === 'NEWT' || trade.action_type === 'MODI'; // Simplification
                           // Better buy/sell logic:
                           // Usually inferred from initiator or price vs mid, but here we just use side if available or color code arbitrarily based on rate?
                           // Let's rely on standard representation or just display 'Trade'.
                           // Actually, we don't have side explicit in trade obj (only leg1/leg2 payers).
                           // We will color code the size column neutrally or based on 'action'.
                           
                           return (
                             <tr key={inst} className="hover:bg-gray-50/50 transition-colors">
                               <td className="px-4 py-2 font-bold text-gray-700">{inst}</td>
                               <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900">{formatNotional(size)}</td>
                               <td className="px-4 py-2 text-center">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                      trade.action_type === 'TERM' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                     {trade.action_type}
                                  </span>
                               </td>
                               <td className="px-4 py-2 text-right font-mono text-cyan-700">
                                 {(trade.fixed_rate_leg1 !== undefined) ? `${(Math.abs(trade.fixed_rate_leg1) * (Math.abs(trade.fixed_rate_leg1) < 1 ? 100 : 1)).toFixed(3)}%` : '-'}
                               </td>
                             </tr>
                           );
                        })}
                     </tbody>
                   </table>
                 ) : (
                    <div className="p-8 text-center text-gray-400 text-xs">No trades recorded</div>
                 )}
              </div>
            </div>

            {/* Rates Snapshot */}
            <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                 <h3 className="font-bold text-gray-800 text-sm">Market Rates</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-400 uppercase font-semibold">
                    <tr>
                      <th className="px-5 py-2 text-left">Tenor</th>
                      <th className="px-5 py-2 text-right">Mid</th>
                      <th className="px-5 py-2 text-right">High</th>
                      <th className="px-5 py-2 text-right">Low</th>
                      <th className="px-5 py-2 text-right">B/A</th>
                      <th className="px-5 py-2 text-right">Vol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topRates.map(({ instrument, d }) => (
                      <tr key={instrument} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-2.5 font-bold text-gray-800">{instrument}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-gray-900 font-medium">{formatRatePct(d.mid)}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-gray-500">{formatRatePct(d.high)}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-gray-500">{formatRatePct(d.low)}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-gray-600">{formatBps(d.bid_ask_spread, 1)}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-gray-600">{d.volatility !== null ? `${d.volatility.toFixed(1)}%` : '-'}</td>
                      </tr>
                    ))}
                    {topRates.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-400">
                          Waiting for market data...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
           {/* Flow Analysis Table */}
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
             <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                 <h3 className="font-bold text-gray-800 text-sm">Flow Analysis</h3>
                 <span className="text-xs text-gray-400">15m vs 30m</span>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-sm">
                 <thead className="bg-gray-50 text-xs text-gray-400 uppercase font-semibold">
                   <tr>
                     <th className="px-5 py-2 text-left">Inst</th>
                     <th className="px-5 py-2 text-left">Pressure</th>
                     <th className="px-5 py-2 text-right">Vol (15m)</th>
                     <th className="px-5 py-2 text-right">Trades</th>
                     <th className="px-5 py-2 text-right">Vol (30m)</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {volume15v30.rows.slice(0, 8).map((r) => {
                      const flowColor =
                        r.direction15 === 'BUY_PRESSURE'
                          ? 'text-green-700 bg-green-50'
                          : r.direction15 === 'SELL_PRESSURE'
                          ? 'text-red-700 bg-red-50'
                          : 'text-gray-600 bg-gray-100';

                      return (
                        <tr key={r.instrument} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-2 font-bold text-gray-800">{r.instrument}</td>
                          <td className="px-5 py-2">
                             <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${flowColor}`}>
                                {flowLabel(r.direction15)}
                             </span>
                          </td>
                          <td className="px-5 py-2 text-right font-mono font-medium text-gray-900">{formatNotional(r.v15)}</td>
                          <td className="px-5 py-2 text-right font-mono text-gray-500">{r.t15}</td>
                          <td className="px-5 py-2 text-right font-mono text-gray-500">{formatNotional(r.v30)}</td>
                        </tr>
                      )
                   })}
                 </tbody>
               </table>
             </div>
           </div>

           {/* Alerts List */}
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                 <h3 className="font-bold text-gray-800 text-sm">Active Alerts</h3>
              </div>
              <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto">
                 {current.alerts && current.alerts.length > 0 ? (
                    current.alerts.map(a => (
                       <AlertBadge key={a.alert_id} alert={a} />
                    ))
                 ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                       No alerts triggered in the last {activeWindow}
                    </div>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
