"""
Alert engine with EUR-based thresholds.

This module generates alerts for:
- Large trades (exceeding EUR thresholds)
- Strategy packages (multi-leg strategies)
- Trend alerts (high volume in 5-minute windows)

All alerts are based on notional amounts converted to EUR using cached
exchange rates. The engine prevents duplicate alerts by tracking
alerted_trade_ids and alerted_strategy_ids.
"""

import logging
import asyncio
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Set
import httpx
import uuid

from app.config import (
    ALERT_THRESHOLDS_EUR,
    EXCHANGE_RATE_API_URL,
    EXCHANGE_RATE_CACHE_TTL
)
from app.models import Trade, Strategy, Alert

logger = logging.getLogger(__name__)


class ExchangeRateCache:
    """
    Cache for exchange rates with TTL (Time To Live).
    
    Caches exchange rates from the external API to reduce API calls.
    Rates are refreshed when the cache expires (EXCHANGE_RATE_CACHE_TTL).
    
    Attributes:
        rates: Dict mapping currency to EUR exchange rate
        last_update: Timestamp of last cache update
    """
    
    def __init__(self):
        self.rates: Dict[str, float] = {}
        self.last_update: Optional[datetime] = None
    
    async def get_rate(self, from_currency: str, to_currency: str = "EUR") -> Optional[float]:
        """Get exchange rate, fetching if needed."""
        if to_currency != "EUR":
            # For now, only support EUR conversion
            return None
        
        # Check cache validity
        if self.last_update:
            age = (datetime.utcnow() - self.last_update).total_seconds()
            if age < EXCHANGE_RATE_CACHE_TTL and from_currency in self.rates:
                return self.rates[from_currency]
        
        # Fetch new rates
        await self._fetch_rates()
        
        return self.rates.get(from_currency)
    
    async def _fetch_rates(self):
        """Fetch exchange rates from API."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(EXCHANGE_RATE_API_URL)
                response.raise_for_status()
                data = response.json()
                
                # API returns rates as EUR to other currencies
                # We need inverse for conversion TO EUR
                base_rates = data.get("rates", {})
                
                # Calculate inverse rates (to EUR)
                for currency, rate in base_rates.items():
                    if rate > 0:
                        self.rates[currency] = 1.0 / rate
                
                # EUR to EUR is 1.0
                self.rates["EUR"] = 1.0
                
                self.last_update = datetime.utcnow()
                logger.info(f"Fetched exchange rates for {len(self.rates)} currencies")
                
        except Exception as e:
            logger.error(f"Error fetching exchange rates: {e}", exc_info=True)


class AlertEngine:
    """Alert engine for large trades and strategies."""
    
    def __init__(self):
        self.rate_cache = ExchangeRateCache()
        self.volume_history: List[tuple] = []  # (timestamp, volume_eur)
        self.alert_callback = None
        # Track alerts already sent to avoid duplicates
        self.alerted_trade_ids: Set[str] = set()
        self.alerted_strategy_ids: Set[str] = set()
        self.last_volume_alert_time: Optional[datetime] = None
    
    def set_callback(self, callback):
        """Set callback function for alerts (receives Alert object)."""
        self.alert_callback = callback
    
    async def process_trade(self, trade: Trade, is_new_trade: bool = True) -> Optional[Alert]:
        """
        Process a trade and generate alerts if needed.
        
        Args:
            trade: Trade to process
            is_new_trade: True if this is a new trade (not an update)
        """
        # FIRST: Check if we already alerted for this trade (before any processing)
        # This is the most important check to prevent duplicate alerts
        if trade.dissemination_identifier in self.alerted_trade_ids:
            logger.debug(f"Trade {trade.dissemination_identifier} already alerted, skipping alert generation")
            # Still convert to EUR for display, but don't alert
            eur_notional = await self._convert_to_eur(
                trade.notional_amount_leg1,
                trade.notional_currency_leg1
            )
            if eur_notional is None:
                eur_notional = await self._convert_to_eur(
                    trade.notional_amount_leg2,
                    trade.notional_currency_leg2
                )
            if eur_notional:
                trade.notional_eur = eur_notional
            return None
        
        # Only generate alerts for new trades
        if not is_new_trade:
            # Still convert to EUR for display, but don't alert
            eur_notional = await self._convert_to_eur(
                trade.notional_amount_leg1,
                trade.notional_currency_leg1
            )
            if eur_notional is None:
                eur_notional = await self._convert_to_eur(
                    trade.notional_amount_leg2,
                    trade.notional_currency_leg2
                )
            if eur_notional:
                trade.notional_eur = eur_notional
            return None
        
        # Convert notional to EUR
        eur_notional = await self._convert_to_eur(
            trade.notional_amount_leg1,
            trade.notional_currency_leg1
        )
        
        if eur_notional is None:
            # Try leg2 if leg1 conversion failed
            eur_notional = await self._convert_to_eur(
                trade.notional_amount_leg2,
                trade.notional_currency_leg2
            )
        
        if eur_notional is None:
            logger.warning(f"Could not convert notional to EUR for trade {trade.dissemination_identifier}")
            return None
        
        trade.notional_eur = eur_notional
        
        # Check thresholds
        severity = None
        if eur_notional >= ALERT_THRESHOLDS_EUR["critical"]:
            severity = "critical"
        elif eur_notional >= ALERT_THRESHOLDS_EUR["high"]:
            severity = "high"
        elif eur_notional >= ALERT_THRESHOLDS_EUR["medium"]:
            severity = "medium"
        
        if severity:
            # Mark this trade as alerted IMMEDIATELY before creating alert
            # This prevents race conditions if the same trade is processed twice
            self.alerted_trade_ids.add(trade.dissemination_identifier)
            
            alert = Alert(
                alert_id=f"ALERT_{uuid.uuid4().hex[:8].upper()}",
                alert_type="LargeTrade",
                severity=severity,
                timestamp=datetime.utcnow(),
                message=f"Large trade detected: {self._format_notional(eur_notional)} EUR",
                trade_id=trade.dissemination_identifier,
                notional_eur=eur_notional
            )
            
            logger.info(f"Creating alert for trade {trade.dissemination_identifier}: {severity} - {self._format_notional(eur_notional)} EUR")
            
            if self.alert_callback:
                await self.alert_callback(alert)
            
            return alert
        
        # Even if no alert, mark as processed to avoid re-processing
        # This is important for trades that don't meet threshold but might come back
        self.alerted_trade_ids.add(trade.dissemination_identifier)
        
        return None
    
    async def process_strategy(self, strategy: Strategy, is_new_strategy: bool = True) -> Optional[Alert]:
        """
        Process a strategy and generate alerts if needed.
        
        Args:
            strategy: Strategy to process
            is_new_strategy: True if this is a newly detected strategy
        """
        # Only generate alerts for new strategies
        if not is_new_strategy:
            return None
        
        # Check if we already alerted for this strategy
        if strategy.strategy_id in self.alerted_strategy_ids:
            return None
        
        if strategy.total_notional_eur >= ALERT_THRESHOLDS_EUR["critical"]:
            severity = "critical"
        elif strategy.total_notional_eur >= ALERT_THRESHOLDS_EUR["high"]:
            severity = "high"
        elif strategy.total_notional_eur >= ALERT_THRESHOLDS_EUR["medium"]:
            severity = "medium"
        else:
            return None
        
        # Mark this strategy as alerted
        self.alerted_strategy_ids.add(strategy.strategy_id)
        
        alert = Alert(
            alert_id=f"ALERT_{uuid.uuid4().hex[:8].upper()}",
            alert_type="StrategyPackage",
            severity=severity,
            timestamp=datetime.utcnow(),
            message=f"Large strategy package: {strategy.strategy_type} - {self._format_notional(strategy.total_notional_eur)} EUR",
            strategy_id=strategy.strategy_id,
            notional_eur=strategy.total_notional_eur
        )
        
        if self.alert_callback:
            await self.alert_callback(alert)
        
        return alert
    
    async def check_volume_trend(self, trades: List[Trade], only_new_trades: bool = True) -> Optional[Alert]:
        """
        Check for volume spikes in last 5 minutes.
        
        Args:
            trades: List of trades to check
            only_new_trades: Only check if there are new trades
        """
        if not only_new_trades or not trades:
            return None
        
        now = datetime.utcnow()
        five_min_ago = now - timedelta(minutes=5)
        
        # Only add new trades to history
        for trade in trades:
            if trade.notional_eur:
                self.volume_history.append((trade.execution_timestamp, trade.notional_eur))
        
        # Clean old history
        self.volume_history = [
            (ts, vol) for ts, vol in self.volume_history
            if ts.replace(tzinfo=None) > five_min_ago
        ]
        
        # Calculate 5-minute volume
        recent_volume = sum(vol for _, vol in self.volume_history)
        
        # Simple threshold: if 5min volume > 5B EUR, alert
        # But only if we haven't alerted in the last 5 minutes
        if recent_volume > 5_000_000_000:  # 5B EUR
            if self.last_volume_alert_time:
                time_since_last_alert = (now - self.last_volume_alert_time).total_seconds()
                if time_since_last_alert < 300:  # Less than 5 minutes
                    return None
            
            self.last_volume_alert_time = now
            
            alert = Alert(
                alert_id=f"ALERT_{uuid.uuid4().hex[:8].upper()}",
                alert_type="Trend",
                severity="high",
                timestamp=now,
                message=f"High volume trend: {self._format_notional(recent_volume)} EUR in last 5 minutes",
                notional_eur=recent_volume
            )
            
            if self.alert_callback:
                await self.alert_callback(alert)
            
            return alert
        
        return None
    
    async def _convert_to_eur(self, notional: float, currency: str) -> Optional[float]:
        """Convert notional amount to EUR."""
        if not notional or not currency:
            return None
        
        if currency == "EUR":
            return notional
        
        rate = await self.rate_cache.get_rate(currency, "EUR")
        if rate is None:
            logger.warning(f"No exchange rate available for {currency}")
            return None
        
        return notional * rate
    
    def _format_notional(self, notional: float) -> str:
        """Format notional for display."""
        if notional >= 1_000_000_000:
            return f"{notional / 1_000_000_000:.2f}B"
        elif notional >= 1_000_000:
            return f"{notional / 1_000_000:.2f}M"
        else:
            return f"{notional:,.0f}"


