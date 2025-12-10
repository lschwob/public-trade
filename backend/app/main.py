"""FastAPI application with WebSocket support."""

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
from app.strategy_detector import StrategyDetector
from app.alert_engine import AlertEngine
from app.trade_grouper import TradeGrouper
from app.analytics_engine import AnalyticsEngine
from app.models import Trade, Strategy, Alert, Analytics, CurveMetrics, FlowMetrics, RiskMetrics, RealTimeMetrics, CurrencyMetrics, StrategyMetrics

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="IRS Monitoring API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
excel_writer = ExcelWriter()
strategy_detector = StrategyDetector()
alert_engine = AlertEngine()
trade_grouper = TradeGrouper()
analytics_engine = AnalyticsEngine()

# Memory buffer for trades
trade_buffer: List[Trade] = []

# Track seen trade IDs to avoid duplicates (using dissemination_identifier)
seen_trade_ids: Set[str] = set()

# Map package_transaction_price to list of legs for package trades
package_legs: dict[str, List[Trade]] = {}

# WebSocket connections
active_connections: Set[WebSocket] = set()

# Analytics state
daily_stats = {
    "total_trades": 0,
    "total_notional_eur": 0.0,
    "strategies_count": 0,
    "largest_trade_eur": 0.0,
    "underlying_volumes": {},  # {underlying: notional_eur}
    "trades_per_hour": {},  # {hour: count}
    "strategy_types": {}  # {type: count}
}

# Alert buffer for realtime metrics
recent_alerts: List[Alert] = []


async def broadcast_message(message_type: str, data: dict):
    """Broadcast message to all connected WebSocket clients."""
    message = {
        "type": message_type,
        "data": data,
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
    """Handle alert callback."""
    global recent_alerts
    # Add to recent alerts buffer
    recent_alerts.append(alert)
    # Keep only last 1000 alerts
    if len(recent_alerts) > 1000:
        recent_alerts = recent_alerts[-1000:]
    await broadcast_message("alert", alert.dict())


async def process_trades(trades: List[Trade]):
    """Process new trades: write to Excel, detect strategies, generate alerts."""
    global trade_buffer, daily_stats, seen_trade_ids, package_legs
    
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
    
    # Group trades (include new trades and recent trades from buffer for better grouping)
    all_trades_for_grouping = new_trades + [t for t in trade_buffer[-50:] if t not in new_trades]
    trade_grouper.group_trades(all_trades_for_grouping)
    
    # Detect strategies
    strategies = strategy_detector.detect_strategies(new_trades)
    
    # Track existing strategy IDs before processing new ones
    existing_strategy_ids_before = {s.strategy_id for s in strategy_detector.get_all_strategies()}
    
    for strategy in strategies:
        # Assign strategy IDs to trades
        for trade_id in strategy.legs:
            for trade in trade_buffer:
                if trade.dissemination_identifier == trade_id:
                    trade.strategy_id = strategy.strategy_id
                    break
        
        # Write strategy to Excel
        excel_writer.update_strategy(strategy)
        
        # Generate strategy alert (only for new strategies)
        is_new_strategy = strategy.strategy_id not in existing_strategy_ids_before
        await alert_engine.process_strategy(strategy, is_new_strategy=is_new_strategy)
        
        # Update stats
        daily_stats["strategies_count"] = len(strategy_detector.get_all_strategies())
        daily_stats["strategy_types"][strategy.strategy_type] = \
            daily_stats["strategy_types"].get(strategy.strategy_type, 0) + 1
        
        # Broadcast strategy
        await broadcast_message("strategy_detected", strategy.dict())
    
    # Check volume trend (only for new trades)
    await alert_engine.check_volume_trend(new_trades, only_new_trades=True)
    
    # Broadcast new trades (with package legs and grouped trades if applicable)
    for trade in new_trades:
        trade_dict = trade.dict()
        
        # Add package legs if this is a package trade
        if trade.package_indicator and trade.package_transaction_price:
            package_key = trade.package_transaction_price
            if package_key in package_legs:
                trade_dict["package_legs"] = [leg.dict() for leg in package_legs[package_key]]
                trade_dict["package_legs_count"] = len(package_legs[package_key])
        
        # Add grouped trades (trades in the same group)
        group_id = trade_grouper.get_group_id_for_trade(trade.dissemination_identifier)
        if group_id:
            group_trade_ids = trade_grouper.get_group_for_trade(trade.dissemination_identifier)
            # Get actual trade objects from buffer
            grouped_trades = [
                t for t in trade_buffer 
                if t.dissemination_identifier in group_trade_ids
                and t.dissemination_identifier != trade.dissemination_identifier
            ]
            if grouped_trades:
                trade_dict["grouped_trades"] = [t.dict() for t in grouped_trades]
                trade_dict["grouped_trades_count"] = len(group_trade_ids)
                trade_dict["group_id"] = group_id
        
        await broadcast_message("new_trade", trade_dict)
    
    # Also update existing trades in buffer that belong to the same package or group
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
        
        # Update grouped trades
        group_id = trade_grouper.get_group_id_for_trade(trade.dissemination_identifier)
        if group_id:
            group_trade_ids = trade_grouper.get_group_for_trade(trade.dissemination_identifier)
            grouped_trades = [
                t for t in trade_buffer 
                if t.dissemination_identifier in group_trade_ids
                and t.dissemination_identifier != trade.dissemination_identifier
            ]
            if grouped_trades:
                trade_dict["grouped_trades"] = [t.dict() for t in grouped_trades]
                trade_dict["grouped_trades_count"] = len(group_trade_ids)
                trade_dict["group_id"] = group_id
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
            strategy_detector.get_all_strategies(),
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
    
    # Broadcast
    await broadcast_message("analytics_update", analytics.dict())


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
    poller = Poller(process_trades)
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
        
        # Send initial state with package legs and grouped trades
        initial_trades = []
        for trade in trade_buffer[-100:]:  # Last 100 trades
            trade_dict = trade.dict()
            # Add package legs if this is a package trade
            if trade.package_indicator and trade.package_transaction_price:
                package_key = trade.package_transaction_price
                if package_key in package_legs:
                    trade_dict["package_legs"] = [leg.dict() for leg in package_legs[package_key]]
                    trade_dict["package_legs_count"] = len(package_legs[package_key])
            
            # Add grouped trades
            group_id = trade_grouper.get_group_id_for_trade(trade.dissemination_identifier)
            if group_id:
                group_trade_ids = trade_grouper.get_group_for_trade(trade.dissemination_identifier)
                grouped_trades = [
                    t for t in trade_buffer 
                    if t.dissemination_identifier in group_trade_ids
                    and t.dissemination_identifier != trade.dissemination_identifier
                ]
                if grouped_trades:
                    trade_dict["grouped_trades"] = [t.dict() for t in grouped_trades]
                    trade_dict["grouped_trades_count"] = len(group_trade_ids)
                    trade_dict["group_id"] = group_id
            
            initial_trades.append(trade_dict)
        
        await websocket.send_text(json.dumps({
            "type": "initial_state",
            "data": {
                "trades": initial_trades,
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

