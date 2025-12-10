"""DTCC API polling module."""

import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from dateutil import parser
import httpx
from app.config import DTCC_API_URL, DTCC_HEADERS, POLL_INTERVAL
from app.models import Trade

logger = logging.getLogger(__name__)


def parse_notional(notional_str) -> float:
    """Parse notional string like '300,000,000' or '650,000,000+' to float."""
    if not notional_str:
        return 0.0
    # Handle string or number
    if isinstance(notional_str, (int, float)):
        return float(notional_str)
    # Remove commas, whitespace, and trailing + sign
    cleaned = str(notional_str).strip().replace(",", "").replace(" ", "").rstrip("+")
    if not cleaned or cleaned == "":
        return 0.0
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        logger.warning(f"Could not parse notional: {notional_str}")
        return 0.0


def parse_rate(rate_str: str) -> Optional[float]:
    """Parse rate string to float."""
    if not rate_str or not rate_str.strip():
        return None
    try:
        return float(rate_str)
    except (ValueError, TypeError):
        return None


def parse_date(date_str: str) -> Optional[datetime]:
    """Parse date string to datetime."""
    if not date_str or not date_str.strip():
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def calculate_tenor(effective_date: Optional[str], expiration_date: Optional[str]) -> Optional[str]:
    """Calculate tenor from dates (e.g., '2Y', '5Y', '10Y')."""
    if not effective_date or not expiration_date:
        return None
    
    try:
        eff = datetime.fromisoformat(effective_date)
        exp = datetime.fromisoformat(expiration_date)
        years = (exp - eff).days / 365.25
        
        if years < 1:
            return f"{int(years * 12)}M"
        elif years < 2:
            return "1Y"
        elif years < 3:
            return "2Y"
        elif years < 5:
            return "3Y"
        elif years < 7:
            return "5Y"
        elif years < 10:
            return "7Y"
        elif years < 15:
            return "10Y"
        elif years < 20:
            return "15Y"
        elif years < 30:
            return "20Y"
        else:
            return "30Y+"
    except (ValueError, TypeError):
        return None


def normalize_trade(raw_trade: Dict[str, Any]) -> Optional[Trade]:
    """Normalize raw trade data from DTCC API to Trade model."""
    try:
        # Detect forward trades
        effective_date_str = raw_trade.get("effectiveDate")
        effective_date_dt = None
        is_forward = False
        
        if effective_date_str:
            try:
                effective_date_dt = parser.isoparse(effective_date_str)
                # If effective date is more than 2 business days in the future, it's a forward
                now = datetime.utcnow()
                # Remove timezone for comparison
                if effective_date_dt.tzinfo:
                    effective_date_dt_naive = effective_date_dt.replace(tzinfo=None)
                else:
                    effective_date_dt_naive = effective_date_dt
                days_diff = (effective_date_dt_naive - now).days
                is_forward = days_diff > 2
            except Exception as e:
                logger.warning(f"Error parsing effectiveDate: {e}")
        
        return Trade(
            dissemination_identifier=raw_trade.get("disseminationIdentifier", ""),
            original_dissemination_identifier=raw_trade.get("originalDisseminationIdentifier"),
            action_type=raw_trade.get("actionType", ""),
            event_type=raw_trade.get("eventType", ""),
            event_timestamp=parse_date(raw_trade.get("eventTimestamp", "")) or datetime.utcnow(),
            execution_timestamp=parse_date(raw_trade.get("executionTimestamp", "")) or datetime.utcnow(),
            effective_date=effective_date_str,
            effective_date_dt=effective_date_dt,
            expiration_date=raw_trade.get("expirationDate"),
            notional_amount_leg1=parse_notional(raw_trade.get("notionalAmountLeg1") or ""),
            notional_amount_leg2=parse_notional(raw_trade.get("notionalAmountLeg2") or ""),
            notional_currency_leg1=raw_trade.get("notionalCurrencyLeg1", ""),
            notional_currency_leg2=raw_trade.get("notionalCurrencyLeg2", ""),
            fixed_rate_leg1=parse_rate(raw_trade.get("fixedRateLeg1")),
            fixed_rate_leg2=parse_rate(raw_trade.get("fixedRateLeg2")),
            spread_leg1=parse_rate(raw_trade.get("spreadLeg1")),
            spread_leg2=parse_rate(raw_trade.get("spreadLeg2")),
            unique_product_identifier=raw_trade.get("uniqueProductIdentifier", ""),
            unique_product_identifier_short_name=raw_trade.get("uniqueProductIdentifierShortName"),
            unique_product_identifier_underlier_name=raw_trade.get("uniqueProductIdentifierUnderlierName"),
            platform_identifier=raw_trade.get("platformIdentifier"),
            package_indicator=raw_trade.get("packageIndicator", "FALSE").upper() == "TRUE",
            package_transaction_price=raw_trade.get("packageTransactionPrice"),
            tenor=calculate_tenor(
                raw_trade.get("effectiveDate"),
                raw_trade.get("expirationDate")
            ),
            is_forward=is_forward
        )
    except Exception as e:
        logger.error(f"Error normalizing trade: {e}", exc_info=True)
        return None


async def poll_dtcc_api() -> List[Trade]:
    """
    Poll DTCC API and return list of normalized trades.
    
    Returns:
        List of Trade objects, empty list on error.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(DTCC_API_URL, headers=DTCC_HEADERS)
            response.raise_for_status()
            
            data = response.json()
            trade_list = data.get("tradeList", [])
            
            trades = []
            for raw_trade in trade_list:
                trade = normalize_trade(raw_trade)
                if trade:
                    trades.append(trade)
            
            logger.info(f"Polled {len(trades)} trades from DTCC API")
            return trades
            
        except httpx.HTTPError as e:
            logger.error(f"HTTP error polling DTCC API: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error polling DTCC API: {e}", exc_info=True)
            return []


class Poller:
    """DTCC API poller with exponential backoff."""
    
    def __init__(self, callback):
        """
        Initialize poller.
        
        Args:
            callback: Async function that receives List[Trade] as argument
        """
        self.callback = callback
        self.running = False
        self.retry_delay = 1
        self.max_retry_delay = 60
    
    async def _poll_with_retry(self):
        """Poll with exponential backoff on errors."""
        while self.running:
            try:
                trades = await poll_dtcc_api()
                if trades:
                    await self.callback(trades)
                    self.retry_delay = 1  # Reset on success
                await asyncio.sleep(POLL_INTERVAL)
            except Exception as e:
                logger.error(f"Error in polling loop: {e}", exc_info=True)
                await asyncio.sleep(self.retry_delay)
                self.retry_delay = min(self.retry_delay * 2, self.max_retry_delay)
    
    def stop(self):
        """Stop polling loop."""
        self.running = False
        logger.info("DTCC poller stopped")

