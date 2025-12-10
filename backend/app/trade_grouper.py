"""
Trade grouper module for grouping related trades.

This module groups trades that share common characteristics (same timestamp,
same underlying, same strategy) for display purposes in the frontend.
Grouped trades can be expanded to show individual legs.

Grouping criteria:
- Same execution timestamp (within 1 second)
- Same underlying + same timestamp window
- Same strategy_id
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Set
from collections import defaultdict

from app.config import STRATEGY_TIME_WINDOW
from app.models import Trade

logger = logging.getLogger(__name__)


class TradeGrouper:
    """
    Groups related trades together for display.
    
    This class identifies trades that should be grouped together in the
    frontend blotter. Grouped trades are displayed as a single row
    that can be expanded to show all individual trades.
    
    Attributes:
        trade_groups: Dict mapping group_id to list of trade IDs
        trade_to_group: Dict mapping trade_id to group_id
        group_counter: Counter for generating unique group IDs
    """
    
    def __init__(self):
        # Map group_id to list of trade IDs
        self.trade_groups: Dict[str, List[str]] = {}
        # Map trade_id to group_id
        self.trade_to_group: Dict[str, str] = {}
        # Group counter
        self.group_counter = 0
    
    def group_trades(self, trades: List[Trade]) -> Dict[str, List[str]]:
        """
        Group trades based on various criteria.
        
        Returns:
            Dict mapping group_id to list of trade IDs
        """
        # Group by same execution timestamp (within 1 second)
        timestamp_groups: Dict[str, List[Trade]] = defaultdict(list)
        for trade in trades:
            # Round to nearest second for grouping
            timestamp_key = trade.execution_timestamp.replace(microsecond=0).isoformat()
            timestamp_groups[timestamp_key].append(trade)
        
        # Group by same underlying + same timestamp window
        underlying_timestamp_groups: Dict[str, List[Trade]] = defaultdict(list)
        for trade in trades:
            underlying = trade.unique_product_identifier_underlier_name or "Unknown"
            timestamp_key = trade.execution_timestamp.replace(microsecond=0).isoformat()
            key = f"{underlying}_{timestamp_key}"
            underlying_timestamp_groups[key].append(trade)
        
        # Group by strategy_id
        strategy_groups: Dict[str, List[Trade]] = defaultdict(list)
        for trade in trades:
            if trade.strategy_id:
                strategy_groups[trade.strategy_id].append(trade)
        
        # Group by package_transaction_price
        package_groups: Dict[str, List[Trade]] = defaultdict(list)
        for trade in trades:
            if trade.package_transaction_price:
                package_groups[trade.package_transaction_price].append(trade)
        
        # Merge all groups and assign group IDs
        all_groups: Dict[str, List[str]] = {}
        
        # Process timestamp groups (trades at exact same time)
        for timestamp_key, group_trades in timestamp_groups.items():
            if len(group_trades) > 1:
                group_id = f"TIME_{timestamp_key}"
                all_groups[group_id] = [t.dissemination_identifier for t in group_trades]
                for trade in group_trades:
                    self.trade_to_group[trade.dissemination_identifier] = group_id
        
        # Process underlying + timestamp groups
        for key, group_trades in underlying_timestamp_groups.items():
            if len(group_trades) > 1:
                # Check if not already in a group
                ungrouped = [t for t in group_trades 
                           if t.dissemination_identifier not in self.trade_to_group]
                if len(ungrouped) > 1:
                    group_id = f"UNDERLYING_{self.group_counter}"
                    self.group_counter += 1
                    all_groups[group_id] = [t.dissemination_identifier for t in ungrouped]
                    for trade in ungrouped:
                        self.trade_to_group[trade.dissemination_identifier] = group_id
        
        # Process strategy groups
        for strategy_id, group_trades in strategy_groups.items():
            if len(group_trades) > 1:
                group_id = f"STRATEGY_{strategy_id}"
                all_groups[group_id] = [t.dissemination_identifier for t in group_trades]
                for trade in group_trades:
                    # Only assign if not already in a group
                    if trade.dissemination_identifier not in self.trade_to_group:
                        self.trade_to_group[trade.dissemination_identifier] = group_id
        
        # Process package groups
        for package_price, group_trades in package_groups.items():
            if len(group_trades) > 1:
                group_id = f"PACKAGE_{package_price}"
                all_groups[group_id] = [t.dissemination_identifier for t in group_trades]
                for trade in group_trades:
                    # Only assign if not already in a group
                    if trade.dissemination_identifier not in self.trade_to_group:
                        self.trade_to_group[trade.dissemination_identifier] = group_id
        
        # Update global groups
        for group_id, trade_ids in all_groups.items():
            if group_id not in self.trade_groups:
                self.trade_groups[group_id] = []
            # Add new trade IDs
            for trade_id in trade_ids:
                if trade_id not in self.trade_groups[group_id]:
                    self.trade_groups[group_id].append(trade_id)
        
        return self.trade_groups
    
    def get_group_for_trade(self, trade_id: str) -> List[str]:
        """Get all trade IDs in the same group as the given trade."""
        group_id = self.trade_to_group.get(trade_id)
        if group_id and group_id in self.trade_groups:
            return self.trade_groups[group_id]
        return []
    
    def get_group_id_for_trade(self, trade_id: str) -> str:
        """Get group ID for a trade."""
        return self.trade_to_group.get(trade_id, "")

