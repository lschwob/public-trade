import type {
  Alert,
  Analytics,
  CurveMetrics,
  CurrencyMetrics,
  FlowMetrics,
  RealTimeMetrics,
  RiskMetrics,
  Strategy,
  StrategyMetrics,
  Trade,
} from '../types/trade';
import { getTradeExecutionMs } from './tradeTime';

const TENOR_ORDER = ['3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '15Y', '20Y', '30Y'] as const;

function safeNumber(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx] ?? 0;
}

function getBaseInstrument(instrument: string): string {
  return instrument.includes('/') ? instrument.split('/')[0] ?? instrument : instrument;
}

function durationEstimate(instrument: string): number {
  const base = getBaseInstrument(instrument);
  const map: Record<string, number> = {
    '3M': 0.25,
    '6M': 0.5,
    '1Y': 0.95,
    '2Y': 1.9,
    '3Y': 2.85,
    '5Y': 4.5,
    '7Y': 6.2,
    '10Y': 8.0,
    '15Y': 11.5,
    '20Y': 14.5,
    '30Y': 18.0,
  };
  return map[base] ?? 5.0;
}

function hhi(volumes: Record<string, number>): number {
  const total = Object.values(volumes).reduce((a, b) => a + safeNumber(b), 0);
  if (total <= 0) return 0;
  const sumSq = Object.values(volumes).reduce((acc, v) => {
    const share = safeNumber(v) / total;
    return acc + share * share;
  }, 0);
  return sumSq * 10000;
}

function formatHourKeyFromMs(ms: number): string {
  if (!ms) return 'Unknown';
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return 'Unknown';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:00`;
}

function isInLastMinutesMs(ms: number, nowMs: number, minutes: number): boolean {
  if (!ms) return false;
  return ms >= nowMs - minutes * 60_000;
}

function instrumentSortKey(instrument: string): number {
  const base = getBaseInstrument(instrument);
  const idx = TENOR_ORDER.indexOf(base as any);
  return idx >= 0 ? idx : 999;
}

function buildCurveMetrics(trades: Trade[]): CurveMetrics {
  const instrumentData = new Map<string, { notional: number; count: number; rates: number[] }>();

  for (const t of trades) {
    if (!t.instrument) continue;
    const notional = safeNumber(t.notional_eur);
    if (notional <= 0) continue;

    const entry = instrumentData.get(t.instrument) ?? { notional: 0, count: 0, rates: [] };
    entry.notional += notional;
    entry.count += 1;
    if (t.fixed_rate_leg1 !== null && t.fixed_rate_leg1 !== undefined && Number.isFinite(t.fixed_rate_leg1)) {
      entry.rates.push(t.fixed_rate_leg1);
    }
    instrumentData.set(t.instrument, entry);
  }

  const instrument_distribution: CurveMetrics['instrument_distribution'] = [];
  const average_rate_by_instrument: Record<string, number> = {};

  for (const [instrument, data] of instrumentData.entries()) {
    const avg_rate = data.rates.length > 0 ? data.rates.reduce((a, b) => a + b, 0) / data.rates.length : null;
    instrument_distribution.push({
      instrument,
      notional: data.notional,
      count: data.count,
      avg_rate,
    });
    if (avg_rate !== null) average_rate_by_instrument[instrument] = avg_rate;
  }

  instrument_distribution.sort((a, b) => instrumentSortKey(a.instrument) - instrumentSortKey(b.instrument));

  const instrument_spread: Record<string, number> = {};
  if (average_rate_by_instrument['10Y'] !== undefined && average_rate_by_instrument['2Y'] !== undefined) {
    instrument_spread['10Y-2Y'] = average_rate_by_instrument['10Y'] - average_rate_by_instrument['2Y'];
  }
  if (average_rate_by_instrument['30Y'] !== undefined && average_rate_by_instrument['10Y'] !== undefined) {
    instrument_spread['30Y-10Y'] = average_rate_by_instrument['30Y'] - average_rate_by_instrument['10Y'];
  }

  const now = new Date().toISOString();
  const rate_evolution: CurveMetrics['rate_evolution'] = [{ timestamp: now, ...average_rate_by_instrument }];

  return { instrument_distribution, rate_evolution, instrument_spread, average_rate_by_instrument };
}

function buildFlowMetrics(trades: Trade[]): FlowMetrics {
  const action_breakdown: Record<string, number> = {};
  const platformData = new Map<string, { notional: number; count: number }>();

  for (const t of trades) {
    action_breakdown[t.action_type] = (action_breakdown[t.action_type] ?? 0) + 1;
    const platform = t.platform_identifier || 'Unknown';
    const entry = platformData.get(platform) ?? { notional: 0, count: 0 };
    entry.notional += safeNumber(t.notional_eur);
    entry.count += 1;
    platformData.set(platform, entry);
  }

  const total_notional = Array.from(platformData.values()).reduce((a, b) => a + b.notional, 0);
  const platform_market_share = Array.from(platformData.entries())
    .map(([platform, d]) => ({
      platform,
      notional: d.notional,
      percentage: total_notional > 0 ? (d.notional / total_notional) * 100 : 0,
    }))
    .sort((a, b) => b.notional - a.notional);

  const avg_trade_size_by_platform = Array.from(platformData.entries())
    .map(([platform, d]) => ({
      platform,
      avg_size: d.count > 0 ? d.notional / d.count : 0,
    }))
    .sort((a, b) => b.avg_size - a.avg_size);

  const flow_direction: Record<string, number> = {
    new: action_breakdown['NEWT'] ?? 0,
    modified: action_breakdown['MODI'] ?? 0,
    terminated: action_breakdown['TERM'] ?? 0,
  };

  return { action_breakdown, platform_market_share, flow_direction, avg_trade_size_by_platform };
}

function buildRiskMetrics(trades: Trade[]): RiskMetrics {
  let total_dv01 = 0;
  const notionals: number[] = [];
  const underlyingVolumes: Record<string, number> = {};

  for (const t of trades) {
    const notional = safeNumber(t.notional_eur);
    if (notional <= 0) continue;
    notionals.push(notional);

    const inst = t.instrument;
    if (inst) {
      total_dv01 += notional * durationEstimate(inst) * 0.0001;
    }

    const under = t.unique_product_identifier_underlier_name || 'Unknown';
    underlyingVolumes[under] = (underlyingVolumes[under] ?? 0) + notional;
  }

  const buckets: Record<string, number> = {
    '<100M': 0,
    '100M-500M': 0,
    '500M-1B': 0,
    '1B-5B': 0,
    '>5B': 0,
  };
  for (const n of notionals) {
    if (n < 100_000_000) buckets['<100M'] += 1;
    else if (n < 500_000_000) buckets['100M-500M'] += 1;
    else if (n < 1_000_000_000) buckets['500M-1B'] += 1;
    else if (n < 5_000_000_000) buckets['1B-5B'] += 1;
    else buckets['>5B'] += 1;
  }
  const notional_distribution = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

  const sorted = [...notionals].sort((a, b) => a - b);
  const percentiles: Record<string, number> = {
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };

  const concentration_hhi = hhi(underlyingVolumes);
  const total = Object.values(underlyingVolumes).reduce((a, b) => a + b, 0);
  const top5 = Object.values(underlyingVolumes).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
  const top5_concentration = total > 0 ? (top5 / total) * 100 : 0;

  return { total_dv01, notional_distribution, concentration_hhi, top5_concentration, percentiles };
}

function normalizeRateToPercent(rate: number): number {
  // heuristic matching UI: if abs(rate) > 1 it's already percent (e.g. 3.5), else decimal (0.035)
  return Math.abs(rate) > 1 ? rate : rate * 100;
}

function buildRealTimeMetrics(trades: Trade[], alerts: Alert[] | undefined): RealTimeMetrics {
  const nowMs = Date.now();
  const vol5 = trades.filter(t => isInLastMinutesMs(getTradeExecutionMs(t), nowMs, 5)).reduce((a, t) => a + safeNumber(t.notional_eur), 0);
  const vol15 = trades.filter(t => isInLastMinutesMs(getTradeExecutionMs(t), nowMs, 15)).reduce((a, t) => a + safeNumber(t.notional_eur), 0);
  const vol60 = trades.filter(t => isInLastMinutesMs(getTradeExecutionMs(t), nowMs, 60)).reduce((a, t) => a + safeNumber(t.notional_eur), 0);
  const trades5 = trades.reduce((a, t) => a + (isInLastMinutesMs(getTradeExecutionMs(t), nowMs, 5) ? 1 : 0), 0);

  const alertCount = (alerts ?? []).reduce((a, al) => a + (isInLastMinutesMs(new Date(al.timestamp).getTime(), nowMs, 60) ? 1 : 0), 0);

  // Liquidity score: lightweight heuristic (0..100)
  const score = Math.max(
    0,
    Math.min(
      100,
      trades5 * 6 + Math.log10(vol15 + 1) * 8 // rough scaling
    )
  );

  // Rate velocity (bps/hour) by instrument using last-hour prints
  const byInstrument = new Map<string, Array<{ ts: number; ratePct: number }>>();
  for (const t of trades) {
    if (!t.instrument || t.fixed_rate_leg1 === null || t.fixed_rate_leg1 === undefined) continue;
    const ts = getTradeExecutionMs(t);
    if (!Number.isFinite(ts) || ts < nowMs - 60 * 60_000) continue;
    const ratePct = normalizeRateToPercent(t.fixed_rate_leg1);
    const arr = byInstrument.get(t.instrument) ?? [];
    arr.push({ ts, ratePct });
    byInstrument.set(t.instrument, arr);
  }
  const rate_velocity: Record<string, number> = {};
  for (const [instrument, pts] of byInstrument.entries()) {
    if (pts.length < 2) continue;
    pts.sort((a, b) => a.ts - b.ts);
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const hours = Math.max(1e-6, (last.ts - first.ts) / (60 * 60_000));
    const deltaBps = (last.ratePct - first.ratePct) * 100; // 1% = 100 bps
    rate_velocity[instrument] = deltaBps / hours;
  }

  return {
    volume_last_5min: vol5,
    volume_last_15min: vol15,
    volume_last_hour: vol60,
    trades_last_5min: trades5,
    liquidity_score: score,
    alert_count_last_hour: alertCount,
    rate_velocity,
  };
}

function buildCurrencyMetrics(trades: Trade[]): CurrencyMetrics {
  const map = new Map<string, { notional: number; count: number }>();
  const heat = new Map<string, number>(); // instrument|currency -> notional

  for (const t of trades) {
    const n = safeNumber(t.notional_eur);
    const c1 = t.notional_currency_leg1 || 'Unknown';
    const c2 = t.notional_currency_leg2 || 'Unknown';
    const inst = t.instrument || 'Unknown';

    const push = (ccy: string) => {
      const e = map.get(ccy) ?? { notional: 0, count: 0 };
      e.notional += n;
      e.count += 1;
      map.set(ccy, e);

      const k = `${inst}::${ccy}`;
      heat.set(k, (heat.get(k) ?? 0) + n);
    };

    push(c1);
    if (c2 !== c1) push(c2);
  }

  const currency_breakdown = Array.from(map.entries())
    .map(([currency, d]) => ({ currency, notional: d.notional, count: d.count }))
    .sort((a, b) => b.notional - a.notional);

  const currency_heatmap = Array.from(heat.entries())
    .map(([k, notional]) => {
      const [instrument, currency] = k.split('::');
      return { instrument: instrument ?? 'Unknown', currency: currency ?? 'Unknown', notional };
    })
    .sort((a, b) => b.notional - a.notional)
    .slice(0, 100);

  return { currency_breakdown, currency_heatmap };
}

function buildStrategyMetrics(strategies: Strategy[], trades: Trade[]): StrategyMetrics {
  const byType = new Map<string, { total: number; count: number; instruments: Set<string>; totalNotional: number }>();
  const instrumentDist = new Map<string, { count: number; totalNotional: number }>();
  let packageCount = 0;
  let customCount = 0;

  const tradeById = new Map(trades.map(t => [t.dissemination_identifier, t]));

  for (const s of strategies) {
    const type = s.strategy_type || 'Unknown';
    const e = byType.get(type) ?? { total: 0, count: 0, instruments: new Set(), totalNotional: 0 };
    e.total += safeNumber(s.total_notional_eur);
    e.totalNotional += safeNumber(s.total_notional_eur);
    e.count += 1;

    for (const leg of s.legs ?? []) {
      // legs can be either string IDs or Leg objects
      const legId = typeof leg === 'string' ? leg : String(leg.id || '');
      const tr = tradeById.get(legId);
      if (tr?.instrument) e.instruments.add(tr.instrument);
    }
    byType.set(type, e);

    // Heuristic: package_transaction_price presence means package
    if (s.package_transaction_price) packageCount += 1;
    else customCount += 1;
  }

  for (const [, e] of byType.entries()) {
    for (const inst of e.instruments) {
      const d = instrumentDist.get(inst) ?? { count: 0, totalNotional: 0 };
      d.count += e.count;
      d.totalNotional += e.totalNotional;
      instrumentDist.set(inst, d);
    }
  }

  const strategy_avg_notional = Array.from(byType.entries()).map(([type, e]) => ({
    type,
    avg_notional: e.count > 0 ? e.total / e.count : 0,
  }));

  const strategy_instrument_preference = Array.from(byType.entries()).map(([type, e]) => ({
    type,
    instruments: Array.from(e.instruments).sort((a, b) => instrumentSortKey(a) - instrumentSortKey(b)),
  }));

  const instrument_distribution = Array.from(instrumentDist.entries())
    .map(([instrument, d]) => ({
      instrument,
      count: d.count,
      total_notional: d.totalNotional,
      avg_notional: d.count > 0 ? d.totalNotional / d.count : 0,
    }))
    .sort((a, b) => b.total_notional - a.total_notional);

  return {
    strategy_avg_notional,
    strategy_instrument_preference,
    package_vs_custom: { package: packageCount, custom: customCount },
    instrument_distribution,
  };
}

export function deriveAnalyticsFromTrades(params: {
  trades: Trade[];
  strategies: Strategy[];
  alerts?: Alert[];
  keepProTraderFrom?: Analytics | null;
  proTraderMetricsOverride?: Analytics['pro_trader_metrics'];
}): Analytics {
  const { trades, strategies, alerts, keepProTraderFrom, proTraderMetricsOverride } = params;

  const total_trades = trades.length;
  const total_notional_eur = trades.reduce((a, t) => a + safeNumber(t.notional_eur), 0);
  const avg_size_eur = total_trades > 0 ? total_notional_eur / total_trades : 0;
  const largest_trade_eur = trades.reduce((m, t) => Math.max(m, safeNumber(t.notional_eur)), 0);

  const underlyingVolumes: Record<string, number> = {};
  for (const t of trades) {
    const u = t.unique_product_identifier_underlier_name || 'Unknown';
    underlyingVolumes[u] = (underlyingVolumes[u] ?? 0) + safeNumber(t.notional_eur);
  }
  const top_underlyings = Object.entries(underlyingVolumes)
    .map(([name, notional]) => ({ name, notional }))
    .sort((a, b) => b.notional - a.notional)
    .slice(0, 10);

  const perHour: Record<string, number> = {};
  for (const t of trades) {
    const k = formatHourKeyFromMs(getTradeExecutionMs(t));
    perHour[k] = (perHour[k] ?? 0) + 1;
  }
  const trades_per_hour = Object.entries(perHour)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([hour, count]) => ({ hour, count }));

  const strategyDist: Record<string, number> = {};
  for (const s of strategies) {
    const type = s.strategy_type || 'Unknown';
    strategyDist[type] = (strategyDist[type] ?? 0) + 1;
  }
  const strategy_distribution = Object.entries(strategyDist).map(([type, count]) => ({ type, count }));

  const curve_metrics = buildCurveMetrics(trades);
  const flow_metrics = buildFlowMetrics(trades);
  const risk_metrics = buildRiskMetrics(trades);
  const realtime_metrics = buildRealTimeMetrics(trades, alerts);
  const currency_metrics = buildCurrencyMetrics(trades);
  const strategy_metrics = buildStrategyMetrics(strategies, trades);

  return {
    total_trades,
    total_notional_eur,
    avg_size_eur,
    largest_trade_eur,
    strategies_count: strategies.length,
    top_underlyings,
    trades_per_hour,
    strategy_distribution,
    curve_metrics,
    flow_metrics,
    risk_metrics,
    realtime_metrics,
    currency_metrics,
    strategy_metrics,
    // Preserve pro-trader metrics from backend (already specialized and expensive)
    pro_trader_metrics: proTraderMetricsOverride ?? keepProTraderFrom?.pro_trader_metrics,
    pro_trader_deltas: keepProTraderFrom?.pro_trader_deltas,
  };
}

