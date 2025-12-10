"""Strategy detection module for multi-leg trades."""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Set
from collections import defaultdict
import uuid

from app.config import STRATEGY_TIME_WINDOW
from app.models import Trade, Strategy

logger = logging.getLogger(__name__)


class StrategyDetector:
    """Detects multi-leg strategies from trades."""
    
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
        
        # Detect DTCC-declared strategies
        for trade in trades:
            if trade.package_indicator and trade.package_transaction_price:
                strategy = self._detect_package_strategy(trade)
                if strategy:
                    new_strategies.append(strategy)
        
        # Detect custom strategies
        custom_strategies = self._detect_custom_strategies(trades)
        new_strategies.extend(custom_strategies)
        
        return new_strategies
    
    def _detect_package_strategy(self, trade: Trade) -> Optional[Strategy]:
        """Detect strategy from DTCC package indicator."""
        package_price = trade.package_transaction_price
        
        if package_price in self.package_strategies:
            # Update existing strategy
            strategy = self.package_strategies[package_price]
            if trade.dissemination_identifier not in strategy.legs:
                strategy.legs.append(trade.dissemination_identifier)
                strategy.execution_end = max(strategy.execution_end, trade.execution_timestamp)
                # Update total notional (would need EUR conversion, simplified here)
                self.trade_to_strategy[trade.dissemination_identifier] = strategy.strategy_id
            return strategy
        else:
            # Create new strategy
            strategy_id = f"PKG_{uuid.uuid4().hex[:8].upper()}"
            underlying = trade.unique_product_identifier_underlier_name or "Unknown"
            
            strategy = Strategy(
                strategy_id=strategy_id,
                strategy_type="Package",  # Will be classified later
                underlying_name=underlying,
                legs=[trade.dissemination_identifier],
                total_notional_eur=trade.notional_eur or 0.0,
                execution_start=trade.execution_timestamp,
                execution_end=trade.execution_timestamp,
                package_transaction_price=package_price
            )
            
            self.package_strategies[package_price] = strategy
            self.trade_to_strategy[trade.dissemination_identifier] = strategy_id
            
            # Classify strategy type based on number of legs
            strategy.strategy_type = self._classify_strategy_type(len(strategy.legs))
            
            return strategy
    
    def _detect_custom_strategies(self, new_trades: List[Trade]) -> List[Strategy]:
        """Detect custom strategies from trade patterns."""
        new_strategies = []
        
        # Group trades by underlying and time window
        underlying_groups: Dict[str, List[Trade]] = defaultdict(list)
        
        for trade in self.recent_trades:
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
                    strategy.strategy_type = self._classify_strategy_type(len(strategy.legs))
                else:
                    # Create new strategy
                    strategy_id = f"CUST_{uuid.uuid4().hex[:8].upper()}"
                    strategy = Strategy(
                        strategy_id=strategy_id,
                        strategy_type=self._classify_strategy_type(len(group_trades)),
                        underlying_name=underlying,
                        legs=[t.dissemination_identifier for t in group_trades],
                        total_notional_eur=sum(t.notional_eur or 0.0 for t in group_trades),
                        execution_start=min(timestamps),
                        execution_end=max(timestamps),
                        package_transaction_price=None
                    )
                    
                    self.custom_strategies[strategy_id] = strategy
                    for trade_id in trade_ids:
                        self.trade_to_strategy[trade_id] = strategy_id
                    
                    new_strategies.append(strategy)
        
        return new_strategies
    
    def _classify_strategy_type(self, num_legs: int) -> str:
        """Classify strategy type based on number of legs."""
        if num_legs == 2:
            return "Spread"
        elif num_legs == 3:
            return "Butterfly"
        elif num_legs >= 4:
            return "Curve"
        else:
            return "Package"
    
    def get_strategy_id_for_trade(self, trade_id: str) -> Optional[str]:
        """Get strategy ID for a trade, if any."""
        return self.trade_to_strategy.get(trade_id)
    
    def get_all_strategies(self) -> List[Strategy]:
        """Get all tracked strategies."""
        return list(self.package_strategies.values()) + list(self.custom_strategies.values())


