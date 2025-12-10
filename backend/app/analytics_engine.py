"""Advanced analytics calculation engine for professional trading dashboard."""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict
import statistics

from app.models import Trade, Strategy, Alert

logger = logging.getLogger(__name__)


class AnalyticsEngine:
    """Advanced analytics calculation engine."""
    
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

