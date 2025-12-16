/**
 * TypeScript type definitions for trade data structures.
 * 
 * These interfaces mirror the Pydantic models from the backend to ensure
 * type safety across the full stack.
 */

/**
 * Trade interface representing an Interest Rate Swap trade.
 * 
 * This interface represents a normalized trade from the internal API with
 * all computed fields like notional in EUR, tenor, and forward detection.
 */
export interface Trade {
  dissemination_identifier: string;
  original_dissemination_identifier?: string;
  action_type: string;
  event_type: string;
  event_timestamp: string;
  execution_timestamp: string;
  effective_date?: string;
  effective_date_dt?: string;
  expiration_date?: string;
  
  // Forward indicator
  is_forward: boolean;
  notional_amount_leg1: number;
  notional_amount_leg2: number;
  notional_currency_leg1: string;
  notional_currency_leg2: string;
  fixed_rate_leg1?: number;
  fixed_rate_leg2?: number;
  spread_leg1?: number;
  spread_leg2?: number;
  unique_product_identifier: string;
  unique_product_identifier_short_name?: string;
  unique_product_identifier_underlier_name?: string;
  platform_identifier?: string;
  package_indicator: boolean;
  package_transaction_price?: string;
  strategy_id?: string;
  notional_eur?: number;
  instrument?: string;
  package_legs?: Trade[];  // Legs if this is a package trade
  package_legs_count?: number;  // Total number of legs in package
}

/**
 * Strategy interface for multi-leg Interest Rate Swap strategies.
 * 
 * Represents a detected multi-leg strategy such as spreads, butterflies,
 * or curve trades with tenor pair information.
 */
export interface Strategy {
  strategy_id: string;
  strategy_type: string;
  underlying_name: string;
  legs: string[];
  total_notional_eur: number;
  execution_start: string;
  execution_end: string;
  package_transaction_price?: string;
  instrument_pair?: string;       // "10Y/30Y"
  instrument_legs?: string[];     // ["10Y", "30Y"]
}

export interface Alert {
  alert_id: string;
  alert_type: string;
  severity: "critical" | "high" | "medium";
  timestamp: string;
  message: string;
  trade_id?: string;
  strategy_id?: string;
  notional_eur?: number;
}

export interface CurveMetrics {
  instrument_distribution: Array<{ instrument: string; notional: number; count: number; avg_rate: number | null }>;
  rate_evolution: Array<{ timestamp: string; [instrument: string]: number }>;
  instrument_spread: Record<string, number>;
  average_rate_by_instrument: Record<string, number>;
}

export interface FlowMetrics {
  action_breakdown: Record<string, number>;
  platform_market_share: Array<{ platform: string; notional: number; percentage: number }>;
  flow_direction: Record<string, number>;
  avg_trade_size_by_platform: Array<{ platform: string; avg_size: number }>;
}

export interface RiskMetrics {
  total_dv01: number;
  notional_distribution: Array<{ bucket: string; count: number }>;
  concentration_hhi: number;
  top5_concentration: number;
  percentiles: Record<string, number>;
}

export interface RealTimeMetrics {
  volume_last_5min: number;
  volume_last_15min: number;
  volume_last_hour: number;
  trades_last_5min: number;
  liquidity_score: number;
  alert_count_last_hour: number;
  rate_velocity: Record<string, number>;
}

export interface CurrencyMetrics {
  currency_breakdown: Array<{ currency: string; notional: number; count: number }>;
  currency_heatmap: Array<{ instrument: string; currency: string; notional: number }>;
}

export interface StrategyMetrics {
  strategy_avg_notional: Array<{ type: string; avg_notional: number }>;
  strategy_instrument_preference: Array<{ type: string; instruments: string[] }>;
  package_vs_custom: Record<string, number>;
  instrument_pair_distribution: Array<{ instrument_pair: string; count: number; total_notional: number; avg_notional: number }>;
}

export interface Analytics {
  total_trades: number;
  total_notional_eur: number;
  avg_size_eur: number;
  largest_trade_eur: number;
  strategies_count: number;
  top_underlyings: Array<{ name: string; notional: number }>;
  trades_per_hour: Array<{ hour: string; count: number }>;
  strategy_distribution: Array<{ type: string; count: number }>;
  curve_metrics?: CurveMetrics;
  flow_metrics?: FlowMetrics;
  risk_metrics?: RiskMetrics;
  realtime_metrics?: RealTimeMetrics;
  currency_metrics?: CurrencyMetrics;
  strategy_metrics?: StrategyMetrics;
  pro_trader_metrics?: Record<string, ProTraderMetrics>;
  pro_trader_deltas?: ProTraderDelta;
}

// ============================================================================
// Pro Trader Metrics Types for EUR IRS Market Makers
// ============================================================================

export interface InstrumentDetail {
  instrument: string; // "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y", "5Y10Y", etc.
  high: number | null;
  low: number | null;
  mid: number | null;
  vwap: number | null;
  last: number | null;
  volume: number; // en EUR
  trade_count: number;
  avg_trade_size: number; // en EUR
  bid_ask_spread: number | null; // en bps
  volatility: number | null; // annualisée
  price_impact: number | null; // bps pour 100M EUR
}

export interface SpreadDetail {
  current: number; // en bps
  high: number;
  low: number;
  change_bps: number;
  z_score: number | null; // vs historique
}

export interface SpreadMetrics {
  spread_2y_5y: SpreadDetail;
  spread_5y_10y: SpreadDetail;
  spread_10y_30y: SpreadDetail;
  spread_2y_10y: SpreadDetail;
  spread_2y_30y: SpreadDetail;
}

export interface ProFlowMetrics {
  net_flow_direction: 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED';
  flow_intensity: number; // 0-100
  buy_volume_ratio: number; // 0-1
  dominant_instrument: string;
  new_trades_count: number;
  large_block_count: number; // >500M EUR
  flow_by_instrument: Record<string, 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED'>;
}

export interface VolatilityMetrics {
  realized_volatility: number; // annualisée
  rate_velocity: Record<string, number>; // bps/min par instrument
  volatility_by_instrument: Record<string, number>;
  volatility_percentile: number; // vs 30j
}

export interface ExecutionMetrics {
  avg_slippage: number; // bps
  spread_crossing_rate: number; // %
  effective_spread: number; // bps
  vwap_deviation: number; // bps
  execution_quality_score: number; // 0-100
}

export interface PriceImpactMetrics {
  impact_by_size_bucket: Record<string, number>; // bps par bucket
  max_impact_trade: {
    trade_id: string;
    impact: number; // bps
    size: number; // EUR
  } | null;
  impact_velocity: number; // minutes pour récupération
}

export interface ForwardCurveMetrics {
  forward_rates: Record<string, number>; // taux forward par instrument
  spot_vs_forward: Record<string, number>; // écart en bps
  curve_shape: 'NORMAL' | 'INVERTED' | 'FLAT' | 'STEEP';
  basis_swaps: Record<string, number>; // instrument basis
}

export interface HistoricalContext {
  percentile_30d: Record<string, number>; // par instrument/spread
  percentile_90d: Record<string, number>;
  z_score: Record<string, number>;
  avg_30d: Record<string, number>;
  avg_90d: Record<string, number>;
  deviation_from_avg: Record<string, number>; // bps
}

export interface ProAlert {
  alert_id: string;
  alert_type: 'ABNORMAL_SPREAD' | 'LARGE_BLOCK' | 'CURVE_INVERSION' | 'VOLATILITY_SPIKE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  instrument: string | null;
  current_value: number;
  threshold: number;
  timestamp: string;
  message: string;
}

export interface ProTraderMetrics {
  time_window: number;
  instrument_metrics: Record<string, InstrumentDetail>;
  spread_metrics: SpreadMetrics;
  flow_metrics: ProFlowMetrics;
  volatility_metrics: VolatilityMetrics;
  execution_metrics: ExecutionMetrics;
  price_impact_metrics: PriceImpactMetrics;
  forward_curve_metrics: ForwardCurveMetrics;
  historical_context: HistoricalContext;
  alerts: ProAlert[];
}

export interface ProTraderDelta {
  // Comparaison entre deux périodes (ex: 10min vs 1h)
  instrument_deltas: Record<string, {
    mid_change: number; // bps
    volume_change: number; // %
    spread_change: number; // bps
  }>;
  spread_deltas: Record<string, number>; // bps
  flow_delta: {
    direction_change: boolean | string;
    intensity_change: number;
  };
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}


