"""
DTCC API polling module.

This module handles polling the DTCC (Depository Trust & Clearing Corporation) API
for Interest Rate Swap trade data. It includes:
- API polling with exponential backoff retry logic
- Trade data normalization and parsing
- Tenor calculation from dates
- Forward trade detection

The module polls the DTCC API at regular intervals and normalizes raw trade data
into the application's Trade model format.
"""

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
    """
    Parse notional string to float, handling various formats.
    
    Handles strings with commas, spaces, and trailing '+' signs (e.g., "650,000,000+").
    Also handles numeric types directly.
    
    Args:
        notional_str: Notional value as string (e.g., "300,000,000" or "650,000,000+")
                     or as numeric type
        
    Returns:
        Parsed notional as float, or 0.0 if parsing fails
        
    Examples:
        >>> parse_notional("300,000,000")
        300000000.0
        >>> parse_notional("650,000,000+")
        650000000.0
        >>> parse_notional(1000000)
        1000000.0
    """
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
    """
    Parse rate string to float.
    
    Args:
        rate_str: Rate as string (e.g., "0.025" for 2.5%)
        
    Returns:
        Parsed rate as float, or None if parsing fails
    """
    if not rate_str or not rate_str.strip():
        return None
    try:
        return float(rate_str)
    except (ValueError, TypeError):
        return None


def parse_date(date_str: str) -> Optional[datetime]:
    """
    Parse ISO date string to datetime object.
    
    Handles ISO format strings with or without timezone information.
    Converts 'Z' suffix to UTC timezone.
    
    Args:
        date_str: ISO format date string (e.g., "2024-01-15T10:30:00Z")
        
    Returns:
        Parsed datetime object, or None if parsing fails
    """
    if not date_str or not date_str.strip():
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def calculate_tenor(effective_date: Optional[str], expiration_date: Optional[str]) -> Optional[str]:
    """
    Calculate tenor (maturity) from effective and expiration dates.
    
    Tenor is calculated as the time difference between effective and expiration dates,
    rounded to standard market tenors (3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 15Y, 20Y, 30Y).
    
    Args:
        effective_date: Effective date of the swap (ISO string)
        expiration_date: Expiration/maturity date of the swap (ISO string)
        
    Returns:
        Tenor string (e.g., "2Y", "5Y", "10Y", "30Y+"), or None if calculation fails
        
    Examples:
        >>> calculate_tenor("2024-01-01", "2026-01-01")
        "2Y"
        >>> calculate_tenor("2024-01-01", "2034-01-01")
        "10Y"
    """
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
    """
    Normalize raw trade data from DTCC API to Trade model.
    
    This function converts raw JSON trade data from the DTCC API into a normalized
    Trade object. It handles:
    - Date parsing and validation
    - Notional parsing (handles commas, spaces, trailing '+')
    - Rate parsing
    - Tenor calculation
    - Forward trade detection (if effective date > 2 days in future)
    
    Args:
        raw_trade: Raw trade dictionary from DTCC API
        
    Returns:
        Normalized Trade object, or None if normalization fails
        
    Raises:
        Logs errors but doesn't raise exceptions (returns None on failure)
    """
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
    
    Makes an HTTP GET request to the DTCC API endpoint, parses the JSON response,
    and normalizes all trades in the response. Handles HTTP errors gracefully
    by returning an empty list.
    
    Returns:
        List of normalized Trade objects, empty list on error or if no trades found
        
    Note:
        This function is async and should be called with await. It uses httpx
        for asynchronous HTTP requests with a 10-second timeout.
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
    """
    DTCC API poller with exponential backoff retry logic.
    
    This class manages continuous polling of the DTCC API at regular intervals.
    It implements exponential backoff retry logic to handle temporary API failures
    gracefully, automatically increasing the delay between retries up to a maximum.
    
    Attributes:
        callback: Async function called with List[Trade] when new trades are polled
        running: Boolean flag to control polling loop
        retry_delay: Current retry delay in seconds (starts at 1, doubles on error)
        max_retry_delay: Maximum retry delay (60 seconds)
    
    Example:
        >>> async def process_trades(trades: List[Trade]):
        ...     print(f"Received {len(trades)} trades")
        >>> poller = Poller(process_trades)
        >>> poller.running = True
        >>> await poller._poll_with_retry()  # Runs continuously
    """
    
    def __init__(self, callback):
        """
        Initialize poller with callback function.
        
        Args:
            callback: Async function that receives List[Trade] as argument.
                     This function is called whenever new trades are polled from the API.
        """
        self.callback = callback
        self.running = False
        self.retry_delay = 1
        self.max_retry_delay = 60
    
    async def _poll_with_retry(self):
        """
        Poll with exponential backoff on errors.
        
        Continuously polls the DTCC API at POLL_INTERVAL seconds. On success,
        resets retry delay to 1 second. On error, doubles the retry delay
        (up to max_retry_delay) before retrying.
        
        This method runs indefinitely until self.running is set to False.
        It should be called as an async task (e.g., with asyncio.create_task()).
        
        Note:
            This is a private method. Use asyncio.create_task() to run it:
            asyncio.create_task(poller._poll_with_retry())
        """
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
        """
        Stop the polling loop.
        
        Sets the running flag to False, which causes the _poll_with_retry()
        loop to exit on the next iteration.
        """
        self.running = False
        logger.info("DTCC poller stopped")

