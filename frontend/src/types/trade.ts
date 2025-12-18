/**
 * TypeScript type definitions for trade data structures.
 * 
 * These interfaces mirror the Pydantic models from the backend to ensure
 * type safety across the full stack.
 */

// ============================================================================
// Leg model - represents a single leg in a strategy from the API
// Matches backend LegAPI model
// ============================================================================

export interface Leg {
  id?: string | number;
  upiIsin?: string;
  upi?: string;
  rateUnderlier?: string;
  eventTime?: string;
  executionTime?: string;
  effectiveDate?: string;
  expirationDate?: string;
  notionalAmountLeg1?: number;
  notionalAmountLeg2?: number;
  platformCode?: string;
  platformName?: string;
  fixedRateLeg1?: number;
  fixedRateLeg2?: number;
  spreadLeg1?: number;
  spreadLeg2?: number;
  packageIndicator?: boolean;
  packageTransactionPrice?: string | number;
  packageSpread?: number;
  tenorLeg1?: string;
  tenorLeg2?: string;
  // Allow additional fields
  [key: string]: unknown;
}

// ============================================================================
// Strategy model - represents a complete strategy from the API
// Matches backend StrategyAPIResponse model
// ============================================================================

export interface Strategy {
  id: string | number;
  strategy_id: string; // Alias for id for backward compatibility
  executionDateTime?: string;
  execution_date_time?: string; // Backend field name
  price?: number;
  ironPrice?: number;
  iron_price?: number; // Backend field name
  product?: string;
  underlier?: string;
  tenor?: string;
  instrument?: string;
  legsCount?: number;
  legs_count?: number; // Backend field name
  notional?: number;
  notionalTruncated?: number;
  notional_truncated?: number; // Backend field name
  platform?: string;
  d2c?: boolean;
  legs: (Leg | string)[]; // Can be Leg objects or leg IDs for backward compatibility
  legs_data?: Leg[]; // Full leg data from API
  
  // Computed fields from backend Strategy model
  strategy_type: string; // Same as product or computed
  underlying_name: string; // Same as underlier
  total_notional_eur: number; // Same as notional
  execution_start: string;
  execution_end: string;
  package_transaction_price?: string;
}

// ============================================================================
// Trade interface - for backward compatibility
// Represents a single trade/leg converted to Trade format
// ============================================================================

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
  package_legs?: Trade[];
  package_legs_count?: number;
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
  rate_evolution: Array<{ timestamp: string; [instrument: string]: number | string }>;
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
  instrument_distribution: Array<{ instrument: string; count: number; total_notional: number; avg_notional: number }>;
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
  instrument: string;
  high: number | null;
  low: number | null;
  mid: number | null;
  vwap: number | null;
  last: number | null;
  volume: number;
  trade_count: number;
  avg_trade_size: number;
  bid_ask_spread: number | null;
  volatility: number | null;
  price_impact: number | null;
}

export interface SpreadDetail {
  current: number;
  high: number;
  low: number;
  change_bps: number;
  z_score: number | null;
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
  flow_intensity: number;
  buy_volume_ratio: number;
  dominant_instrument: string;
  new_trades_count: number;
  large_block_count: number;
  flow_by_instrument: Record<string, 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED'>;
}

export interface VolatilityMetrics {
  realized_volatility: number;
  rate_velocity: Record<string, number>;
  volatility_by_instrument: Record<string, number>;
  volatility_percentile: number;
}

export interface ExecutionMetrics {
  avg_slippage: number;
  spread_crossing_rate: number;
  effective_spread: number;
  vwap_deviation: number;
  execution_quality_score: number;
}

export interface PriceImpactMetrics {
  impact_by_size_bucket: Record<string, number>;
  max_impact_trade: {
    trade_id: string;
    impact: number;
    size: number;
  } | null;
  impact_velocity: number;
}

export interface ForwardCurveMetrics {
  forward_rates: Record<string, number>;
  spot_vs_forward: Record<string, number>;
  curve_shape: 'NORMAL' | 'INVERTED' | 'FLAT' | 'STEEP';
  basis_swaps: Record<string, number>;
}

export interface HistoricalContext {
  percentile_30d: Record<string, number>;
  percentile_90d: Record<string, number>;
  z_score: Record<string, number>;
  avg_30d: Record<string, number>;
  avg_90d: Record<string, number>;
  deviation_from_avg: Record<string, number>;
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
  instrument_deltas: Record<string, {
    mid_change: number;
    volume_change: number;
    spread_change: number;
  }>;
  spread_deltas: Record<string, number>;
  flow_delta: {
    direction_change: boolean | string;
    intensity_change: number;
  };
}

export interface WebSocketMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

// ============================================================================
// Helper functions to convert between formats
// ============================================================================

/**
 * Convert a Leg to a Trade format for backward compatibility
 */
export function legToTrade(leg: Leg, strategyId: string, executionDateTime?: string, instrument?: string): Trade {
  const executionTime = leg.executionTime || leg.eventTime || executionDateTime || new Date().toISOString();
  const notionalLeg1 = leg.notionalAmountLeg1 || 0;
  const notionalLeg2 = leg.notionalAmountLeg2 || notionalLeg1;
  
  // Generate ID from leg data
  let disseminationId = '';
  if (leg.id !== undefined && leg.id !== null) {
    disseminationId = String(leg.id);
  } else if (leg.upiIsin) {
    disseminationId = String(leg.upiIsin);
  } else if (leg.upi) {
    disseminationId = String(leg.upi);
  } else {
    disseminationId = `LEG_${Math.abs(JSON.stringify(leg).split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))}`;
  }
  
  return {
    dissemination_identifier: disseminationId,
    action_type: 'NEWT',
    event_type: 'TRADE',
    event_timestamp: executionTime,
    execution_timestamp: executionTime,
    effective_date: leg.effectiveDate,
    expiration_date: leg.expirationDate,
    is_forward: false, // Will be computed
    notional_amount_leg1: notionalLeg1,
    notional_amount_leg2: notionalLeg2,
    notional_currency_leg1: 'EUR',
    notional_currency_leg2: 'EUR',
    fixed_rate_leg1: leg.fixedRateLeg1,
    fixed_rate_leg2: leg.fixedRateLeg2,
    spread_leg1: leg.spreadLeg1,
    spread_leg2: leg.spreadLeg2,
    unique_product_identifier: leg.upi || 'UNKNOWN',
    unique_product_identifier_underlier_name: leg.rateUnderlier || leg.upi,
    platform_identifier: leg.platformCode || leg.platformName,
    package_indicator: leg.packageIndicator || false,
    package_transaction_price: leg.packageTransactionPrice !== undefined && leg.packageTransactionPrice !== null 
      ? String(leg.packageTransactionPrice) 
      : undefined,
    strategy_id: strategyId,
    notional_eur: notionalLeg1,
    instrument: instrument,
  };
}

/**
 * Normalize a Strategy from the API response
 */
export function normalizeStrategy(data: Partial<Strategy>): Strategy {
  const id = String(data.id || data.strategy_id || '');
  const legs = data.legs || [];
  
  return {
    id,
    strategy_id: id,
    executionDateTime: data.executionDateTime,
    price: data.price,
    ironPrice: data.ironPrice,
    product: data.product,
    underlier: data.underlier,
    tenor: data.tenor,
    instrument: data.instrument,
    legsCount: data.legsCount || legs.length,
    notional: data.notional,
    notionalTruncated: data.notionalTruncated,
    platform: data.platform,
    d2c: data.d2c,
    legs,
    // Computed fields
    strategy_type: data.strategy_type || data.product || classifyStrategyType(legs.length),
    underlying_name: data.underlying_name || data.underlier || '',
    total_notional_eur: data.total_notional_eur || data.notional || 0,
    execution_start: data.execution_start || data.executionDateTime || '',
    execution_end: data.execution_end || data.executionDateTime || '',
    package_transaction_price: data.package_transaction_price,
  };
}

/**
 * Classify strategy type based on leg count
 */
function classifyStrategyType(legCount: number): string {
  if (legCount === 1) return 'Outright';
  if (legCount === 2) return 'Spread';
  if (legCount === 3) return 'Butterfly';
  if (legCount >= 4) return 'Curve';
  return 'Package';
}
