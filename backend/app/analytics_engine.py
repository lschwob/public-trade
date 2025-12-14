"""
Advanced analytics calculation engine for professional trading dashboard.

This module provides comprehensive analytics calculations including:
- Curve analysis (tenor distribution, rate evolution, spreads)
- Flow metrics (action breakdown, platform market share, flow direction)
- Risk metrics (DV01, concentration HHI, percentiles)
- Real-time metrics (volume, liquidity score, rate velocity)
- Currency breakdown
- Strategy intelligence

All calculations are optimized for real-time performance and provide
insights that professional IRS traders need for market analysis.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict
import statistics

from app.models import (
    Trade, Strategy, Alert, TenorDetail, SpreadDetail, SpreadMetrics,
    ProFlowMetrics, VolatilityMetrics, ExecutionMetrics, PriceImpactMetrics,
    ForwardCurveMetrics, HistoricalContext, ProAlert, ProTraderMetrics, ProTraderDelta
)

logger = logging.getLogger(__name__)


class AnalyticsEngine:
    """
    Advanced analytics calculation engine.
    
    This class provides comprehensive analytics calculations for the trading
    dashboard. It maintains history for rate velocity and volume momentum
    calculations.
    
    Attributes:
        rate_history: Historical rate data for velocity calculations
        volume_history: Historical volume data for momentum calculations
        max_history_size: Maximum size of history buffers (1000)
        tenor_order: Standard tenor ordering for consistent sorting
    """
    
    def __init__(self):
        self.rate_history: List[Dict] = []  # Store historical rates for velocity
        self.volume_history: List[tuple] = []  # Store volume for momentum
        self.max_history_size = 1000  # Limit history size
    
    def estimate_duration(self, tenor: str) -> float:
        """Estimate duration factor for DV01 calculation."""
        # Standard duration estimates for IRS by tenor
        duration_map = {
            "3M": 0.25,
            "6M": 0.5,
            "1Y": 0.95,
            "2Y": 1.9,
            "3Y": 2.85,
            "5Y": 4.5,
            "7Y": 6.2,
            "10Y": 8.0,
            "15Y": 11.5,
            "20Y": 14.5,
            "30Y": 18.0,
        }
        return duration_map.get(tenor, 5.0)  # Default to 5.0 if unknown
    
    def calculate_hhi(self, volumes: Dict[str, float]) -> float:
        """Calculate Herfindahl-Hirschman Index for concentration."""
        if not volumes:
            return 0.0
        
        total_volume = sum(volumes.values())
        if total_volume == 0:
            return 0.0
        
        # Calculate market shares
        market_shares = {k: v / total_volume for k, v in volumes.items()}
        
        # HHI = sum of squared market shares (× 10000 for standard scale)
        hhi = sum(share ** 2 for share in market_shares.values()) * 10000
        return hhi
    
    def calculate_curve_metrics(self, trades: List[Trade]) -> Dict:
        """Calculate curve analysis metrics."""
        # Group by tenor
        tenor_data = defaultdict(lambda: {"notional": 0.0, "count": 0, "rates": []})
        
        for trade in trades:
            if not trade.tenor or not trade.notional_eur:
                continue
            
            tenor = trade.tenor
            tenor_data[tenor]["notional"] += trade.notional_eur
            tenor_data[tenor]["count"] += 1
            
            # Collect rates (use leg1 fixed rate if available)
            if trade.fixed_rate_leg1 is not None:
                tenor_data[tenor]["rates"].append(trade.fixed_rate_leg1)
        
        # Build tenor distribution
        tenor_distribution = []
        average_rate_by_tenor = {}
        
        for tenor, data in tenor_data.items():
            avg_rate = statistics.mean(data["rates"]) if data["rates"] else None
            tenor_distribution.append({
                "tenor": tenor,
                "notional": data["notional"],
                "count": data["count"],
                "avg_rate": avg_rate
            })
            if avg_rate is not None:
                average_rate_by_tenor[tenor] = avg_rate
        
        # Sort by tenor order
        tenor_order = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"]
        tenor_distribution.sort(key=lambda x: (
            tenor_order.index(x["tenor"]) if x["tenor"] in tenor_order else 999,
            x["tenor"]
        ))
        
        # Calculate tenor spreads
        tenor_spread = {}
        if "10Y" in average_rate_by_tenor and "2Y" in average_rate_by_tenor:
            tenor_spread["10Y-2Y"] = average_rate_by_tenor["10Y"] - average_rate_by_tenor["2Y"]
        if "30Y" in average_rate_by_tenor and "10Y" in average_rate_by_tenor:
            tenor_spread["30Y-10Y"] = average_rate_by_tenor["30Y"] - average_rate_by_tenor["10Y"]
        
        # Rate evolution (simplified - track current rates by tenor)
        now = datetime.utcnow()
        rate_evolution = [{
            "timestamp": now.isoformat(),
            **{k: v for k, v in average_rate_by_tenor.items()}
        }]
        
        # Store in history (keep last 100)
        self.rate_history.append({
            "timestamp": now,
            "rates": average_rate_by_tenor.copy()
        })
        if len(self.rate_history) > 100:
            self.rate_history = self.rate_history[-100:]
        
        return {
            "tenor_distribution": tenor_distribution,
            "rate_evolution": rate_evolution,
            "tenor_spread": tenor_spread,
            "average_rate_by_tenor": average_rate_by_tenor
        }
    
    def calculate_flow_metrics(self, trades: List[Trade]) -> Dict:
        """Calculate market flow metrics."""
        # Action breakdown
        action_breakdown = defaultdict(int)
        platform_data = defaultdict(lambda: {"notional": 0.0, "count": 0})
        
        for trade in trades:
            # Count actions
            action_breakdown[trade.action_type] += 1
            
            # Platform data
            platform = trade.platform_identifier or "Unknown"
            if trade.notional_eur:
                platform_data[platform]["notional"] += trade.notional_eur
            platform_data[platform]["count"] += 1
        
        # Platform market share
        total_notional = sum(data["notional"] for data in platform_data.values())
        platform_market_share = []
        avg_trade_size_by_platform = []
        
        for platform, data in platform_data.items():
            percentage = (data["notional"] / total_notional * 100) if total_notional > 0 else 0
            platform_market_share.append({
                "platform": platform,
                "notional": data["notional"],
                "percentage": percentage
            })
            
            avg_size = data["notional"] / data["count"] if data["count"] > 0 else 0
            avg_trade_size_by_platform.append({
                "platform": platform,
                "avg_size": avg_size
            })
        
        # Sort by notional descending
        platform_market_share.sort(key=lambda x: x["notional"], reverse=True)
        avg_trade_size_by_platform.sort(key=lambda x: x["avg_size"], reverse=True)
        
        # Flow direction (simplified - we don't have buy/sell data, so use action types)
        # NEWT might indicate new flow, MODI modifications, TERM terminations
        flow_direction = {
            "new": action_breakdown.get("NEWT", 0),
            "modified": action_breakdown.get("MODI", 0),
            "terminated": action_breakdown.get("TERM", 0)
        }
        
        return {
            "action_breakdown": dict(action_breakdown),
            "platform_market_share": platform_market_share,
            "flow_direction": flow_direction,
            "avg_trade_size_by_platform": avg_trade_size_by_platform
        }
    
    def calculate_risk_metrics(self, trades: List[Trade]) -> Dict:
        """Calculate risk and concentration metrics."""
        # DV01 calculation
        total_dv01 = 0.0
        notionals = []
        
        for trade in trades:
            if not trade.tenor or not trade.notional_eur:
                continue
            
            duration = self.estimate_duration(trade.tenor)
            # DV01 approximation: notional × duration × 0.0001 (1bp)
            dv01_contribution = trade.notional_eur * duration * 0.0001
            total_dv01 += dv01_contribution
            
            notionals.append(trade.notional_eur)
        
        # Notional distribution buckets
        buckets = {
            "<100M": 0,
            "100M-500M": 0,
            "500M-1B": 0,
            "1B-5B": 0,
            ">5B": 0
        }
        
        for notional in notionals:
            if notional < 100_000_000:
                buckets["<100M"] += 1
            elif notional < 500_000_000:
                buckets["100M-500M"] += 1
            elif notional < 1_000_000_000:
                buckets["500M-1B"] += 1
            elif notional < 5_000_000_000:
                buckets["1B-5B"] += 1
            else:
                buckets[">5B"] += 1
        
        notional_distribution = [{"bucket": k, "count": v} for k, v in buckets.items()]
        
        # Percentiles
        percentiles = {}
        if notionals:
            notionals_sorted = sorted(notionals)
            percentiles = {
                "p50": notionals_sorted[int(len(notionals_sorted) * 0.50)],
                "p75": notionals_sorted[int(len(notionals_sorted) * 0.75)],
                "p90": notionals_sorted[int(len(notionals_sorted) * 0.90)],
                "p95": notionals_sorted[int(len(notionals_sorted) * 0.95)],
                "p99": notionals_sorted[int(len(notionals_sorted) * 0.99)] if len(notionals_sorted) > 1 else notionals_sorted[-1]
            }
        
        # Concentration metrics
        underlying_volumes = defaultdict(float)
        for trade in trades:
            if trade.notional_eur and trade.unique_product_identifier_underlier_name:
                underlying_volumes[trade.unique_product_identifier_underlier_name] += trade.notional_eur
        
        concentration_hhi = self.calculate_hhi(underlying_volumes)
        
        # Top 5 concentration
        total_notional = sum(underlying_volumes.values())
        if total_notional > 0:
            sorted_underlyings = sorted(underlying_volumes.items(), key=lambda x: x[1], reverse=True)
            top5_notional = sum(vol for _, vol in sorted_underlyings[:5])
            top5_concentration = (top5_notional / total_notional) * 100
        else:
            top5_concentration = 0.0
        
        return {
            "total_dv01": total_dv01,
            "notional_distribution": notional_distribution,
            "concentration_hhi": concentration_hhi,
            "top5_concentration": top5_concentration,
            "percentiles": percentiles
        }
    
    def calculate_realtime_metrics(self, trades: List[Trade], alerts: List[Alert]) -> Dict:
        """Calculate real-time activity metrics."""
        now = datetime.utcnow()
        
        # Filter recent trades
        trades_5min = [t for t in trades if (now - t.execution_timestamp.replace(tzinfo=None)).total_seconds() < 300]
        trades_15min = [t for t in trades if (now - t.execution_timestamp.replace(tzinfo=None)).total_seconds() < 900]
        trades_1h = [t for t in trades if (now - t.execution_timestamp.replace(tzinfo=None)).total_seconds() < 3600]
        
        # Volume calculations
        volume_last_5min = sum(t.notional_eur or 0 for t in trades_5min)
        volume_last_15min = sum(t.notional_eur or 0 for t in trades_15min)
        volume_last_hour = sum(t.notional_eur or 0 for t in trades_1h)
        
        trades_last_5min = len(trades_5min)
        
        # Alert count last hour
        alerts_1h = [a for a in alerts if (now - a.timestamp.replace(tzinfo=None)).total_seconds() < 3600]
        alert_count_last_hour = len(alerts_1h)
        
        # Liquidity score (composite: trade frequency + volume depth)
        # Normalize: trades per 5min (max 100) + volume per 5min (max 10B)
        trade_frequency_score = min(trades_last_5min / 100.0, 1.0) * 50  # Max 50 points
        volume_depth_score = min(volume_last_5min / 10_000_000_000.0, 1.0) * 50  # Max 50 points
        liquidity_score = trade_frequency_score + volume_depth_score
        
        # Rate velocity (rate change per hour)
        rate_velocity = {}
        if len(self.rate_history) >= 2:
            current = self.rate_history[-1]
            one_hour_ago = None
            for entry in reversed(self.rate_history[:-1]):
                if (current["timestamp"] - entry["timestamp"]).total_seconds() >= 3600:
                    one_hour_ago = entry
                    break
            
            if one_hour_ago:
                for tenor in current["rates"]:
                    if tenor in one_hour_ago["rates"]:
                        rate_change = current["rates"][tenor] - one_hour_ago["rates"][tenor]
                        rate_velocity[tenor] = rate_change * 10000  # Convert to bps per hour
        
        return {
            "volume_last_5min": volume_last_5min,
            "volume_last_15min": volume_last_15min,
            "volume_last_hour": volume_last_hour,
            "trades_last_5min": trades_last_5min,
            "liquidity_score": liquidity_score,
            "alert_count_last_hour": alert_count_last_hour,
            "rate_velocity": rate_velocity
        }
    
    def calculate_currency_metrics(self, trades: List[Trade]) -> Dict:
        """Calculate currency breakdown."""
        currency_data = defaultdict(lambda: {"notional": 0.0, "count": 0})
        currency_tenor_data = defaultdict(lambda: defaultdict(float))
        
        for trade in trades:
            if not trade.notional_eur:
                continue
            
            # Use leg1 currency primarily
            currency = trade.notional_currency_leg1 or "UNKNOWN"
            currency_data[currency]["notional"] += trade.notional_eur
            currency_data[currency]["count"] += 1
            
            # Currency × Tenor heatmap
            if trade.tenor:
                currency_tenor_data[currency][trade.tenor] += trade.notional_eur
        
        # Currency breakdown
        currency_breakdown = [
            {"currency": k, "notional": v["notional"], "count": v["count"]}
            for k, v in currency_data.items()
        ]
        currency_breakdown.sort(key=lambda x: x["notional"], reverse=True)
        
        # Currency heatmap
        currency_heatmap = []
        for currency, tenor_data in currency_tenor_data.items():
            for tenor, notional in tenor_data.items():
                currency_heatmap.append({
                    "tenor": tenor,
                    "currency": currency,
                    "notional": notional
                })
        
        return {
            "currency_breakdown": currency_breakdown,
            "currency_heatmap": currency_heatmap
        }
    
    def calculate_strategy_metrics(self, strategies: List[Strategy], trades: List[Trade]) -> Dict:
        """Calculate strategy intelligence."""
        # Strategy avg notional
        strategy_notionals = defaultdict(list)
        for strategy in strategies:
            strategy_notionals[strategy.strategy_type].append(strategy.total_notional_eur)
        
        strategy_avg_notional = [
            {
                "type": stype,
                "avg_notional": statistics.mean(notionals) if notionals else 0
            }
            for stype, notionals in strategy_notionals.items()
        ]
        strategy_avg_notional.sort(key=lambda x: x["avg_notional"], reverse=True)
        
        # Strategy tenor preference
        strategy_tenor_preference = []
        for strategy in strategies:
            # Get tenors from trades in this strategy
            strategy_trades = [t for t in trades if t.dissemination_identifier in strategy.legs]
            tenors = [t.tenor for t in strategy_trades if t.tenor]
            unique_tenors = list(set(tenors))
            if unique_tenors:
                strategy_tenor_preference.append({
                    "type": strategy.strategy_type,
                    "tenors": unique_tenors
                })
        
        # Package vs custom
        package_count = sum(1 for s in strategies if s.package_transaction_price)
        custom_count = len(strategies) - package_count
        
        package_vs_custom = {
            "package": package_count,
            "custom": custom_count
        }
        
        # NEW: Tenor pair statistics
        tenor_pair_stats = defaultdict(lambda: {"count": 0, "total_notional": 0.0})
        for strategy in strategies:
            if strategy.tenor_pair:
                tenor_pair_stats[strategy.tenor_pair]["count"] += 1
                tenor_pair_stats[strategy.tenor_pair]["total_notional"] += strategy.total_notional_eur
        
        # Format for output
        tenor_pair_distribution = [
            {
                "tenor_pair": pair,
                "count": stats["count"],
                "total_notional": stats["total_notional"],
                "avg_notional": stats["total_notional"] / stats["count"] if stats["count"] > 0 else 0
            }
            for pair, stats in tenor_pair_stats.items()
        ]
        # Sort by count descending
        tenor_pair_distribution.sort(key=lambda x: x["count"], reverse=True)
        
        return {
            "strategy_avg_notional": strategy_avg_notional,
            "strategy_tenor_preference": strategy_tenor_preference,
            "package_vs_custom": package_vs_custom,
            "tenor_pair_distribution": tenor_pair_distribution
        }

    # ============================================================================
    # Pro Trader Metrics for EUR IRS Market Makers
    # ============================================================================

    def _calculate_tenor_details_eur(self, trades: List[Trade]) -> Dict[str, TenorDetail]:
        """Calculate detailed metrics for each EUR tenor."""
        tenor_data = defaultdict(lambda: {
            "rates": [],
            "rates_with_notional": [],  # (rate, notional) for VWAP
            "volumes": [],
            "trade_count": 0,
            "total_volume": 0.0,
            "last_rate": None,
            "last_timestamp": None
        })
        
        # Group trades by tenor
        # Accept all trades (not just EUR) if no EUR available
        eur_trades = [t for t in trades if t.notional_currency_leg1 == "EUR"]
        trades_to_use = eur_trades if eur_trades else trades
        
        for trade in trades_to_use:
            if not trade.tenor or not trade.notional_eur:
                continue
            
            if trade.fixed_rate_leg1 is None:
                continue
            
            tenor = trade.tenor
            rate = trade.fixed_rate_leg1
            notional = trade.notional_eur
            
            tenor_data[tenor]["rates"].append(rate)
            tenor_data[tenor]["rates_with_notional"].append((rate, notional))
            tenor_data[tenor]["volumes"].append(notional)
            tenor_data[tenor]["trade_count"] += 1
            tenor_data[tenor]["total_volume"] += notional
            
            # Track last rate
            if (tenor_data[tenor]["last_timestamp"] is None or 
                trade.execution_timestamp > tenor_data[tenor]["last_timestamp"]):
                tenor_data[tenor]["last_rate"] = rate
                tenor_data[tenor]["last_timestamp"] = trade.execution_timestamp
        
        # Calculate metrics per tenor
        result = {}
        for tenor, data in tenor_data.items():
            if not data["rates"]:
                continue
            
            rates = data["rates"]
            high = max(rates) * 100  # Convert to %
            low = min(rates) * 100
            mid = statistics.mean(rates) * 100
            
            # VWAP calculation
            total_weighted = sum(rate * notional for rate, notional in data["rates_with_notional"])
            total_notional = sum(data["volumes"])
            vwap = (total_weighted / total_notional * 100) if total_notional > 0 else None
            
            # Volatility (annualized)
            if len(rates) > 1:
                std_dev = statistics.stdev(rates)
                # Annualize: assume trades over time_window, scale to year
                volatility = std_dev * (252 ** 0.5) * 100  # Rough annualization
            else:
                volatility = None
            
            # Bid/Ask spread estimation (simplified: use std dev of rates)
            bid_ask_spread = (std_dev * 10000) if len(rates) > 1 else None  # Convert to bps
            
            # Price impact (simplified: correlation between size and rate movement)
            # Group by size buckets and measure impact
            price_impact = self._estimate_price_impact(data["rates_with_notional"])
            
            result[tenor] = TenorDetail(
                tenor=tenor,
                high=high,
                low=low,
                mid=mid,
                vwap=vwap,
                last=data["last_rate"] * 100 if data["last_rate"] else None,
                volume=data["total_volume"],
                trade_count=data["trade_count"],
                avg_trade_size=data["total_volume"] / data["trade_count"] if data["trade_count"] > 0 else 0,
                bid_ask_spread=bid_ask_spread,
                volatility=volatility,
                price_impact=price_impact
            )
        
        return result

    def _estimate_price_impact(self, rates_with_notional: List[tuple]) -> Optional[float]:
        """Estimate price impact for 100M EUR trade."""
        if len(rates_with_notional) < 2:
            return None
        
        # Group by size buckets
        buckets = {
            "<100M": [],
            "100-500M": [],
            ">500M": []
        }
        
        for rate, notional in rates_with_notional:
            if notional < 100_000_000:
                buckets["<100M"].append(rate)
            elif notional < 500_000_000:
                buckets["100-500M"].append(rate)
            else:
                buckets[">500M"].append(rate)
        
        # Calculate average rate per bucket
        bucket_avgs = {}
        for bucket, rates in buckets.items():
            if rates:
                bucket_avgs[bucket] = statistics.mean(rates)
        
        # Estimate impact: difference between large and small trades
        if ">500M" in bucket_avgs and "<100M" in bucket_avgs:
            impact = abs(bucket_avgs[">500M"] - bucket_avgs["<100M"]) * 10000  # Convert to bps
            # Scale to 100M
            impact = impact * (100_000_000 / 500_000_000)  # Rough scaling
            return impact
        
        return None

    def _calculate_spread_metrics_eur(self, tenor_metrics: Dict[str, TenorDetail]) -> SpreadMetrics:
        """Calculate inter-tenor spread metrics for EUR IRS."""
        def get_mid_rate(tenor: str) -> Optional[float]:
            if tenor in tenor_metrics and tenor_metrics[tenor].mid is not None:
                return tenor_metrics[tenor].mid
            return None
        
        def calculate_spread(tenor1: str, tenor2: str) -> Optional[SpreadDetail]:
            mid1 = get_mid_rate(tenor1)
            mid2 = get_mid_rate(tenor2)
            
            if mid1 is None or mid2 is None:
                return None
            
            current = (mid2 - mid1) * 100  # Convert to bps
            # For now, use current as high/low (would need history for proper high/low)
            return SpreadDetail(
                current=current,
                high=current * 1.1,  # Placeholder
                low=current * 0.9,   # Placeholder
                change_bps=0.0,  # Would need previous period
                z_score=None  # Would need historical data
            )
        
        # Calculate key spreads - use None for missing data instead of 0
        def get_spread_or_none(tenor1: str, tenor2: str) -> SpreadDetail:
            spread = calculate_spread(tenor1, tenor2)
            if spread:
                return spread
            # Return a spread with None values to indicate missing data
            return SpreadDetail(current=0.0, high=0.0, low=0.0, change_bps=0.0, z_score=None)
        
        spread_2y_5y = get_spread_or_none("2Y", "5Y")
        spread_5y_10y = get_spread_or_none("5Y", "10Y")
        spread_10y_30y = get_spread_or_none("10Y", "30Y")
        spread_2y_10y = get_spread_or_none("2Y", "10Y")
        spread_2y_30y = get_spread_or_none("2Y", "30Y")
        
        return SpreadMetrics(
            spread_2y_5y=spread_2y_5y,
            spread_5y_10y=spread_5y_10y,
            spread_10y_30y=spread_10y_30y,
            spread_2y_10y=spread_2y_10y,
            spread_2y_30y=spread_2y_30y
        )

    def _calculate_order_flow_imbalance(self, trades: List[Trade]) -> ProFlowMetrics:
        """Calculate order flow imbalance for Market Making."""
        if not trades:
            return ProFlowMetrics(
                net_flow_direction="BALANCED",
                flow_intensity=0.0,
                buy_volume_ratio=0.5,
                dominant_tenor="",
                new_trades_count=0,
                large_block_count=0,
                flow_by_tenor={}
            )
        
        # Analyze rate movements to infer flow direction
        # If rates are rising, there's sell pressure; if falling, buy pressure
        tenor_rates = defaultdict(list)
        tenor_volumes = defaultdict(float)
        new_trades = 0
        large_blocks = 0
        
        for trade in trades:
            if trade.tenor and trade.fixed_rate_leg1 is not None and trade.notional_eur:
                tenor_rates[trade.tenor].append((trade.execution_timestamp, trade.fixed_rate_leg1))
                tenor_volumes[trade.tenor] += trade.notional_eur
                
                if trade.action_type == "NEWT":
                    new_trades += 1
                
                if trade.notional_eur > 500_000_000:
                    large_blocks += 1
        
        # Determine flow direction by analyzing rate trends
        buy_pressure = 0
        sell_pressure = 0
        flow_by_tenor = {}
        
        for tenor, rate_history in tenor_rates.items():
            if len(rate_history) < 2:
                flow_by_tenor[tenor] = "BALANCED"
                continue
            
            # Sort by timestamp
            rate_history.sort(key=lambda x: x[0])
            
            # Calculate trend
            first_rate = rate_history[0][1]
            last_rate = rate_history[-1][1]
            rate_change = last_rate - first_rate
            
            if rate_change < -0.0001:  # Rates falling = buy pressure
                buy_pressure += tenor_volumes[tenor]
                flow_by_tenor[tenor] = "BUY_PRESSURE"
            elif rate_change > 0.0001:  # Rates rising = sell pressure
                sell_pressure += tenor_volumes[tenor]
                flow_by_tenor[tenor] = "SELL_PRESSURE"
            else:
                flow_by_tenor[tenor] = "BALANCED"
        
        total_volume = buy_pressure + sell_pressure
        buy_volume_ratio = buy_pressure / total_volume if total_volume > 0 else 0.5
        
        # Determine net direction
        if buy_pressure > sell_pressure * 1.2:
            net_direction = "BUY_PRESSURE"
        elif sell_pressure > buy_pressure * 1.2:
            net_direction = "SELL_PRESSURE"
        else:
            net_direction = "BALANCED"
        
        # Flow intensity (0-100)
        intensity = min(abs(buy_pressure - sell_pressure) / max(total_volume, 1) * 100, 100)
        
        # Dominant tenor
        dominant_tenor = max(tenor_volumes.items(), key=lambda x: x[1])[0] if tenor_volumes else ""
        
        return ProFlowMetrics(
            net_flow_direction=net_direction,
            flow_intensity=intensity,
            buy_volume_ratio=buy_volume_ratio,
            dominant_tenor=dominant_tenor,
            new_trades_count=new_trades,
            large_block_count=large_blocks,
            flow_by_tenor=flow_by_tenor
        )

    def _calculate_volatility_metrics(self, trades: List[Trade], tenor_metrics: Dict[str, TenorDetail]) -> VolatilityMetrics:
        """Calculate volatility metrics."""
        # Aggregate volatility across all tenors
        volatilities = [v.volatility for v in tenor_metrics.values() if v.volatility is not None]
        realized_volatility = statistics.mean(volatilities) if volatilities else 0.0
        
        # Rate velocity (bps/min) - simplified calculation
        rate_velocity = {}
        for tenor, detail in tenor_metrics.items():
            if detail.volatility is not None:
                # Rough estimate: volatility / sqrt(time_window_minutes)
                rate_velocity[tenor] = detail.volatility / 10.0  # Placeholder
        
        volatility_by_tenor = {tenor: detail.volatility or 0.0 for tenor, detail in tenor_metrics.items()}
        
        return VolatilityMetrics(
            realized_volatility=realized_volatility,
            rate_velocity=rate_velocity,
            volatility_by_tenor=volatility_by_tenor,
            volatility_percentile=50.0  # Placeholder, would need historical data
        )

    def _calculate_execution_quality(self, trades: List[Trade], tenor_metrics: Dict[str, TenorDetail]) -> ExecutionMetrics:
        """Calculate execution quality metrics."""
        if not trades:
            return ExecutionMetrics(
                avg_slippage=0.0,
                spread_crossing_rate=0.0,
                effective_spread=0.0,
                vwap_deviation=0.0,
                execution_quality_score=50.0
            )
        
        slippages = []
        spread_crossings = 0
        spreads = []
        vwap_deviations = []
        
        for trade in trades:
            if not trade.tenor or trade.fixed_rate_leg1 is None:
                continue
            
            tenor = trade.tenor
            if tenor not in tenor_metrics:
                continue
            
            detail = tenor_metrics[tenor]
            rate = trade.fixed_rate_leg1 * 100  # Convert to %
            
            # Slippage vs mid
            if detail.mid is not None:
                slippage = abs(rate - detail.mid) * 100  # Convert to bps
                slippages.append(slippage)
            
            # Spread crossing (simplified: if trade is far from mid, likely crossed)
            if detail.bid_ask_spread is not None and detail.mid is not None:
                spread_half = detail.bid_ask_spread / 2
                if abs(rate - detail.mid) > spread_half:
                    spread_crossings += 1
                spreads.append(detail.bid_ask_spread)
            
            # VWAP deviation
            if detail.vwap is not None:
                deviation = abs(rate - detail.vwap) * 100  # Convert to bps
                vwap_deviations.append(deviation)
        
        avg_slippage = statistics.mean(slippages) if slippages else 0.0
        spread_crossing_rate = (spread_crossings / len(trades) * 100) if trades else 0.0
        effective_spread = statistics.mean(spreads) if spreads else 0.0
        vwap_deviation = statistics.mean(vwap_deviations) if vwap_deviations else 0.0
        
        # Execution quality score (0-100, higher is better)
        # Lower slippage and deviation = higher score
        slippage_score = max(0, 100 - avg_slippage * 10)  # Penalize slippage
        deviation_score = max(0, 100 - vwap_deviation * 10)  # Penalize deviation
        execution_quality_score = (slippage_score + deviation_score) / 2
        
        return ExecutionMetrics(
            avg_slippage=avg_slippage,
            spread_crossing_rate=spread_crossing_rate,
            effective_spread=effective_spread,
            vwap_deviation=vwap_deviation,
            execution_quality_score=execution_quality_score
        )

    def _calculate_price_impact(self, trades: List[Trade], tenor_metrics: Dict[str, TenorDetail]) -> PriceImpactMetrics:
        """Calculate price impact metrics."""
        # Group trades by size buckets
        buckets = {
            "<100M": [],
            "100-500M": [],
            ">500M": []
        }
        
        max_impact = 0.0
        max_impact_trade_id = None
        max_impact_size = 0.0
        
        for trade in trades:
            if not trade.notional_eur or not trade.tenor:
                continue
            
            size = trade.notional_eur
            if size < 100_000_000:
                buckets["<100M"].append(trade)
            elif size < 500_000_000:
                buckets["100-500M"].append(trade)
            else:
                buckets[">500M"].append(trade)
            
            # Estimate impact (simplified: larger trades have more impact)
            if trade.tenor in tenor_metrics:
                detail = tenor_metrics[trade.tenor]
                if detail.price_impact is not None:
                    impact = detail.price_impact * (size / 100_000_000)  # Scale to trade size
                    if impact > max_impact:
                        max_impact = impact
                        max_impact_trade_id = trade.dissemination_identifier
                        max_impact_size = size
        
        # Calculate average impact per bucket
        impact_by_bucket = {}
        for bucket, bucket_trades in buckets.items():
            if bucket_trades:
                # Simplified: use average price impact from tenor metrics
                impacts = []
                for trade in bucket_trades:
                    if trade.tenor in tenor_metrics:
                        detail = tenor_metrics[trade.tenor]
                        if detail.price_impact is not None:
                            impacts.append(detail.price_impact)
                impact_by_bucket[bucket] = statistics.mean(impacts) if impacts else 0.0
            else:
                impact_by_bucket[bucket] = 0.0
        
        max_impact_trade = None
        if max_impact_trade_id:
            max_impact_trade = {
                "trade_id": max_impact_trade_id,
                "impact": max_impact,
                "size": max_impact_size
            }
        
        return PriceImpactMetrics(
            impact_by_size_bucket=impact_by_bucket,
            max_impact_trade=max_impact_trade,
            impact_velocity=3.5  # Placeholder: minutes to recover
        )

    def _calculate_forward_curve(self, trades: List[Trade]) -> ForwardCurveMetrics:
        """Calculate forward curve analysis."""
        # Simplified forward curve calculation
        # In reality, this would require more sophisticated bootstrapping
        forward_rates = {}
        spot_vs_forward = {}
        basis_swaps = {}
        
        # Placeholder implementation
        curve_shape = "NORMAL"  # Would need actual curve analysis
        
        return ForwardCurveMetrics(
            forward_rates=forward_rates,
            spot_vs_forward=spot_vs_forward,
            curve_shape=curve_shape,
            basis_swaps=basis_swaps
        )

    def _calculate_historical_context(
        self,
        tenor_metrics: Dict[str, TenorDetail],
        historical_30d: Optional[List[Trade]],
        historical_90d: Optional[List[Trade]]
    ) -> HistoricalContext:
        """Calculate historical context for comparison."""
        # Placeholder implementation - would need actual historical data processing
        percentile_30d = {}
        percentile_90d = {}
        z_score = {}
        avg_30d = {}
        avg_90d = {}
        deviation_from_avg = {}
        
        # For now, return empty/placeholder values
        for tenor in tenor_metrics.keys():
            percentile_30d[tenor] = 50.0
            percentile_90d[tenor] = 50.0
            z_score[tenor] = 0.0
            avg_30d[tenor] = 0.0
            avg_90d[tenor] = 0.0
            deviation_from_avg[tenor] = 0.0
        
        return HistoricalContext(
            percentile_30d=percentile_30d,
            percentile_90d=percentile_90d,
            z_score=z_score,
            avg_30d=avg_30d,
            avg_90d=avg_90d,
            deviation_from_avg=deviation_from_avg
        )

    def _detect_pro_alerts(
        self,
        tenor_metrics: Dict[str, TenorDetail],
        spread_metrics: SpreadMetrics,
        flow_metrics: ProFlowMetrics,
        volatility_metrics: VolatilityMetrics,
        trades: List[Trade]
    ) -> List[ProAlert]:
        """Detect pro trader alerts."""
        alerts = []
        now = datetime.utcnow()
        
        # Check for large blocks (>5B EUR)
        for trade in trades:
            if trade.notional_eur and trade.notional_eur > 5_000_000_000:
                alerts.append(ProAlert(
                    alert_id=f"large_block_{trade.dissemination_identifier}",
                    alert_type="LARGE_BLOCK",
                    severity="HIGH",
                    tenor=trade.tenor,
                    current_value=trade.notional_eur,
                    threshold=5_000_000_000,
                    timestamp=now,
                    message=f"Large block trade detected: {trade.notional_eur/1e9:.2f}B EUR in {trade.tenor or 'unknown tenor'}"
                ))
        
        # Check for abnormal spreads (simplified: if spread > 2x typical)
        typical_spreads = {
            "5Y-10Y": 25.0,  # Typical spread in bps
            "10Y-30Y": 38.0,
            "2Y-10Y": 50.0
        }
        
        spread_values = {
            "5Y-10Y": spread_metrics.spread_5y_10y.current,
            "10Y-30Y": spread_metrics.spread_10y_30y.current,
            "2Y-10Y": spread_metrics.spread_2y_10y.current
        }
        
        for spread_name, current in spread_values.items():
            if spread_name in typical_spreads:
                typical = typical_spreads[spread_name]
                if abs(current) > abs(typical) * 2:
                    alerts.append(ProAlert(
                        alert_id=f"abnormal_spread_{spread_name}_{now.timestamp()}",
                        alert_type="ABNORMAL_SPREAD",
                        severity="MEDIUM",
                        tenor=None,
                        current_value=current,
                        threshold=typical * 2,
                        timestamp=now,
                        message=f"Abnormal spread detected: {spread_name} at {current:.2f} bps (typical: {typical:.2f} bps)"
                    ))
        
        # Check for volatility spike
        if volatility_metrics.volatility_percentile > 95.0:
            alerts.append(ProAlert(
                alert_id=f"volatility_spike_{now.timestamp()}",
                alert_type="VOLATILITY_SPIKE",
                severity="HIGH",
                tenor=None,
                current_value=volatility_metrics.realized_volatility,
                threshold=0.0,  # Would need actual threshold
                timestamp=now,
                message=f"Volatility spike detected: {volatility_metrics.realized_volatility:.2f}% (95th percentile)"
            ))
        
        return alerts

    def calculate_pro_trader_metrics(
        self,
        trades: List[Trade],
        time_window_minutes: int,
        historical_30d: Optional[List[Trade]] = None,
        historical_90d: Optional[List[Trade]] = None
    ) -> Dict:
        """Calculate comprehensive pro trader metrics for EUR IRS."""
        now = datetime.utcnow()
        cutoff_time = now - timedelta(minutes=time_window_minutes)
        
        # Filter trades in time window (prefer EUR but accept all if no EUR available)
        recent_trades_all = [
            t for t in trades
            if t.execution_timestamp.replace(tzinfo=None) >= cutoff_time
        ]
        
        # Try EUR first, fallback to all trades if no EUR
        recent_trades_eur = [
            t for t in recent_trades_all
            if t.notional_currency_leg1 == "EUR"
        ]
        
        recent_trades = recent_trades_eur if recent_trades_eur else recent_trades_all
        
        # Log for debugging
        if not recent_trades:
            logger.warning(f"No trades found in {time_window_minutes}min window (total trades in buffer: {len(trades)})")
            if trades:
                # Show sample of available trades for debugging
                sample_currencies = set()
                sample_tenors = set()
                for t in trades[:10]:
                    if t.notional_currency_leg1:
                        sample_currencies.add(t.notional_currency_leg1)
                    if t.tenor:
                        sample_tenors.add(t.tenor)
                logger.info(f"Sample currencies in buffer: {sample_currencies}, sample tenors: {sample_tenors}")
        else:
            eur_count = len(recent_trades_eur)
            total_count = len(recent_trades)
            if eur_count < total_count:
                logger.info(f"Using {eur_count} EUR trades + {total_count - eur_count} other trades for {time_window_minutes}min window")
            else:
                logger.debug(f"Using {total_count} EUR trades for {time_window_minutes}min window")
        
        # Calculate all metrics
        tenor_metrics = self._calculate_tenor_details_eur(recent_trades)
        spread_metrics = self._calculate_spread_metrics_eur(tenor_metrics)
        flow_metrics = self._calculate_order_flow_imbalance(recent_trades)
        volatility_metrics = self._calculate_volatility_metrics(recent_trades, tenor_metrics)
        execution_metrics = self._calculate_execution_quality(recent_trades, tenor_metrics)
        price_impact_metrics = self._calculate_price_impact(recent_trades, tenor_metrics)
        forward_curve_metrics = self._calculate_forward_curve(recent_trades)
        historical_context = self._calculate_historical_context(tenor_metrics, historical_30d, historical_90d)
        alerts = self._detect_pro_alerts(tenor_metrics, spread_metrics, flow_metrics, volatility_metrics, recent_trades)
        
        # Build ProTraderMetrics
        pro_metrics = ProTraderMetrics(
            time_window=time_window_minutes,
            tenor_metrics=tenor_metrics,
            spread_metrics=spread_metrics,
            flow_metrics=flow_metrics,
            volatility_metrics=volatility_metrics,
            execution_metrics=execution_metrics,
            price_impact_metrics=price_impact_metrics,
            forward_curve_metrics=forward_curve_metrics,
            historical_context=historical_context,
            alerts=alerts
        )
        
        # Return as dict for JSON serialization
        return pro_metrics.dict()

    def calculate_pro_trader_deltas(
        self,
        metrics_short: Dict,
        metrics_long: Dict
    ) -> Dict:
        """Calculate deltas between two time periods."""
        tenor_deltas = {}
        spread_deltas = {}
        
        # Calculate tenor deltas
        short_tenors = metrics_short.get("tenor_metrics", {})
        long_tenors = metrics_long.get("tenor_metrics", {})
        
        for tenor in set(list(short_tenors.keys()) + list(long_tenors.keys())):
            short_detail = short_tenors.get(tenor, {})
            long_detail = long_tenors.get(tenor, {})
            
            short_mid = short_detail.get("mid", 0) if short_detail else 0
            long_mid = long_detail.get("mid", 0) if long_detail else 0
            mid_change = (short_mid - long_mid) * 100  # Convert to bps
            
            short_vol = short_detail.get("volume", 0) if short_detail else 0
            long_vol = long_detail.get("volume", 0) if long_detail else 0
            volume_change = ((short_vol - long_vol) / long_vol * 100) if long_vol > 0 else 0
            
            tenor_deltas[tenor] = {
                "mid_change": mid_change,
                "volume_change": volume_change,
                "spread_change": 0.0  # Placeholder
            }
        
        # Calculate spread deltas
        short_spreads = metrics_short.get("spread_metrics", {})
        long_spreads = metrics_long.get("spread_metrics", {})
        
        for spread_name in ["spread_5y_10y", "spread_10y_30y", "spread_2y_10y"]:
            short_current = short_spreads.get(spread_name, {}).get("current", 0) if isinstance(short_spreads.get(spread_name), dict) else 0
            long_current = long_spreads.get(spread_name, {}).get("current", 0) if isinstance(long_spreads.get(spread_name), dict) else 0
            spread_deltas[spread_name] = short_current - long_current
        
        # Flow delta
        short_flow = metrics_short.get("flow_metrics", {})
        long_flow = metrics_long.get("flow_metrics", {})
        
        flow_delta = {
            "direction_change": short_flow.get("net_flow_direction", "") != long_flow.get("net_flow_direction", ""),
            "intensity_change": short_flow.get("flow_intensity", 0) - long_flow.get("flow_intensity", 0)
        }
        
        delta = ProTraderDelta(
            tenor_deltas=tenor_deltas,
            spread_deltas=spread_deltas,
            flow_delta=flow_delta
        )
        
        return delta.dict()

    def load_historical_trades(self, days: int) -> List[Trade]:
        """Load historical trades from Excel files."""
        # Placeholder - would need to implement Excel loading
        # For now, return empty list
        return []

