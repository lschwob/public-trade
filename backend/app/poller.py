"""
Internal API polling module.

This module handles polling the internal API for Interest Rate Swap trade data
with pre-classified strategies. It includes:
- API polling with exponential backoff retry logic
- Trade data normalization and parsing from internal API format
- Conversion from internal API response to Trade and Strategy models

The module polls the internal API at regular intervals and normalizes raw trade data
into the application's Trade and Strategy model formats.
"""

import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from dateutil import parser
import httpx
from app.config import INTERNAL_API_URL, INTERNAL_API_HEADERS, INTERNAL_API_TOKEN, POLL_INTERVAL
from app.models import Trade, Strategy, InternalAPIResponse, Leg, StrategyAPIResponse, LegAPI

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


def normalize_leg_api_to_trade(leg: LegAPI, strategy_id: str, execution_datetime: Optional[str] = None) -> Optional[Trade]:
    """
    Convert a LegAPI from new API to a Trade model.
    
    This function converts a LegAPI object from the new API response into a normalized
    Trade object. It handles:
    - Date parsing and validation
    - Notional parsing
    - Rate parsing
    - Tenor extraction
    - Forward trade detection
    
    Args:
        leg: LegAPI object from new API
        strategy_id: Strategy ID this leg belongs to
        execution_datetime: Execution datetime from parent strategy
        
    Returns:
        Normalized Trade object, or None if normalization fails
    """
    try:
        # Parse dates
        effective_date_str = leg.Effectivedate
        expiration_date_str = leg.Expirationdate
        execution_timestamp_str = leg.Executiontime or leg.Eventtime or execution_datetime
        
        effective_date_dt = None
        is_forward = False
        
        if effective_date_str:
            try:
                effective_date_dt = parser.isoparse(effective_date_str)
                now = datetime.utcnow()
                if effective_date_dt.tzinfo:
                    effective_date_dt_naive = effective_date_dt.replace(tzinfo=None)
                else:
                    effective_date_dt_naive = effective_date_dt
                days_diff = (effective_date_dt_naive - now).days
                is_forward = days_diff > 2
            except Exception as e:
                logger.warning(f"Error parsing effectiveDate: {e}")
        
        execution_timestamp = parse_date(execution_timestamp_str) or datetime.utcnow()
        
        # Extract notional - use leg1, fallback to leg2
        notional_leg1 = leg.Notionalamountleg1 or 0.0
        notional_leg2 = leg.Notionalamountleg2 or notional_leg1
        
        # Extract rates
        fixed_rate_leg1 = leg.Fixedrateleg1
        fixed_rate_leg2 = leg.Fixedrateleg2
        spread_leg1 = leg.Spreadleg1
        spread_leg2 = leg.Spreadleg2
        
        # Extract identifier
        dissemination_id = leg.id or leg.Upifisn or leg.Upi
        if not dissemination_id:
            # Create a unique identifier based on leg data
            leg_dict = leg.dict(exclude_none=True)
            leg_hash = hash(str(sorted(leg_dict.items())))
            dissemination_id = f"LEG_{abs(leg_hash)}"
        
        # Extract underlying from Rateunderlier or Upi
        underlying_name = leg.Rateunderlier or leg.Upi or "UNKNOWN"
        
        # Extract tenor
        tenor = leg.Tenorleg1 or leg.Tenorleg2
        if not tenor and effective_date_str and expiration_date_str:
            tenor = calculate_tenor(effective_date_str, expiration_date_str)
        
        # Determine currency (default to EUR if not specified)
        # In the new API, we might need to infer from context
        notional_currency_leg1 = "EUR"  # Default, could be enhanced with currency detection
        notional_currency_leg2 = "EUR"
        
        return Trade(
            dissemination_identifier=dissemination_id,
            original_dissemination_identifier=None,
            action_type="NEWT",  # Default to NEWT
            event_type="TRADE",
            event_timestamp=execution_timestamp,
            execution_timestamp=execution_timestamp,
            effective_date=effective_date_str,
            effective_date_dt=effective_date_dt,
            expiration_date=expiration_date_str,
            notional_amount_leg1=notional_leg1,
            notional_amount_leg2=notional_leg2,
            notional_currency_leg1=notional_currency_leg1,
            notional_currency_leg2=notional_currency_leg2,
            fixed_rate_leg1=fixed_rate_leg1,
            fixed_rate_leg2=fixed_rate_leg2,
            spread_leg1=spread_leg1,
            spread_leg2=spread_leg2,
            unique_product_identifier=leg.Upi or "UNKNOWN",
            unique_product_identifier_short_name=None,
            unique_product_identifier_underlier_name=underlying_name,
            platform_identifier=leg.platformcode or leg.Platformname,
            package_indicator=leg.Packageindicator or False,
            package_transaction_price=leg.Packagetransactionprice,
            strategy_id=strategy_id,
            notional_eur=notional_leg1 if notional_currency_leg1 == "EUR" else None,  # Simplified
            tenor=tenor,
            is_forward=is_forward
        )
    except Exception as e:
        logger.error(f"Error normalizing leg API to trade: {e}", exc_info=True)
        return None


def normalize_leg_to_trade(leg: Leg, strategy_id: Optional[str] = None, date_str: Optional[str] = None) -> Optional[Trade]:
    """
    Convert a Leg from internal API to a Trade model.
    
    This function converts a Leg object from the internal API response into a normalized
    Trade object. It handles:
    - Date parsing and validation
    - Notional parsing
    - Rate parsing
    - Tenor extraction or calculation
    - Forward trade detection
    
    Args:
        leg: Leg object from internal API
        strategy_id: Optional strategy ID if this leg belongs to a strategy
        date_str: Date string from the parent response
        
    Returns:
        Normalized Trade object, or None if normalization fails
    """
    try:
        # Parse dates
        effective_date_str = leg.effective_date
        expiration_date_str = leg.expiration_date
        execution_timestamp_str = leg.execution_timestamp or date_str
        
        effective_date_dt = None
        is_forward = False
        
        if effective_date_str:
            try:
                effective_date_dt = parser.isoparse(effective_date_str)
                now = datetime.utcnow()
                if effective_date_dt.tzinfo:
                    effective_date_dt_naive = effective_date_dt.replace(tzinfo=None)
                else:
                    effective_date_dt_naive = effective_date_dt
                days_diff = (effective_date_dt_naive - now).days
                is_forward = days_diff > 2
            except Exception as e:
                logger.warning(f"Error parsing effectiveDate: {e}")
        
        execution_timestamp = parse_date(execution_timestamp_str) or datetime.utcnow()
        
        # Extract notional - try different possible field names
        notional = leg.notional_amount or 0.0
        notional_currency = leg.notional_currency or "EUR"
        
        # Extract rates
        fixed_rate = leg.fixed_rate
        spread = leg.spread
        
        # Extract identifier
        # Generate a unique ID if not provided
        if leg.dissemination_identifier:
            dissemination_id = leg.dissemination_identifier
        else:
            # Create a unique identifier based on leg data
            leg_dict = leg.dict(exclude_none=True)
            leg_hash = hash(str(sorted(leg_dict.items())))
            dissemination_id = f"LEG_{abs(leg_hash)}"
        
        return Trade(
            dissemination_identifier=dissemination_id,
            original_dissemination_identifier=None,
            action_type="NEWT",  # Default to NEWT
            event_type="TRADE",
            event_timestamp=execution_timestamp,
            execution_timestamp=execution_timestamp,
            effective_date=effective_date_str,
            effective_date_dt=effective_date_dt,
            expiration_date=expiration_date_str,
            notional_amount_leg1=notional,
            notional_amount_leg2=notional,  # Use same for both legs if not specified
            notional_currency_leg1=notional_currency,
            notional_currency_leg2=notional_currency,
            fixed_rate_leg1=fixed_rate,
            fixed_rate_leg2=None,
            spread_leg1=spread,
            spread_leg2=None,
            unique_product_identifier=leg.underlying_name or "UNKNOWN",
            unique_product_identifier_short_name=None,
            unique_product_identifier_underlier_name=leg.underlying_name,
            platform_identifier=None,
            package_indicator=False,  # Will be set based on strategy context
            package_transaction_price=None,
            strategy_id=strategy_id,
            notional_eur=notional if notional_currency == "EUR" else None,
            tenor=leg.tenor or calculate_tenor(effective_date_str, expiration_date_str),
            is_forward=is_forward
        )
    except Exception as e:
        logger.error(f"Error normalizing leg to trade: {e}", exc_info=True)
        return None


def convert_strategy_api_response(response_data: StrategyAPIResponse) -> Tuple[List[Trade], Optional[Strategy]]:
    """
    Convert new StrategyAPIResponse to Trade and Strategy models.
    
    This function converts a StrategyAPIResponse object into:
    - A list of Trade objects (one per leg)
    - A Strategy object representing the complete strategy
    
    Args:
        response_data: StrategyAPIResponse object from new API
        
    Returns:
        Tuple of (list of Trade objects, Strategy object)
    """
    trades = []
    strategy = None
    
    try:
        # Parse execution datetime
        execution_datetime = response_data.executiondatetime
        
        # Convert each leg to a Trade
        leg_trades = []
        for leg in response_data.legs:
            trade = normalize_leg_api_to_trade(leg, strategy_id=response_data.id, execution_datetime=execution_datetime)
            if trade:
                leg_trades.append(trade)
                trades.append(trade)
        
        # Create Strategy if there are legs
        if len(leg_trades) > 0:
            # Extract underlying name from strategy or first leg
            underlying_name = response_data.Underlier or (leg_trades[0].unique_product_identifier_underlier_name if leg_trades else "Unknown")
            
            # Extract tenors from legs
            tenors = []
            for leg in response_data.legs:
                if leg.Tenorleg1:
                    tenors.append(leg.Tenorleg1)
                if leg.Tenorleg2:
                    tenors.append(leg.Tenorleg2)
            
            # Also get tenors from trades
            trade_tenors = [t.tenor for t in leg_trades if t.tenor]
            tenors.extend(trade_tenors)
            
            unique_tenors = sorted(list(set(tenors))) if tenors else []
            tenor_pair = "/".join(unique_tenors) if unique_tenors else None
            
            # Use strategy Tenor if available
            if response_data.Tenor and response_data.Tenor not in unique_tenors:
                unique_tenors.insert(0, response_data.Tenor)
                tenor_pair = "/".join(unique_tenors)
            
            # Classify strategy type based on leg count
            num_legs = response_data.Legscount or len(leg_trades)
            if num_legs == 1:
                strategy_type = "Outright"
            elif num_legs == 2:
                strategy_type = "Spread"
            elif num_legs == 3:
                strategy_type = "Butterfly"
            elif num_legs >= 4:
                strategy_type = "Curve"
            else:
                strategy_type = "Package"
            
            if tenor_pair:
                strategy_type = f"{tenor_pair} {strategy_type}"
            
            # Calculate total notional
            total_notional = response_data.Notional or response_data.Notionaltruncated
            if not total_notional:
                total_notional = sum(t.notional_eur or t.notional_amount_leg1 for t in leg_trades)
            
            # Parse execution times
            execution_start = min(t.execution_timestamp for t in leg_trades) if leg_trades else datetime.utcnow()
            execution_end = max(t.execution_timestamp for t in leg_trades) if leg_trades else datetime.utcnow()
            
            if execution_datetime:
                try:
                    exec_dt = parse_date(execution_datetime)
                    if exec_dt:
                        execution_start = exec_dt
                        execution_end = exec_dt
                except:
                    pass
            
            # Get package transaction price from first leg that has it
            package_transaction_price = None
            for leg in response_data.legs:
                if leg.Packagetransactionprice:
                    package_transaction_price = leg.Packagetransactionprice
                    break
            
            strategy = Strategy(
                strategy_id=response_data.id,
                strategy_type=strategy_type,
                underlying_name=underlying_name,
                legs=[t.dissemination_identifier for t in leg_trades],
                total_notional_eur=total_notional,
                execution_start=execution_start,
                execution_end=execution_end,
                package_transaction_price=package_transaction_price,
                tenor_pair=tenor_pair,
                tenor_legs=unique_tenors if unique_tenors else None
            )
        
    except Exception as e:
        logger.error(f"Error converting strategy API response: {e}", exc_info=True)
    
    return trades, strategy


def convert_internal_api_response(response_data: InternalAPIResponse) -> Tuple[List[Trade], Optional[Strategy]]:
    """
    Convert internal API response to Trade and Strategy models.
    
    This function converts an InternalAPIResponse object into:
    - A list of Trade objects (one per leg)
    - An optional Strategy object if there are multiple legs
    
    Args:
        response_data: InternalAPIResponse object from internal API
        
    Returns:
        Tuple of (list of Trade objects, optional Strategy object)
    """
    trades = []
    strategy = None
    
    try:
        # Parse the date
        date_dt = parse_date(response_data.date) or datetime.utcnow()
        
        # Convert each leg to a Trade
        leg_trades = []
        for leg in response_data.legs:
            trade = normalize_leg_to_trade(leg, strategy_id=response_data.id, date_str=response_data.date)
            if trade:
                leg_trades.append(trade)
                trades.append(trade)
        
        # Create Strategy if there are multiple legs
        if len(leg_trades) > 1:
            # Extract underlying name from first leg
            underlying_name = leg_trades[0].unique_product_identifier_underlier_name or "Unknown"
            
            # Extract tenors
            tenors = [t.tenor for t in leg_trades if t.tenor]
            unique_tenors = sorted(list(set(tenors))) if tenors else []
            tenor_pair = "/".join(unique_tenors) if unique_tenors else None
            
            # Classify strategy type
            num_legs = len(leg_trades)
            if num_legs == 2:
                strategy_type = "Spread"
            elif num_legs == 3:
                strategy_type = "Butterfly"
            elif num_legs >= 4:
                strategy_type = "Curve"
            else:
                strategy_type = "Package"
            
            if tenor_pair:
                strategy_type = f"{tenor_pair} {strategy_type}"
            
            # Calculate total notional
            total_notional = sum(t.notional_eur or t.notional_amount_leg1 for t in leg_trades)
            
            strategy = Strategy(
                strategy_id=response_data.id,
                strategy_type=strategy_type,
                underlying_name=underlying_name,
                legs=[t.dissemination_identifier for t in leg_trades],
                total_notional_eur=total_notional,
                execution_start=min(t.execution_timestamp for t in leg_trades),
                execution_end=max(t.execution_timestamp for t in leg_trades),
                package_transaction_price=None,
                tenor_pair=tenor_pair,
                tenor_legs=unique_tenors if unique_tenors else None
            )
        
    except Exception as e:
        logger.error(f"Error converting internal API response: {e}", exc_info=True)
    
    return trades, strategy


async def poll_internal_api() -> Tuple[List[Trade], List[Strategy]]:
    """
    Poll internal API and return list of normalized trades and strategies.
    
    Makes an HTTP GET request to the internal API endpoint, parses the JSON response,
    and converts all responses to Trade and Strategy objects. Handles HTTP errors gracefully
    by returning empty lists.
    
    Supports both old and new API formats:
    - Old format: InternalAPIResponse with Leg objects
    - New format: StrategyAPIResponse with LegAPI objects (pre-classified strategies)
    
    Returns:
        Tuple of (list of normalized Trade objects, list of Strategy objects)
        
    Note:
        This function is async and should be called with await. It uses httpx
        for asynchronous HTTP requests with a 10-second timeout.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # Prepare headers with authentication if token is provided
            headers = INTERNAL_API_HEADERS.copy()
            if INTERNAL_API_TOKEN:
                headers["Authorization"] = f"Bearer {INTERNAL_API_TOKEN}"
            
            response = await client.get(INTERNAL_API_URL, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            
            # Handle both single response and list of responses
            if isinstance(data, list):
                responses = data
            else:
                responses = [data]
            
            all_trades = []
            all_strategies = []
            
            for response_item in responses:
                try:
                    # Try new API format first (StrategyAPIResponse)
                    try:
                        api_response = StrategyAPIResponse(**response_item)
                        trades, strategy = convert_strategy_api_response(api_response)
                        all_trades.extend(trades)
                        if strategy:
                            all_strategies.append(strategy)
                        continue
                    except Exception:
                        # If it fails, try old format
                        pass
                    
                    # Try old API format (InternalAPIResponse)
                    try:
                        api_response = InternalAPIResponse(**response_item)
                        trades, strategy = convert_internal_api_response(api_response)
                        all_trades.extend(trades)
                        if strategy:
                            all_strategies.append(strategy)
                    except Exception as e:
                        logger.error(f"Error processing API response item (both formats failed): {e}", exc_info=True)
                        continue
                        
                except Exception as e:
                    logger.error(f"Error processing API response item: {e}", exc_info=True)
                    continue
            
            logger.info(f"Polled {len(all_trades)} trades and {len(all_strategies)} strategies from internal API")
            return all_trades, all_strategies
            
        except httpx.HTTPError as e:
            logger.error(f"HTTP error polling internal API: {e}")
            return [], []
        except Exception as e:
            logger.error(f"Unexpected error polling internal API: {e}", exc_info=True)
            return [], []


class Poller:
    """
    Internal API poller with exponential backoff retry logic.
    
    This class manages continuous polling of the internal API at regular intervals.
    It implements exponential backoff retry logic to handle temporary API failures
    gracefully, automatically increasing the delay between retries up to a maximum.
    
    Attributes:
        callback: Async function called with (List[Trade], List[Strategy]) when new data is polled
        running: Boolean flag to control polling loop
        retry_delay: Current retry delay in seconds (starts at 1, doubles on error)
        max_retry_delay: Maximum retry delay (60 seconds)
    
    Example:
        >>> async def process_data(trades: List[Trade], strategies: List[Strategy]):
        ...     print(f"Received {len(trades)} trades and {len(strategies)} strategies")
        >>> poller = Poller(process_data)
        >>> poller.running = True
        >>> await poller._poll_with_retry()  # Runs continuously
    """
    
    def __init__(self, callback):
        """
        Initialize poller with callback function.
        
        Args:
            callback: Async function that receives (List[Trade], List[Strategy]) as arguments.
                     This function is called whenever new data is polled from the API.
        """
        self.callback = callback
        self.running = False
        self.retry_delay = 1
        self.max_retry_delay = 60
    
    async def _poll_with_retry(self):
        """
        Poll with exponential backoff on errors.
        
        Continuously polls the internal API at POLL_INTERVAL seconds. On success,
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
                trades, strategies = await poll_internal_api()
                if trades or strategies:
                    await self.callback(trades, strategies)
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
        logger.info("Internal API poller stopped")

