export interface Trade {
  dissemination_identifier: string;
  original_dissemination_identifier?: string;
  action_type: string;
  event_type: string;
  event_timestamp: string;
  execution_timestamp: string;
  effective_date?: string;
  expiration_date?: string;
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

export interface Analytics {
  total_trades: number;
  total_notional_eur: number;
  avg_size_eur: number;
  largest_trade_eur: number;
  strategies_count: number;
  top_underlyings: Array<{ name: string; notional: number }>;
  trades_per_hour: Array<{ hour: string; count: number }>;
  strategy_distribution: Array<{ type: string; count: number }>;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}


