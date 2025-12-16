"""
FastAPI application with WebSocket support for real-time IRS monitoring.

This is the main application module that orchestrates:
- Internal API polling (with pre-classified strategies)
- Trade processing and normalization
- Strategy processing (from internal API)
- Alert generation
- Excel file writing
- WebSocket broadcasting
- Analytics calculation

The application maintains a global state with:
- Trade buffer (in-memory, max 1000 trades)
- Tracked strategies (from internal API)
- Alert engine
- Excel writer
- Analytics engine

All trades are persisted to daily Excel files and loaded on startup to maintain
state across application restarts.
"""

import asyncio
import logging
from datetime import datetime
from typing import List, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json

from app.config import MAX_TRADES_IN_BUFFER, POLL_INTERVAL
from app.poller import Poller
from app.excel_writer import ExcelWriter
from app.alert_engine import AlertEngine
from app.analytics_engine import AnalyticsEngine
from app.models import (
    Trade, Strategy, Alert, Analytics, CurveMetrics, FlowMetrics, RiskMetrics,
    RealTimeMetrics, CurrencyMetrics, StrategyMetrics, ProTraderMetrics, ProTraderDelta
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI application instance
app = FastAPI(title="IRS Monitoring API", description="Real-time Interest Rate Swaps monitoring via Internal API")

# ============================================================================
# CORS Configuration
# ============================================================================
# Allow all origins for development (restrict in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Global State Initialization
# ============================================================================

# Excel writer for continuous daily file logging
excel_writer = ExcelWriter()

# Alert engine for EUR-based threshold alerts
alert_engine = AlertEngine()

# Analytics engine for advanced metrics calculation
analytics_engine = AnalyticsEngine()

# Memory buffer for trades (max 1000 trades, oldest removed when limit reached)
trade_buffer: List[Trade] = []

# Track seen trade IDs to avoid duplicates (using dissemination_identifier)
# This set persists across buffer cleanups to prevent re-processing
seen_trade_ids: Set[str] = set()

# Map package_transaction_price to list of legs for package trades
# Used to attach package legs to parent trades for frontend display
package_legs: dict[str, List[Trade]] = {}

# Track strategies from internal API (keyed by strategy_id)
# Strategies are already classified by the internal API
tracked_strategies: dict[str, Strategy] = {}

# WebSocket connections for real-time updates
active_connections: Set[WebSocket] = set()

# Daily statistics for analytics
daily_stats = {
    "total_trades": 0,
    "total_notional_eur": 0.0,
    "strategies_count": 0,
    "largest_trade_eur": 0.0,
    "underlying_volumes": {},  # {underlying: notional_eur}
    "trades_per_hour": {},  # {hour: count}
    "strategy_types": {}  # {type: count}
}

# Alert buffer for realtime metrics (last 1000 alerts)
recent_alerts: List[Alert] = []


def sanitize_for_json(obj):
    """
    Sanitize an object for JSON serialization by converting NaN and Inf to None.
    
    Args:
        obj: Object to sanitize (dict, list, or primitive)
        
    Returns:
        Sanitized object safe for JSON serialization
    """
    import math
    
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    else:
        return obj


async def broadcast_message(message_type: str, data: dict):
    """
    Broadcast message to all connected WebSocket clients.
    
    Sends a JSON message to all active WebSocket connections. Automatically
    removes disconnected clients from the active_connections set.
    
    Args:
        message_type: Type of message (e.g., "trade_update", "alert", "analytics_update")
        data: Message payload (dict)
        
    Note:
        Disconnected clients are automatically removed from active_connections
        to prevent memory leaks.
    """
    # Sanitize data to remove NaN and Inf values
    sanitized_data = sanitize_for_json(data)
    
    message = {
        "type": message_type,
        "data": sanitized_data,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    disconnected = set()
    for connection in active_connections:
        try:
            await connection.send_text(json.dumps(message, default=str))
        except Exception as e:
            logger.error(f"Error sending WebSocket message: {e}")
            disconnected.add(connection)
    
    # Remove disconnected clients
    active_connections.difference_update(disconnected)


async def handle_alert(alert: Alert):
    """
    Handle alert callback from AlertEngine.
    
    Adds the alert to the recent_alerts buffer (max 1000) and broadcasts
    it to all connected WebSocket clients.
    
    Args:
        alert: Alert object to handle
    """
    global recent_alerts
    # Add to recent alerts buffer
    recent_alerts.append(alert)
    # Keep only last 1000 alerts
    if len(recent_alerts) > 1000:
        recent_alerts = recent_alerts[-1000:]
    await broadcast_message("alert", alert.dict())


async def process_trades(trades: List[Trade], strategies: List[Strategy] = None):
    """
    Process new trades and strategies: write to Excel, generate alerts.
    
    This is the main trade processing function called by the Poller whenever
    new trades and strategies are fetched from the internal API. It:
    1. Filters out duplicate trades (using dissemination_identifier)
    2. Adds trades to the memory buffer
    3. Writes trades to Excel (via ExcelWriter)
    4. Processes pre-classified strategies from internal API
    5. Generates alerts (via AlertEngine, only for new trades)
    6. Updates daily statistics
    7. Broadcasts updates via WebSocket
    
    Args:
        trades: List of new Trade objects from internal API
        strategies: List of pre-classified Strategy objects from internal API
        
    Note:
        Only truly new trades (not in seen_trade_ids) trigger alerts to
        prevent duplicate notifications.
    """
    global trade_buffer, daily_stats, seen_trade_ids, package_legs, tracked_strategies
    
    if strategies is None:
        strategies = []
    
    if not trades:
        return
    
    # Filter out duplicates using dissemination_identifier
    new_trades = []
    for trade in trades:
        trade_id = trade.dissemination_identifier
        if trade_id not in seen_trade_ids:
            seen_trade_ids.add(trade_id)
            new_trades.append(trade)
            
            # Track package legs
            if trade.package_indicator and trade.package_transaction_price:
                package_key = trade.package_transaction_price
                if package_key not in package_legs:
                    package_legs[package_key] = []
                package_legs[package_key].append(trade)
        else:
            logger.debug(f"Skipping duplicate trade: {trade_id}")
    
    if not new_trades:
        return
    
    # Add to buffer
    trade_buffer.extend(new_trades)
    
    # Keep buffer size limited (also clean seen_trade_ids)
    # But keep alerted_trade_ids to prevent re-alerting
    if len(trade_buffer) > MAX_TRADES_IN_BUFFER:
        # Remove old trade IDs from seen set
        removed_trades = trade_buffer[:-MAX_TRADES_IN_BUFFER]
        for old_trade in removed_trades:
            seen_trade_ids.discard(old_trade.dissemination_identifier)
            # Keep alerted_trade_ids even if trade is removed from buffer
            # This prevents re-alerting if the same trade comes back
        trade_buffer = trade_buffer[-MAX_TRADES_IN_BUFFER:]
    
    # Process each new trade
    for trade in new_trades:
        # IMPORTANT: Only process alerts for trades that are truly new
        # A trade is "new" if it's not in seen_trade_ids (already checked above)
        # AND not in alerted_trade_ids (never alerted before)
        # Convert to EUR and check alerts (only for new trades)
        alert = await alert_engine.process_trade(trade, is_new_trade=True)
        
        # Mark as processed immediately after checking alerts
        # This ensures we don't re-alert even if the trade comes back in a future poll
        if alert:
            logger.info(f"Generated alert for new trade: {trade.dissemination_identifier}")
        
        # Write to Excel
        excel_writer.append_trade(trade)
        
        # Update daily stats
        daily_stats["total_trades"] += 1
        if trade.notional_eur:
            daily_stats["total_notional_eur"] += trade.notional_eur
            daily_stats["largest_trade_eur"] = max(
                daily_stats["largest_trade_eur"],
                trade.notional_eur
            )
            
            # Update underlying volumes
            underlying = trade.unique_product_identifier_underlier_name or "Unknown"
            daily_stats["underlying_volumes"][underlying] = \
                daily_stats["underlying_volumes"].get(underlying, 0.0) + trade.notional_eur
        
        # Update trades per hour
        hour_key = trade.execution_timestamp.strftime("%Y-%m-%d %H:00")
        daily_stats["trades_per_hour"][hour_key] = \
            daily_stats["trades_per_hour"].get(hour_key, 0) + 1
    
    # Process pre-classified strategies from internal API
    # Track existing strategy IDs before processing new ones
    existing_strategy_ids_before = set(tracked_strategies.keys())
    
    for strategy in strategies:
        # Assign strategy IDs to trades
        for trade_id in strategy.legs:
            for trade in trade_buffer:
                if trade.dissemination_identifier == trade_id:
                    trade.strategy_id = strategy.strategy_id
                    break
        
        # Store strategy
        tracked_strategies[strategy.strategy_id] = strategy
        
        # Write strategy to Excel
        excel_writer.update_strategy(strategy)
        
        # Generate strategy alert (only for new strategies)
        is_new_strategy = strategy.strategy_id not in existing_strategy_ids_before
        await alert_engine.process_strategy(strategy, is_new_strategy=is_new_strategy)
        
        # Update stats
        daily_stats["strategies_count"] = len(tracked_strategies)
        daily_stats["strategy_types"][strategy.strategy_type] = \
            daily_stats["strategy_types"].get(strategy.strategy_type, 0) + 1
        
        # Broadcast strategy
        await broadcast_message("strategy_detected", strategy.dict())
    
    # Check volume trend (only for new trades)
    await alert_engine.check_volume_trend(new_trades, only_new_trades=True)
    
    # Broadcast new trades (with package legs if applicable)
    for trade in new_trades:
        trade_dict = trade.dict()
        
        # Add package legs if this is a package trade
        if trade.package_indicator and trade.package_transaction_price:
            package_key = trade.package_transaction_price
            if package_key in package_legs:
                trade_dict["package_legs"] = [leg.dict() for leg in package_legs[package_key]]
                trade_dict["package_legs_count"] = len(package_legs[package_key])
        
        await broadcast_message("new_trade", trade_dict)
    
    # Also update existing trades in buffer that belong to the same package
    # But don't generate alerts for these updates
    for trade in trade_buffer:
        # Skip if this trade was just added (already processed)
        if trade in new_trades:
            continue
            
        trade_dict = trade.dict()
        updated = False
        
        # Update package legs
        if trade.package_indicator and trade.package_transaction_price:
            package_key = trade.package_transaction_price
            if package_key in package_legs:
                trade_dict["package_legs"] = [leg.dict() for leg in package_legs[package_key]]
                trade_dict["package_legs_count"] = len(package_legs[package_key])
                updated = True
        
        if updated:
            await broadcast_message("trade_updated", trade_dict)
    
    # Update analytics periodically
    await update_analytics()


async def update_analytics():
    """Update and broadcast analytics with advanced metrics."""
    global daily_stats, trade_buffer, recent_alerts
    
    # Calculate top underlyings
    top_underlyings = sorted(
        [
            {"name": name, "notional": vol}
            for name, vol in daily_stats["underlying_volumes"].items()
        ],
        key=lambda x: x["notional"],
        reverse=True
    )[:10]
    
    # Calculate trades per hour
    trades_per_hour = [
        {"hour": hour, "count": count}
        for hour, count in sorted(daily_stats["trades_per_hour"].items())
    ]
    
    # Strategy distribution
    strategy_distribution = [
        {"type": stype, "count": count}
        for stype, count in daily_stats["strategy_types"].items()
    ]
    
    avg_size = 0.0
    if daily_stats["total_trades"] > 0:
        avg_size = daily_stats["total_notional_eur"] / daily_stats["total_trades"]
    
    # Calculate advanced metrics using analytics engine
    try:
        curve_metrics_dict = analytics_engine.calculate_curve_metrics(trade_buffer)
        flow_metrics_dict = analytics_engine.calculate_flow_metrics(trade_buffer)
        risk_metrics_dict = analytics_engine.calculate_risk_metrics(trade_buffer)
        realtime_metrics_dict = analytics_engine.calculate_realtime_metrics(trade_buffer, recent_alerts)
        currency_metrics_dict = analytics_engine.calculate_currency_metrics(trade_buffer)
        strategy_metrics_dict = analytics_engine.calculate_strategy_metrics(
            list(tracked_strategies.values()),
            trade_buffer
        )
        
        # Create metric objects
        curve_metrics = CurveMetrics(**curve_metrics_dict)
        flow_metrics = FlowMetrics(**flow_metrics_dict)
        risk_metrics = RiskMetrics(**risk_metrics_dict)
        realtime_metrics = RealTimeMetrics(**realtime_metrics_dict)
        currency_metrics = CurrencyMetrics(**currency_metrics_dict)
        strategy_metrics = StrategyMetrics(**strategy_metrics_dict)
    except Exception as e:
        logger.error(f"Error calculating advanced metrics: {e}", exc_info=True)
        # Set to None if calculation fails
        curve_metrics = None
        flow_metrics = None
        risk_metrics = None
        realtime_metrics = None
        currency_metrics = None
        strategy_metrics = None
    
    # Calculate Pro Trader metrics for all time windows
    pro_trader_metrics = {}
    pro_trader_deltas = None
    
    try:
        # Load historical data (placeholder - would need actual implementation)
        historical_30d = analytics_engine.load_historical_trades(30)
        historical_90d = analytics_engine.load_historical_trades(90)
        
        # Calculate metrics for all time windows
        for window in [10, 15, 20, 30, 60]:
            metrics = analytics_engine.calculate_pro_trader_metrics(
                trade_buffer,
                window,
                historical_30d,
                historical_90d
            )
            pro_trader_metrics[f"{window}min"] = metrics
        
        # Calculate deltas (10min vs 1h)
        if "10min" in pro_trader_metrics and "60min" in pro_trader_metrics:
            pro_trader_deltas = analytics_engine.calculate_pro_trader_deltas(
                pro_trader_metrics["10min"],
                pro_trader_metrics["60min"]
            )
    except Exception as e:
        logger.error(f"Error calculating pro trader metrics: {e}", exc_info=True)
        pro_trader_metrics = {}
        pro_trader_deltas = None
    
    analytics = Analytics(
        total_trades=daily_stats["total_trades"],
        total_notional_eur=daily_stats["total_notional_eur"],
        avg_size_eur=avg_size,
        largest_trade_eur=daily_stats["largest_trade_eur"],
        strategies_count=daily_stats["strategies_count"],
        top_underlyings=top_underlyings,
        trades_per_hour=trades_per_hour,
        strategy_distribution=strategy_distribution,
        curve_metrics=curve_metrics,
        flow_metrics=flow_metrics,
        risk_metrics=risk_metrics,
        realtime_metrics=realtime_metrics,
        currency_metrics=currency_metrics,
        strategy_metrics=strategy_metrics
    )
    
    # Write to Excel
    excel_writer.update_analytics(analytics)
    
    # Broadcast analytics with pro trader metrics
    analytics_dict = analytics.dict()
    analytics_dict["pro_trader_metrics"] = pro_trader_metrics
    if pro_trader_deltas:
        analytics_dict["pro_trader_deltas"] = pro_trader_deltas
    
    await broadcast_message("analytics_update", analytics_dict)


@app.on_event("startup")
async def startup():
    """Startup event: initialize poller and load trades from Excel."""
    global trade_buffer, seen_trade_ids, package_legs, daily_stats
    
    logger.info("Starting IRS monitoring application...")
    
    # Load trades from Excel file (today's file)
    logger.info("Loading trades from Excel file...")
    loaded_trades = excel_writer.load_trades_from_excel()
    
    if loaded_trades:
        # Add loaded trades to buffer
        trade_buffer.extend(loaded_trades)
        
        # Mark all loaded trades as seen (to avoid duplicates)
        for trade in loaded_trades:
            seen_trade_ids.add(trade.dissemination_identifier)
            
            # Track package legs
            if trade.package_indicator and trade.package_transaction_price:
                package_key = trade.package_transaction_price
                if package_key not in package_legs:
                    package_legs[package_key] = []
                package_legs[package_key].append(trade)
            
            # Update daily stats
            daily_stats["total_trades"] += 1
            if trade.notional_eur:
                daily_stats["total_notional_eur"] += trade.notional_eur
                daily_stats["largest_trade_eur"] = max(
                    daily_stats["largest_trade_eur"],
                    trade.notional_eur
                )
                
                # Update underlying volumes
                underlying = trade.unique_product_identifier_underlier_name or "Unknown"
                daily_stats["underlying_volumes"][underlying] = \
                    daily_stats["underlying_volumes"].get(underlying, 0.0) + trade.notional_eur
            
            # Update trades per hour
            hour_key = trade.execution_timestamp.strftime("%Y-%m-%d %H:00")
            daily_stats["trades_per_hour"][hour_key] = \
                daily_stats["trades_per_hour"].get(hour_key, 0) + 1
        
        logger.info(f"Loaded {len(loaded_trades)} trades from Excel into buffer")
    
    # Set alert callback
    alert_engine.set_callback(handle_alert)
    
    # Mark all existing trades in buffer as already alerted
    # This prevents alerts for trades that were already loaded
    for trade in trade_buffer:
        alert_engine.alerted_trade_ids.add(trade.dissemination_identifier)
    logger.info(f"Marked {len(trade_buffer)} existing trades as already alerted")
    
    # Start poller in background
    # Create wrapper function to match Poller callback signature
    async def process_data(trades: List[Trade], strategies: List[Strategy]):
        await process_trades(trades, strategies)
    
    poller = Poller(process_data)
    poller.running = True
    asyncio.create_task(poller._poll_with_retry())
    
    logger.info("Application started")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"WebSocket client connected. Total: {len(active_connections)}")
    
    try:
        # Mark all existing trades as already alerted to prevent alerts on initial load
        for trade in trade_buffer:
            alert_engine.alerted_trade_ids.add(trade.dissemination_identifier)
        
        # Send initial state with package legs
        initial_trades = []
        for trade in trade_buffer[-100:]:  # Last 100 trades
            trade_dict = trade.dict()
            # Add package legs if this is a package trade
            if trade.package_indicator and trade.package_transaction_price:
                package_key = trade.package_transaction_price
                if package_key in package_legs:
                    trade_dict["package_legs"] = [leg.dict() for leg in package_legs[package_key]]
                    trade_dict["package_legs_count"] = len(package_legs[package_key])
            
            initial_trades.append(trade_dict)
        
        await websocket.send_text(json.dumps({
            "type": "initial_state",
            "data": {
                "trades": initial_trades,
                "strategies": [s.dict() for s in tracked_strategies.values()],
                "analytics": Analytics(
                    total_trades=daily_stats["total_trades"],
                    total_notional_eur=daily_stats["total_notional_eur"],
                    avg_size_eur=daily_stats["total_notional_eur"] / max(daily_stats["total_trades"], 1),
                    largest_trade_eur=daily_stats["largest_trade_eur"],
                    strategies_count=daily_stats["strategies_count"],
                    top_underlyings=[],
                    trades_per_hour=[],
                    strategy_distribution=[]
                ).dict()
            }
        }, default=str))
        
        # Keep connection alive
        while True:
            try:
                data = await websocket.receive_text()
                # Echo back or handle client messages if needed
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    finally:
        active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total: {len(active_connections)}")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "status": "running",
        "trades_in_buffer": len(trade_buffer),
        "active_connections": len(active_connections)
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}

