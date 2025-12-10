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
  tenor?: string;
  package_legs?: Trade[];  // Legs if this is a package trade
  package_legs_count?: number;  // Total number of legs in package
  grouped_trades?: Trade[];  // Trades in the same group (same timestamp, underlying, etc.)
  grouped_trades_count?: number;  // Total number of trades in group
  group_id?: string;  // Group identifier
}

export interface Strategy {
  strategy_id: string;
  strategy_type: string;
  underlying_name: string;
  legs: string[];
  total_notional_eur: number;
  execution_start: string;
  execution_end: string;
  package_transaction_price?: string;
  tenor_pair?: string;       // "10Y/30Y"
  tenor_legs?: string[];     // ["10Y", "30Y"]
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
  tenor_distribution: Array<{ tenor: string; notional: number; count: number; avg_rate: number | null }>;
  rate_evolution: Array<{ timestamp: string; [tenor: string]: number }>;
  tenor_spread: Record<string, number>;
  average_rate_by_tenor: Record<string, number>;
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
  currency_heatmap: Array<{ tenor: string; currency: string; notional: number }>;
}

export interface StrategyMetrics {
  strategy_avg_notional: Array<{ type: string; avg_notional: number }>;
  strategy_tenor_preference: Array<{ type: string; tenors: string[] }>;
  package_vs_custom: Record<string, number>;
  tenor_pair_distribution: Array<{ tenor_pair: string; count: number; total_notional: number; avg_notional: number }>;
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
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}


