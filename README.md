# Real-Time IRS Monitoring Application

Application de monitoring temps réel des transactions publiques Interest Rate Swaps via l'API DTCC, avec détection automatique de stratégies multi-legs et alertes sur gros trades.

## Features

- **Polling temps réel**: Requête API DTCC toutes les 5 secondes
- **Détection de stratégies**: Identification automatique des stratégies multi-legs (Spread, Butterfly, Curve)
- **Alertes EUR**: Alertes configurables basées sur le notionnel en EUR
- **Export Excel continu**: Fichiers quotidiens avec 3 feuilles (Trades, Strategies, Analytics)
- **Dashboard temps réel**: Blotter, analytics et alertes via WebSocket

## Architecture

- **Backend**: FastAPI + Python (asyncio, openpyxl, pandas)
- **Frontend**: React + TypeScript + Tailwind CSS
- **Communication**: WebSocket pour updates temps réel
- **Stockage**: Fichiers Excel quotidiens (pas de BDD)

## Quick Start

```bash
# Build and start services
docker-compose up --build

# Backend: http://localhost:8000
# Frontend: http://localhost:5173
```

## Configuration

Les seuils d'alerte et intervalles sont configurables dans `backend/app/config.py`:

- `POLL_INTERVAL`: 5 secondes
- `ALERT_THRESHOLDS_EUR`: Critical (1B), High (500M), Medium (100M)
- `STRATEGY_TIME_WINDOW`: 20 secondes

## Structure

```
sdr-trades/
├── backend/          # FastAPI application
├── frontend/         # React application
├── excel_output/     # Fichiers Excel quotidiens (générés)
└── docker-compose.yml
```


