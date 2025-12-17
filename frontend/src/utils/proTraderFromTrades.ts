import type { ProTraderMetrics, Trade } from '../types/trade';

const WINDOWS: Array<{ key: string; minutes: number }> = [
  { key: '10min', minutes: 10 },
  { key: '15min', minutes: 15 },
  { key: '20min', minutes: 20 },
  { key: '30min', minutes: 30 },
  { key: '60min', minutes: 60 },
];

function safe(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function toMs(ts: string): number {
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : 0;
}

function normalizeRateToDecimal(rate: number): number {
  // Trades can arrive as 0.035 or 3.5. Convert to decimal.
  return Math.abs(rate) > 1 ? rate / 100 : rate;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function emptyMetrics(minutes: number): ProTraderMetrics {
  return {
    time_window: minutes,
    instrument_metrics: {},
    spread_metrics: {
      spread_2y_5y: { current: 0, high: 0, low: 0, change_bps: 0, z_score: null },
      spread_5y_10y: { current: 0, high: 0, low: 0, change_bps: 0, z_score: null },
      spread_10y_30y: { current: 0, high: 0, low: 0, change_bps: 0, z_score: null },
      spread_2y_10y: { current: 0, high: 0, low: 0, change_bps: 0, z_score: null },
      spread_2y_30y: { current: 0, high: 0, low: 0, change_bps: 0, z_score: null },
    },
    flow_metrics: {
      net_flow_direction: 'BALANCED',
      flow_intensity: 0,
      buy_volume_ratio: 0.5,
      dominant_instrument: '',
      new_trades_count: 0,
      large_block_count: 0,
      flow_by_instrument: {},
    },
    volatility_metrics: {
      realized_volatility: 0,
      rate_velocity: {},
      volatility_by_instrument: {},
      volatility_percentile: 50,
    },
    execution_metrics: {
      avg_slippage: 0,
      spread_crossing_rate: 0,
      effective_spread: 0,
      vwap_deviation: 0,
      execution_quality_score: 0,
    },
    price_impact_metrics: {
      impact_by_size_bucket: {},
      max_impact_trade: null,
      impact_velocity: 0,
    },
    forward_curve_metrics: {
      forward_rates: {},
      spot_vs_forward: {},
      curve_shape: 'FLAT',
      basis_swaps: {},
    },
    historical_context: {
      percentile_30d: {},
      percentile_90d: {},
      z_score: {},
      avg_30d: {},
      avg_90d: {},
      deviation_from_avg: {},
    },
    alerts: [],
  };
}

export function computeProTraderMetricsFromTrades(trades: Trade[]): Record<string, ProTraderMetrics> {
  const nowMs = Date.now();
  const result: Record<string, ProTraderMetrics> = {};

  for (const w of WINDOWS) {
    const cutoff = nowMs - w.minutes * 60_000;
    const recent = trades.filter(t => toMs(t.execution_timestamp) >= cutoff);
    if (recent.length === 0) {
      result[w.key] = emptyMetrics(w.minutes);
      continue;
    }

    // Instrument aggregates
    const instrumentAgg = new Map<
      string,
      { ratesDec: number[]; ratesNotional: Array<{ r: number; n: number }>; vol: number; count: number; last?: { ts: number; rDec: number } }
    >();

    let newTrades = 0;
    let largeBlocks = 0;

    for (const t of recent) {
      if (t.action_type === 'NEWT') newTrades += 1;
      if (safe(t.notional_eur) > 500_000_000) largeBlocks += 1;

      if (!t.instrument) continue;
      if (t.fixed_rate_leg1 === null || t.fixed_rate_leg1 === undefined) continue;
      const n = safe(t.notional_eur);
      if (n <= 0) continue;

      const rDec = normalizeRateToDecimal(t.fixed_rate_leg1);
      const entry = instrumentAgg.get(t.instrument) ?? { ratesDec: [], ratesNotional: [], vol: 0, count: 0 };
      entry.ratesDec.push(rDec);
      entry.ratesNotional.push({ r: rDec, n });
      entry.vol += n;
      entry.count += 1;

      const ts = toMs(t.execution_timestamp);
      if (!entry.last || ts >= entry.last.ts) entry.last = { ts, rDec };

      instrumentAgg.set(t.instrument, entry);
    }

    // Build instrument_metrics (values in % like backend)
    const instrument_metrics: ProTraderMetrics['instrument_metrics'] = {};
    for (const [instrument, a] of instrumentAgg.entries()) {
      if (a.ratesDec.length === 0) continue;
      const high = Math.max(...a.ratesDec) * 100;
      const low = Math.min(...a.ratesDec) * 100;
      const mid = (a.ratesDec.reduce((x, y) => x + y, 0) / a.ratesDec.length) * 100;
      const totalN = a.ratesNotional.reduce((x, y) => x + y.n, 0);
      const vwap = totalN > 0 ? (a.ratesNotional.reduce((x, y) => x + y.r * y.n, 0) / totalN) * 100 : null;
      const last = a.last ? a.last.rDec * 100 : null;

      const sd = stddev(a.ratesDec);
      const bidAsk = sd !== null ? sd * 10000 : null; // bps
      const vol = sd !== null ? sd * Math.sqrt(252) * 100 : null; // %

      instrument_metrics[instrument] = {
        instrument,
        high,
        low,
        mid,
        vwap,
        last,
        volume: a.vol,
        trade_count: a.count,
        avg_trade_size: a.count > 0 ? a.vol / a.count : 0,
        bid_ask_spread: bidAsk,
        volatility: vol,
        price_impact: null,
      };
    }

    // Spreads (bps) using mid rates
    const midPct = (k: string) => instrument_metrics[k]?.mid ?? null; // %
    const spread = (a: string, b: string) => {
      const ma = midPct(a);
      const mb = midPct(b);
      if (ma === null || mb === null) return { current: 0, high: 0, low: 0, change_bps: 0, z_score: null };
      const current = (mb - ma) * 100; // % -> bps
      return { current, high: current * 1.1, low: current * 0.9, change_bps: 0, z_score: null };
    };

    const spread_metrics: ProTraderMetrics['spread_metrics'] = {
      spread_2y_5y: spread('2Y', '5Y'),
      spread_5y_10y: spread('5Y', '10Y'),
      spread_10y_30y: spread('10Y', '30Y'),
      spread_2y_10y: spread('2Y', '10Y'),
      spread_2y_30y: spread('2Y', '30Y'),
    };

    // Order-flow imbalance proxy from rate trends
    // Rates rising ~ pay-fixed pressure; rates falling ~ receive-fixed pressure.
    let buyPressure = 0;
    let sellPressure = 0;
    const flow_by_instrument: Record<string, 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED'> = {};

    for (const [instrument, a] of instrumentAgg.entries()) {
      if (!a.last || a.ratesDec.length < 2) {
        flow_by_instrument[instrument] = 'BALANCED';
        continue;
      }

      // Approx trend: compare first & last after sorting by time
      const pts = recent
        .filter(t => t.instrument === instrument && t.fixed_rate_leg1 !== null && t.fixed_rate_leg1 !== undefined)
        .map(t => ({ ts: toMs(t.execution_timestamp), rDec: normalizeRateToDecimal(t.fixed_rate_leg1!) }))
        .filter(p => p.ts > 0)
        .sort((x, y) => x.ts - y.ts);

      if (pts.length < 2) {
        flow_by_instrument[instrument] = 'BALANCED';
        continue;
      }

      const rateChange = pts[pts.length - 1]!.rDec - pts[0]!.rDec;
      if (rateChange < -0.0001) {
        buyPressure += a.vol;
        flow_by_instrument[instrument] = 'BUY_PRESSURE';
      } else if (rateChange > 0.0001) {
        sellPressure += a.vol;
        flow_by_instrument[instrument] = 'SELL_PRESSURE';
      } else {
        flow_by_instrument[instrument] = 'BALANCED';
      }
    }

    const totalVol = buyPressure + sellPressure;
    const buy_volume_ratio = totalVol > 0 ? buyPressure / totalVol : 0.5;
    const flow_intensity = Math.min((Math.abs(buyPressure - sellPressure) / Math.max(totalVol, 1)) * 100, 100);
    const dominant_instrument =
      Array.from(instrumentAgg.entries()).sort((a, b) => b[1].vol - a[1].vol)[0]?.[0] ?? '';

    let net_flow_direction: 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED' = 'BALANCED';
    if (buyPressure > sellPressure * 1.2) net_flow_direction = 'BUY_PRESSURE';
    else if (sellPressure > buyPressure * 1.2) net_flow_direction = 'SELL_PRESSURE';

    const flow_metrics: ProTraderMetrics['flow_metrics'] = {
      net_flow_direction,
      flow_intensity,
      buy_volume_ratio,
      dominant_instrument,
      new_trades_count: newTrades,
      large_block_count: largeBlocks,
      flow_by_instrument,
    };

    const base = emptyMetrics(w.minutes);
    result[w.key] = {
      ...base,
      instrument_metrics,
      spread_metrics,
      flow_metrics,
    };
  }

  return result;
}

