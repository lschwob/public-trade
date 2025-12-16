"""
Strategy detection module for multi-leg Interest Rate Swap trades.

This module detects multi-leg strategies from individual trades by:
1. Package strategies: Trades with same package_transaction_price (DTCC-declared)
2. Custom strategies: Trades with same underlying within a time window

Strategy types:
- Spread: 2 legs (e.g., 10Y/30Y spread)
- Butterfly: 3 legs (e.g., 10Y/15Y/30Y butterfly)
- Curve: 4+ legs (curve trade)

Only NEWT (new) trades are considered for strategy detection, MODI (modified)
trades are excluded to prevent false positives.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Set
from collections import defaultdict
import uuid

from app.config import STRATEGY_TIME_WINDOW
from app.models import Trade, Strategy

logger = logging.getLogger(__name__)


class StrategyDetector:
    """
    Detects multi-leg strategies from individual trades.
    
    This class maintains a buffer of recent trades and detects strategies by:
    1. Grouping trades with the same package_transaction_price (DTCC packages)
    2. Grouping trades with the same underlying within STRATEGY_TIME_WINDOW (custom)
    
    Only trades with action_type="NEWT" are considered for strategy detection.
    
    Attributes:
        recent_trades: Buffer of recent trades for custom strategy detection
        package_strategies: Dict of strategies detected from DTCC packages
        custom_strategies: Dict of strategies detected from custom grouping
        trade_to_strategy: Map from trade ID to strategy ID
    """
    
    def __init__(self):
        # Buffer of recent trades for custom detection
        self.recent_trades: List[Trade] = []
        
        # Tracked strategies by package price (DTCC declared)
        self.package_strategies: Dict[str, Strategy] = {}
        
        # Tracked strategies by custom detection
        self.custom_strategies: Dict[str, Strategy] = {}
        
        # Map trade IDs to strategy IDs
        self.trade_to_strategy: Dict[str, str] = {}
    
    def detect_strategies(self, trades: List[Trade]) -> List[Strategy]:
        """
        Detect strategies from a batch of new trades.
        
        Returns:
            List of newly detected or updated strategies.
        """
        new_strategies = []
        
        # Add trades to recent buffer
        self.recent_trades.extend(trades)
        
        # Clean old trades from buffer (older than time window)
        cutoff_time = datetime.utcnow() - timedelta(seconds=STRATEGY_TIME_WINDOW)
        self.recent_trades = [
            t for t in self.recent_trades
            if t.execution_timestamp.replace(tzinfo=None) > cutoff_time
        ]
        
        # Detect DTCC-declared strategies (only for NEWT trades)
        for trade in trades:
            if trade.package_indicator and trade.package_transaction_price and trade.action_type == "NEWT":
                # Get all trades with same package_transaction_price from recent_trades buffer (only NEWT)
                package_trades = [
                    t for t in self.recent_trades
                    if t.package_transaction_price == trade.package_transaction_price
                    and t.action_type == "NEWT"
                ]
                if trade not in package_trades:
                    package_trades.append(trade)
                strategy = self._detect_package_strategy(trade, package_trades)
                if strategy:
                    new_strategies.append(strategy)
        
        # Detect custom strategies
        custom_strategies = self._detect_custom_strategies(trades)
        new_strategies.extend(custom_strategies)
        
        return new_strategies
    
    def _detect_package_strategy(self, trade: Trade, package_trades: Optional[List[Trade]] = None) -> Optional[Strategy]:
        """Detect strategy from DTCC package indicator."""
        package_price = trade.package_transaction_price
        
        # Get all trades in this package (from recent_trades buffer or passed parameter)
        # Only include NEWT trades
        if package_trades is None:
            # Find all trades with same package_transaction_price in recent buffer (only NEWT)
            package_trades = [
                t for t in self.recent_trades
                if t.package_transaction_price == package_price
                and t.action_type == "NEWT"
            ]
            # Add current trade if not already in list and it's a NEWT
            if trade not in package_trades and trade.action_type == "NEWT":
                package_trades.append(trade)
        
        if package_price in self.package_strategies:
            # Update existing strategy (only for NEWT trades)
            strategy = self.package_strategies[package_price]
            if trade.action_type == "NEWT" and trade.dissemination_identifier not in strategy.legs:
                strategy.legs.append(trade.dissemination_identifier)
                strategy.execution_end = max(strategy.execution_end, trade.execution_timestamp)
                # Update total notional (would need EUR conversion, simplified here)
                self.trade_to_strategy[trade.dissemination_identifier] = strategy.strategy_id
            
            # Extract and update instrument pair (only from NEWT trades)
            instrument_pair, instrument_legs = self._extract_instrument_pair(package_trades)
            strategy.instrument_pair = instrument_pair
            strategy.instrument_legs = instrument_legs
            strategy.strategy_type = self._classify_strategy_type(len(strategy.legs), instrument_pair)
            
            return strategy
        else:
            # Create new strategy
            strategy_id = f"PKG_{uuid.uuid4().hex[:8].upper()}"
            underlying = trade.unique_product_identifier_underlier_name or "Unknown"
            
            # Extract instrument pair
            instrument_pair, instrument_legs = self._extract_instrument_pair(package_trades)
            
            strategy = Strategy(
                strategy_id=strategy_id,
                strategy_type="Package",  # Will be classified later
                underlying_name=underlying,
                legs=[trade.dissemination_identifier],
                total_notional_eur=trade.notional_eur or 0.0,
                execution_start=trade.execution_timestamp,
                execution_end=trade.execution_timestamp,
                package_transaction_price=package_price,
                instrument_pair=instrument_pair,
                instrument_legs=instrument_legs
            )
            
            self.package_strategies[package_price] = strategy
            self.trade_to_strategy[trade.dissemination_identifier] = strategy_id
            
            # Classify strategy type based on number of legs and instrument pair
            strategy.strategy_type = self._classify_strategy_type(len(strategy.legs), instrument_pair)
            
            return strategy
    
    def _detect_custom_strategies(self, new_trades: List[Trade]) -> List[Strategy]:
        """Detect custom strategies from trade patterns."""
        new_strategies = []
        
        # Group trades by underlying and time window (only NEWT trades)
        underlying_groups: Dict[str, List[Trade]] = defaultdict(list)
        
        for trade in self.recent_trades:
            # Only include NEWT trades for strategy detection
            if trade.action_type == "NEWT":
                underlying = trade.unique_product_identifier_underlier_name
                if underlying:
                    underlying_groups[underlying].append(trade)
        
        # Check each group for strategy patterns
        for underlying, group_trades in underlying_groups.items():
            if len(group_trades) < 2:
                continue
            
            # Check if trades have different maturities
            maturities = {t.expiration_date for t in group_trades if t.expiration_date}
            if len(maturities) < 2:
                continue
            
            # Check if trades are within time window
            timestamps = [t.execution_timestamp for t in group_trades]
            time_range = max(timestamps) - min(timestamps)
            
            if time_range.total_seconds() <= STRATEGY_TIME_WINDOW:
                # Potential strategy - check if not already detected
                trade_ids = {t.dissemination_identifier for t in group_trades}
                
                # Check if any trade is already in a custom strategy
                existing_strategy_id = None
                for trade_id in trade_ids:
                    if trade_id in self.trade_to_strategy:
                        existing_strategy_id = self.trade_to_strategy[trade_id]
                        break
                
                # Extract instrument pair from group trades
                instrument_pair, instrument_legs = self._extract_instrument_pair(group_trades)
                
                if existing_strategy_id:
                    # Update existing strategy
                    strategy = self.custom_strategies[existing_strategy_id]
                    for trade in group_trades:
                        if trade.dissemination_identifier not in strategy.legs:
                            strategy.legs.append(trade.dissemination_identifier)
                    strategy.execution_end = max(timestamps)
                    # Recalculate total notional
                    strategy.total_notional_eur = sum(
                        t.notional_eur or 0.0 for t in group_trades
                    )
                    # Update instrument pair
                    strategy.instrument_pair = instrument_pair
                    strategy.instrument_legs = instrument_legs
                    strategy.strategy_type = self._classify_strategy_type(len(strategy.legs), instrument_pair)
                else:
                    # Create new strategy
                    strategy_id = f"CUST_{uuid.uuid4().hex[:8].upper()}"
                    strategy = Strategy(
                        strategy_id=strategy_id,
                        strategy_type=self._classify_strategy_type(len(group_trades), instrument_pair),
                        underlying_name=underlying,
                        legs=[t.dissemination_identifier for t in group_trades],
                        total_notional_eur=sum(t.notional_eur or 0.0 for t in group_trades),
                        execution_start=min(timestamps),
                        execution_end=max(timestamps),
                        package_transaction_price=None,
                        instrument_pair=instrument_pair,
                        instrument_legs=instrument_legs
                    )
                    
                    self.custom_strategies[strategy_id] = strategy
                    for trade_id in trade_ids:
                        self.trade_to_strategy[trade_id] = strategy_id
                    
                    new_strategies.append(strategy)
        
        return new_strategies
    
    def _extract_instrument_pair(self, strategy_trades: List[Trade]) -> tuple[Optional[str], Optional[List[str]]]:
        """
        Extract instrument pair from strategy trades.
        
        Args:
            strategy_trades: List of Trade objects in the strategy
            
        Returns:
            tuple: (instrument_pair_string, list_of_instruments)
            Examples:
                - 2 legs: ("10Y/30Y", ["10Y", "30Y"])
                - 3 legs: ("2Y/5Y/10Y", ["2Y", "5Y", "10Y"])
                - 4+ legs: ("2Y/5Y/10Y/30Y", ["2Y", "5Y", "10Y", "30Y"])
        """
        # Extract instruments from trades
        instruments = []
        for trade in strategy_trades:
            if trade.instrument:
                instruments.append(trade.instrument)
        
        # Remove duplicates and sort
        unique_instruments = list(set(instruments))
        if not unique_instruments:
            return None, None
        
        # Sort by instrument order (extract base tenor for sorting)
        instrument_order = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"]
        def get_sort_key(instrument):
            # Extract base instrument for sorting (e.g., "10Y" from "5Y10Y")
            base = instrument.split('/')[0] if '/' in instrument else instrument
            return instrument_order.index(base) if base in instrument_order else 999
        
        sorted_instruments = sorted(unique_instruments, key=get_sort_key)
        
        # Format as string
        instrument_pair = "/".join(sorted_instruments)
        
        return instrument_pair, sorted_instruments
    
    def _classify_strategy_type(self, num_legs: int, instrument_pair: Optional[str] = None) -> str:
        """Classify strategy type based on number of legs and optionally add instrument info."""
        if num_legs == 2:
            base_type = "Spread"
        elif num_legs == 3:
            base_type = "Butterfly"
        elif num_legs >= 4:
            base_type = "Curve"
        else:
            base_type = "Package"
        
        # Add instrument pair if available
        if instrument_pair:
            return f"{instrument_pair} {base_type}"
        return base_type
    
    def get_strategy_id_for_trade(self, trade_id: str) -> Optional[str]:
        """Get strategy ID for a trade, if any."""
        return self.trade_to_strategy.get(trade_id)
    
    def get_all_strategies(self) -> List[Strategy]:
        """Get all tracked strategies."""
        return list(self.package_strategies.values()) + list(self.custom_strategies.values())


