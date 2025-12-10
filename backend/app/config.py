"""Configuration settings for the IRS monitoring application."""

import os
from pathlib import Path

# Polling configuration
POLL_INTERVAL = 5  # seconds

# DTCC API configuration
DTCC_API_URL = "https://pddata.dtcc.com/ppd/api/ticker/CFTC/RATES"
DTCC_HEADERS = {
    "Accept": "application/json",
    "Referer": "https://pddata.dtcc.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Alert thresholds in EUR
ALERT_THRESHOLDS_EUR = {
    "critical": 2_000_000_000,  # 2B EUR (au lieu de 1B)
    "high": 1_000_000_000,       # 1B EUR (au lieu de 500M)
    "medium": 500_000_000        # 500M EUR (au lieu de 100M)
}

# Strategy detection
STRATEGY_TIME_WINDOW = 20  # seconds

# Excel output
EXCEL_OUTPUT_DIR = Path(os.getenv("EXCEL_OUTPUT_DIR", "./excel_output"))
EXCEL_OUTPUT_DIR.mkdir(exist_ok=True)

# Exchange rate API (for EUR conversion)
EXCHANGE_RATE_API_URL = "https://api.exchangerate-api.com/v4/latest/EUR"
EXCHANGE_RATE_CACHE_TTL = 3600  # 1 hour in seconds

# Memory buffer
MAX_TRADES_IN_BUFFER = 1000

# WebSocket
WS_BROADCAST_INTERVAL = 1  # seconds for analytics updates


