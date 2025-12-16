"""
Pydantic models for trade data structures.

This module defines all data models used throughout the application using Pydantic
for validation and serialization. Models include:
- Trade: Individual trade data from internal API
- Strategy: Multi-leg strategy classification results
- Alert: Alert notifications
- Analytics: Various analytics metrics and aggregations
- InternalAPIResponse: Response model from internal API
- Leg: Leg model representing a single leg in a strategy

All models use Pydantic BaseModel for automatic validation and JSON serialization.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, validator
import math


class Leg(BaseModel):
    """
    Leg model representing a single leg in a strategy from the internal API.
    
    This model represents all information about a leg in a strategy trade.
    """
    # All leg information fields - flexible structure to accommodate various leg data
    # Common fields that might be present:
    dissemination_identifier: Optional[str] = None
    notional_amount: Optional[float] = None
    notional_currency: Optional[str] = None
    fixed_rate: Optional[float] = None
    spread: Optional[float] = None
    effective_date: Optional[str] = None
    expiration_date: Optional[str] = None
    instrument: Optional[str] = None
    underlying_name: Optional[str] = None
    execution_timestamp: Optional[str] = None
    
    # Allow additional fields
    class Config:
        extra = "allow"


class LegAPI(BaseModel):
    """
    Leg model from the new API structure.
    
    Represents a single leg with all its details from the new API format.
    """
    id: Optional[Union[str, int]] = None
    upiIsin: Optional[str] = None
    upi: Optional[str] = None
    rateUnderlier: Optional[str] = None
    eventTime: Optional[str] = None
    executionTime: Optional[str] = None
    effectiveDate: Optional[str] = None
    expirationDate: Optional[str] = None
    notionalAmountLeg1: Optional[float] = None
    notionalAmountLeg2: Optional[float] = None
    platformCode: Optional[str] = None
    platformName: Optional[str] = None
    fixedRateLeg1: Optional[float] = None
    fixedRateLeg2: Optional[float] = None
    spreadLeg1: Optional[float] = None
    spreadLeg2: Optional[float] = None
    packageIndicator: Optional[bool] = None
    packageTransactionPrice: Optional[Union[str, float, int]] = None
    packageSpread: Optional[float] = None
    tenorLeg1: Optional[str] = None
    tenorLeg2: Optional[str] = None
    
    @validator('packageTransactionPrice', pre=True)
    def handle_nan_package_price(cls, v):
        """Convert NaN, None, or empty values to None."""
        if v is None:
            return None
        if isinstance(v, (float, int)) and (math.isnan(v) or math.isinf(v)):
            return None
        if isinstance(v, str) and (v.lower() in ['nan', 'none', 'null', '']):
            return None
        return str(v) if v is not None else None
    
    @validator('notionalAmountLeg1', 'notionalAmountLeg2', pre=True)
    def handle_notional_amount(cls, v):
        """Convert NaN or inf values to None, and parse string amounts like '20M', '2B'."""
        if v is None:
            return None
        if isinstance(v, (float, int)) and (math.isnan(v) or math.isinf(v)):
            return None
        # Handle string formats like "20M", "2B", "150M"
        if isinstance(v, str):
            v_upper = v.strip().upper()
            if not v_upper or v_upper in ['NAN', 'NONE', 'NULL', '']:
                return None
            try:
                multiplier = 1.0
                cleaned = v_upper.replace(',', '').replace(' ', '').rstrip('+')
                if cleaned.endswith('B'):
                    multiplier = 1_000_000_000
                    cleaned = cleaned[:-1]
                elif cleaned.endswith('M'):
                    multiplier = 1_000_000
                    cleaned = cleaned[:-1]
                elif cleaned.endswith('K'):
                    multiplier = 1_000
                    cleaned = cleaned[:-1]
                return float(cleaned) * multiplier
            except (ValueError, TypeError):
                return None
        return v
    
    @validator('fixedRateLeg1', 'fixedRateLeg2', 
               'spreadLeg1', 'spreadLeg2', 'packageSpread', pre=True)
    def handle_nan_numeric(cls, v):
        """Convert NaN or inf values to None."""
        if v is None:
            return None
        if isinstance(v, (float, int)) and (math.isnan(v) or math.isinf(v)):
            return None
        return v
    
    class Config:
        extra = "allow"


class InternalAPIResponse(BaseModel):
    """
    Response model from the internal API that classifies strategies.
    
    This model represents the structure returned by the internal API:
    - id: Strategy/trade identifier
    - price: Price of the strategy
    - ironprice: Iron price of the strategy
    - date: Date of the trade/strategy
    - legs: List of legs with all their information
    """
    id: str
    price: Optional[float] = None
    ironprice: Optional[float] = None
    date: str  # ISO date string
    legs: List[Leg]
    
    # Allow additional fields that might be present
    class Config:
        extra = "allow"


class StrategyAPIResponse(BaseModel):
    """
    New API response model that contains pre-classified strategies with all information.
    
    This model represents the new API structure where each response is already
    a classified strategy with all legs and strategy information included.
    """
    id: Union[str, int]
    executionDateTime: Optional[str] = None
    price: Optional[float] = None
    ironPrice: Optional[float] = None
    product: Optional[str] = None
    underlier: Optional[str] = None
    tenor: Optional[str] = None
    instrument: Optional[str] = None
    legsCount: Optional[int] = None
    notional: Optional[float] = None
    notionalTruncated: Optional[float] = None
    platform: Optional[str] = None
    d2c: Optional[bool] = None
    legs: List[LegAPI] = []
    
    @validator('id', pre=True)
    def convert_id_to_str(cls, v):
        """Convert id to string regardless of input type."""
        return str(v) if v is not None else None
    
    @validator('notional', 'notionalTruncated', pre=True)
    def handle_notional_amount_strategy(cls, v):
        """Convert NaN or inf values to None, and parse string amounts like '20M', '2B'."""
        if v is None:
            return None
        if isinstance(v, (float, int)) and (math.isnan(v) or math.isinf(v)):
            return None
        # Handle string formats like "20M", "2B", "150M"
        if isinstance(v, str):
            v_upper = v.strip().upper()
            if not v_upper or v_upper in ['NAN', 'NONE', 'NULL', '']:
                return None
            try:
                multiplier = 1.0
                cleaned = v_upper.replace(',', '').replace(' ', '').rstrip('+')
                if cleaned.endswith('B'):
                    multiplier = 1_000_000_000
                    cleaned = cleaned[:-1]
                elif cleaned.endswith('M'):
                    multiplier = 1_000_000
                    cleaned = cleaned[:-1]
                elif cleaned.endswith('K'):
                    multiplier = 1_000
                    cleaned = cleaned[:-1]
                return float(cleaned) * multiplier
            except (ValueError, TypeError):
                return None
        return v
    
    @validator('price', 'ironPrice', pre=True)
    def handle_nan_numeric_price(cls, v):
        """Convert NaN or inf values to None."""
        if v is None:
            return None
        if isinstance(v, (float, int)) and (math.isnan(v) or math.isinf(v)):
            return None
        return v
    
    class Config:
        extra = "allow"


class Trade(BaseModel):
    """
    Normalized trade model representing an Interest Rate Swap trade.
    
    This model represents a single trade from the internal API, normalized and enriched
    with computed fields like notional in EUR, tenor, and forward trade detection.
    
    Attributes:
        dissemination_identifier: Unique identifier for the trade (primary key)
        original_dissemination_identifier: Original ID if trade was modified
        action_type: Trade action type (NEWT, MODI, TERM)
        event_type: Type of event (typically "TRADE")
        event_timestamp: When the event occurred
        execution_timestamp: When the trade was executed
        effective_date: Effective date of the swap (ISO string)
        effective_date_dt: Parsed effective date as datetime
        expiration_date: Expiration/maturity date of the swap
        is_forward: Whether this is a forward-starting swap (execution > 2 days in future)
        notional_amount_leg1: Notional amount for leg 1
        notional_amount_leg2: Notional amount for leg 2
        notional_currency_leg1: Currency for leg 1 (e.g., "USD", "EUR")
        notional_currency_leg2: Currency for leg 2
        fixed_rate_leg1: Fixed rate for leg 1 (as decimal, e.g., 0.025 for 2.5%)
        fixed_rate_leg2: Fixed rate for leg 2
        spread_leg1: Spread for leg 1 (if applicable)
        spread_leg2: Spread for leg 2 (if applicable)
        unique_product_identifier: Product identifier
        unique_product_identifier_short_name: Short name for the product
        unique_product_identifier_underlier_name: Underlying name (e.g., "USD-LIBOR-BBA")
        platform_identifier: Trading platform identifier
        package_indicator: Whether this trade is part of a package
        package_transaction_price: Package transaction price (used for grouping)
        strategy_id: Detected strategy ID (if part of a multi-leg strategy)
        notional_eur: Notional amount converted to EUR
        instrument: Instrument (maturity of swap, e.g., "10Y", "5Y10Y", "30Y")
    """
    dissemination_identifier: str
    original_dissemination_identifier: Optional[str] = None
    action_type: str  # NEWT, MODI, TERM
    event_type: str
    event_timestamp: datetime
    execution_timestamp: datetime
    effective_date: Optional[str] = None
    effective_date_dt: Optional[datetime] = None  # Parsed effective date
    expiration_date: Optional[str] = None
    
    # Forward indicator
    is_forward: bool = False
    
    # Notionals
    notional_amount_leg1: float
    notional_amount_leg2: float
    notional_currency_leg1: str
    notional_currency_leg2: str
    
    # Rates
    fixed_rate_leg1: Optional[float] = None
    fixed_rate_leg2: Optional[float] = None
    spread_leg1: Optional[float] = None
    spread_leg2: Optional[float] = None
    
    # Product info
    unique_product_identifier: str
    unique_product_identifier_short_name: Optional[str] = None
    unique_product_identifier_underlier_name: Optional[str] = None
    
    # Platform
    platform_identifier: Optional[str] = None
    
    # Package indicator
    package_indicator: bool = False
    package_transaction_price: Optional[str] = None
    
    # Strategy (detected)
    strategy_id: Optional[str] = None
    
    # Computed fields
    notional_eur: Optional[float] = None
    instrument: Optional[str] = None  # e.g., "10Y", "5Y10Y", "30Y"
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Strategy(BaseModel):
    """
    Strategy model for multi-leg Interest Rate Swap strategies.
    
    Represents a classified multi-leg strategy such as spreads, butterflies, or curve trades.
    Strategies are pre-classified by the internal API and provided with the trade data.
    
    Attributes:
        strategy_id: Unique identifier for the strategy
        strategy_type: Type of strategy (e.g., "Spread", "Butterfly", "Curve")
        underlying_name: Name of the underlying (e.g., "USD-LIBOR-BBA")
        legs: List of trade dissemination_identifiers that make up this strategy
        total_notional_eur: Sum of all leg notionals in EUR
        execution_start: Timestamp of the first leg execution
        execution_end: Timestamp of the last leg execution
        package_transaction_price: Package price if applicable
    """
    strategy_id: str
    strategy_type: str  # Spread, Butterfly, Curve
    underlying_name: str
    legs: List[str]  # List of dissemination_identifiers
    total_notional_eur: float
    execution_start: datetime
    execution_end: datetime
    package_transaction_price: Optional[str] = None


class Alert(BaseModel):
    """
    Alert model for trade and strategy notifications.
    
    Alerts are generated when trades exceed certain thresholds or when strategies
    are detected. Alerts are sent to connected WebSocket clients in real-time.
    
    Attributes:
        alert_id: Unique identifier for the alert
        alert_type: Type of alert (LargeTrade, StrategyPackage, Trend)
        severity: Alert severity level (critical, high, medium)
        timestamp: When the alert was generated
        message: Human-readable alert message
        trade_id: Associated trade ID (if applicable)
        strategy_id: Associated strategy ID (if applicable)
        notional_eur: Notional amount in EUR that triggered the alert
    """
    alert_id: str
    alert_type: str  # LargeTrade, StrategyPackage, Trend
    severity: str  # critical, high, medium
    timestamp: datetime
    message: str
    trade_id: Optional[str] = None
    strategy_id: Optional[str] = None
    notional_eur: Optional[float] = None


class CurveMetrics(BaseModel):
    """Curve analysis metrics."""
    instrument_distribution: List[dict]  # [{"instrument": str, "notional": float, "count": int, "avg_rate": float}]
    rate_evolution: List[dict]  # [{"timestamp": str, "2Y": float, "5Y": float, "10Y": float, "30Y": float}]
    instrument_spread: Dict[str, float]  # {"10Y-2Y": float, "30Y-10Y": float}
    average_rate_by_instrument: Dict[str, float]  # {"2Y": float, "5Y": float, ...}


class FlowMetrics(BaseModel):
    """Market flow metrics."""
    action_breakdown: Dict[str, int]  # {"NEWT": count, "MODI": count, "TERM": count}
    platform_market_share: List[dict]  # [{"platform": str, "notional": float, "percentage": float}]
    flow_direction: Dict[str, int]  # {"new": float, "modified": float, "terminated": float}
    avg_trade_size_by_platform: List[dict]  # [{"platform": str, "avg_size": float}]


class RiskMetrics(BaseModel):
    """Risk and concentration metrics."""
    total_dv01: float  # Approximation: sum(notional × duration_estimate)
    notional_distribution: List[dict]  # [{"bucket": str, "count": int}] (e.g., "<100M", "100M-500M", etc.)
    concentration_hhi: float  # Herfindahl-Hirschman Index for underlyings
    top5_concentration: float  # % of total notional in top 5 underlyings
    percentiles: Dict[str, float]  # {"p50": float, "p75": float, "p90": float, "p95": float}


class RealTimeMetrics(BaseModel):
    """Real-time market activity metrics."""
    volume_last_5min: float
    volume_last_15min: float
    volume_last_hour: float
    trades_last_5min: int
    liquidity_score: float  # Composite: trades + volume normalized
    alert_count_last_hour: int
    rate_velocity: Dict[str, float]  # {"2Y": float, "5Y": float} - rate change per hour in bps


class CurrencyMetrics(BaseModel):
    """Currency breakdown metrics."""
    currency_breakdown: List[dict]  # [{"currency": str, "notional": float, "count": int}]
    currency_heatmap: List[dict]  # [{"instrument": str, "currency": str, "notional": float}]


class StrategyMetrics(BaseModel):
    """Strategy intelligence."""
    strategy_avg_notional: List[dict]  # [{"type": str, "avg_notional": float}]
    strategy_instrument_preference: List[dict]  # [{"type": str, "instruments": List[str]}]
    package_vs_custom: Dict[str, int]  # {"package": count, "custom": count}
    instrument_distribution: List[dict]  # [{"instrument": "10Y/30Y", "count": 5, "total_notional": 1000000000, "avg_notional": 200000000}]


class Analytics(BaseModel):
    """Analytics summary model."""
    total_trades: int
    total_notional_eur: float
    avg_size_eur: float
    largest_trade_eur: float
    strategies_count: int
    top_underlyings: List[dict]  # [{"name": str, "notional": float}]
    trades_per_hour: List[dict]  # [{"hour": str, "count": int}]
    strategy_distribution: List[dict]  # [{"type": str, "count": int}]
    
    # Advanced metrics (optional for backward compatibility)
    curve_metrics: Optional[CurveMetrics] = None
    flow_metrics: Optional[FlowMetrics] = None
    risk_metrics: Optional[RiskMetrics] = None
    realtime_metrics: Optional[RealTimeMetrics] = None
    currency_metrics: Optional[CurrencyMetrics] = None
    strategy_metrics: Optional[StrategyMetrics] = None


# ============================================================================
# Pro Trader Metrics Models for EUR IRS Market Makers
# ============================================================================

class InstrumentDetail(BaseModel):
    """Detailed metrics for a specific instrument in EUR IRS."""
    instrument: str  # "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y", "5Y10Y", etc.
    high: Optional[float] = None  # Highest rate in window (%)
    low: Optional[float] = None  # Lowest rate in window
    mid: Optional[float] = None  # Average rate
    vwap: Optional[float] = None  # Volume Weighted Average Price
    last: Optional[float] = None  # Last executed rate
    volume: float  # Total volume in EUR
    trade_count: int
    avg_trade_size: float  # Average trade size in EUR
    bid_ask_spread: Optional[float] = None  # Estimated bid/ask spread in bps
    volatility: Optional[float] = None  # Intraday volatility (annualized)
    price_impact: Optional[float] = None  # Average impact of 100M EUR trade on mid rate (bps)


class SpreadDetail(BaseModel):
    """Details for a specific inter-tenor spread."""
    current: float  # Current spread in bps
    high: float  # Highest spread in window
    low: float  # Lowest spread in window
    change_bps: float  # Change from previous period in bps
    z_score: Optional[float] = None  # Z-score vs historical


class SpreadMetrics(BaseModel):
    """Inter-tenor spread metrics for EUR IRS."""
    spread_2y_5y: SpreadDetail
    spread_5y_10y: SpreadDetail
    spread_10y_30y: SpreadDetail
    spread_2y_10y: SpreadDetail
    spread_2y_30y: SpreadDetail


class ProFlowMetrics(BaseModel):
    """Order flow imbalance metrics for Market Making."""
    net_flow_direction: str  # "BUY_PRESSURE" | "SELL_PRESSURE" | "BALANCED"
    flow_intensity: float  # Score 0-100
    buy_volume_ratio: float  # Ratio of buy volume vs sell (0-1)
    dominant_instrument: str  # Instrument with most volume
    new_trades_count: int  # Number of NEWT in period
    large_block_count: int  # Number of trades >500M EUR
    flow_by_instrument: Dict[str, str]  # Flow direction per instrument


class VolatilityMetrics(BaseModel):
    """Volatility metrics for EUR IRS."""
    realized_volatility: float  # Realized volatility (annualized)
    rate_velocity: Dict[str, float]  # Rate velocity (bps/min) per instrument
    volatility_by_instrument: Dict[str, float]  # Volatility per instrument
    volatility_percentile: float  # Percentile vs 30d history


class ExecutionMetrics(BaseModel):
    """Execution quality metrics for Market Making."""
    avg_slippage: float  # Average slippage vs mid rate (bps)
    spread_crossing_rate: float  # % of trades crossing spread
    effective_spread: float  # Effective spread average (bps)
    vwap_deviation: float  # Average deviation vs VWAP (bps)
    execution_quality_score: float  # Composite score 0-100


class PriceImpactMetrics(BaseModel):
    """Price impact analysis metrics."""
    impact_by_size_bucket: Dict[str, float]  # Average impact per bucket (bps)
    max_impact_trade: Optional[Dict] = None  # Trade with highest impact
    impact_velocity: float  # Recovery velocity after impact (minutes)


class ForwardCurveMetrics(BaseModel):
    """Forward curve analysis metrics."""
    forward_rates: Dict[str, float]  # Forward rates by instrument
    spot_vs_forward: Dict[str, float]  # Spot vs forward spread (bps)
    curve_shape: str  # "NORMAL" | "INVERTED" | "FLAT" | "STEEP"
    basis_swaps: Dict[str, float]  # Instrument basis analysis


class HistoricalContext(BaseModel):
    """Historical context for comparison."""
    percentile_30d: Dict[str, float]  # Percentile vs 30 days (by instrument)
    percentile_90d: Dict[str, float]  # Percentile vs 90 days (by instrument)
    z_score: Dict[str, float]  # Z-score vs historical mean (by instrument)
    avg_30d: Dict[str, float]  # 30-day average (by instrument)
    avg_90d: Dict[str, float]  # 90-day average (by instrument)
    deviation_from_avg: Dict[str, float]  # Deviation from average (bps, by instrument)


class ProAlert(BaseModel):
    """Pro trader alert for Market Makers."""
    alert_id: str
    alert_type: str  # "ABNORMAL_SPREAD" | "LARGE_BLOCK" | "CURVE_INVERSION" | "VOLATILITY_SPIKE"
    severity: str  # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    instrument: Optional[str] = None
    current_value: float
    threshold: float
    timestamp: datetime
    message: str


class ProTraderMetrics(BaseModel):
    """Complete pro trader metrics container."""
    time_window: int  # Window in minutes
    instrument_metrics: Dict[str, InstrumentDetail]
    spread_metrics: SpreadMetrics
    flow_metrics: ProFlowMetrics
    volatility_metrics: VolatilityMetrics
    execution_metrics: ExecutionMetrics
    price_impact_metrics: PriceImpactMetrics
    forward_curve_metrics: ForwardCurveMetrics
    historical_context: HistoricalContext
    alerts: List[ProAlert]


class ProTraderDelta(BaseModel):
    """Delta comparison between two time periods."""
    instrument_deltas: Dict[str, Dict[str, float]]  # {instrument: {mid_change, volume_change, spread_change}}
    spread_deltas: Dict[str, float]  # Spread changes in bps
    flow_delta: Dict[str, Any]  # Flow direction and intensity changes


