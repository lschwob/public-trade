"""Pydantic models for trade data structures."""

from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field


class Trade(BaseModel):
    """Normalized trade model."""
    dissemination_identifier: str
    original_dissemination_identifier: Optional[str] = None
    action_type: str  # NEWT, MODI, TERM
    event_type: str
    event_timestamp: datetime
    execution_timestamp: datetime
    effective_date: Optional[str] = None
    expiration_date: Optional[str] = None
    
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
    tenor: Optional[str] = None  # e.g., "2Y", "5Y", "10Y"
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Strategy(BaseModel):
    """Strategy model for multi-leg trades."""
    strategy_id: str
    strategy_type: str  # Spread, Butterfly, Curve
    underlying_name: str
    legs: List[str]  # List of dissemination_identifiers
    total_notional_eur: float
    execution_start: datetime
    execution_end: datetime
    package_transaction_price: Optional[str] = None


class Alert(BaseModel):
    """Alert model."""
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
    tenor_distribution: List[dict]  # [{"tenor": str, "notional": float, "count": int, "avg_rate": float}]
    rate_evolution: List[dict]  # [{"timestamp": str, "2Y": float, "5Y": float, "10Y": float, "30Y": float}]
    tenor_spread: Dict[str, float]  # {"10Y-2Y": float, "30Y-10Y": float}
    average_rate_by_tenor: Dict[str, float]  # {"2Y": float, "5Y": float, ...}


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
    currency_heatmap: List[dict]  # [{"tenor": str, "currency": str, "notional": float}]


class StrategyMetrics(BaseModel):
    """Strategy intelligence."""
    strategy_avg_notional: List[dict]  # [{"type": str, "avg_notional": float}]
    strategy_tenor_preference: List[dict]  # [{"type": str, "tenors": List[str]}]
    package_vs_custom: Dict[str, int]  # {"package": count, "custom": count}


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


