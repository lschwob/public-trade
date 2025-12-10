"""
Configuration settings for the IRS (Interest Rate Swaps) monitoring application.

This module centralizes all configuration constants used throughout the application,
including API endpoints, thresholds, file paths, and timing parameters.

Configuration can be overridden via environment variables where applicable.
"""

import os
from pathlib import Path

# ============================================================================
# Polling Configuration
# ============================================================================

# Interval between DTCC API polls (in seconds)
# Lower values provide more real-time data but increase API load
POLL_INTERVAL = 5  # seconds

# ============================================================================
# DTCC API Configuration
# ============================================================================

# DTCC Public Data API endpoint for Interest Rate Swaps
# This endpoint provides real-time trade data from the Depository Trust & Clearing Corporation
DTCC_API_URL = "https://pddata.dtcc.com/ppd/api/ticker/CFTC/RATES"

# HTTP headers required for DTCC API requests
# These headers mimic a browser request to access the public data
DTCC_HEADERS = {
    "Accept": "application/json",
    "Referer": "https://pddata.dtcc.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# ============================================================================
# Alert Configuration
# ============================================================================

# Alert thresholds in EUR (Euros)
# Trades exceeding these thresholds will trigger alerts of corresponding severity
# These values are in EUR to standardize alerts across different currencies
ALERT_THRESHOLDS_EUR = {
    "critical": 2_000_000_000,  # 2 billion EUR - Critical alerts
    "high": 1_000_000_000,       # 1 billion EUR - High priority alerts
    "medium": 500_000_000        # 500 million EUR - Medium priority alerts
}

# ============================================================================
# Strategy Detection Configuration
# ============================================================================

# Time window (in seconds) for detecting custom strategies
# Trades within this window with the same underlying are considered part of a strategy
STRATEGY_TIME_WINDOW = 20  # seconds

# ============================================================================
# Excel Output Configuration
# ============================================================================

# Directory where daily Excel files are stored
# Can be overridden via EXCEL_OUTPUT_DIR environment variable
# Default: ./excel_output (relative to backend directory)
EXCEL_OUTPUT_DIR = Path(os.getenv("EXCEL_OUTPUT_DIR", "./excel_output"))
EXCEL_OUTPUT_DIR.mkdir(exist_ok=True)  # Create directory if it doesn't exist

# ============================================================================
# Currency Conversion Configuration
# ============================================================================

# Exchange rate API endpoint for EUR conversion
# Used to convert trade notionals from various currencies to EUR
EXCHANGE_RATE_API_URL = "https://api.exchangerate-api.com/v4/latest/EUR"

# Cache TTL for exchange rates (in seconds)
# Exchange rates are cached to reduce API calls
EXCHANGE_RATE_CACHE_TTL = 3600  # 1 hour in seconds

# ============================================================================
# Memory Buffer Configuration
# ============================================================================

# Maximum number of trades to keep in memory buffer
# Older trades are removed when this limit is reached
# This prevents unbounded memory growth while maintaining recent trade history
MAX_TRADES_IN_BUFFER = 1000

# ============================================================================
# WebSocket Configuration
# ============================================================================

# Interval for broadcasting analytics updates via WebSocket (in seconds)
# Lower values provide more frequent updates but increase network traffic
WS_BROADCAST_INTERVAL = 1  # seconds for analytics updates


