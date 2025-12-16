# Architecture Documentation

## Vue d'ensemble

L'application IRS Monitoring est une application monorepo avec une architecture client-serveur utilisant WebSocket pour la communication temps réel.

## Architecture générale

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Blotter  │  │Dashboard │  │  Alerts │  │  Charts  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       │              │              │              │         │
│       └──────────────┴──────────────┴──────────────┘         │
│                          │                                    │
│                    useWebSocket Hook                          │
└──────────────────────────┼────────────────────────────────────┘
                           │ WebSocket
                           │
┌──────────────────────────┼────────────────────────────────────┐
│                   Backend (FastAPI)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              FastAPI Application                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │  Poller  │  │ Strategy │  │  Alert   │         │   │
│  │  │          │  │ Detector │  │  Engine  │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │   Excel  │  │ Analytics│  │   Trade  │         │   │
│  │  │  Writer  │  │  Engine  │  │ Grouper  │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                    │
│                    Trade Buffer (RAM)                         │
│                    seen_trade_ids (Set)                       │
└──────────────────────────┼────────────────────────────────────┘
                           │
                           │ Poll every 5s
                           │
┌──────────────────────────┼────────────────────────────────────┐
│                    DTCC Public API                            │
│         https://pddata.dtcc.com/ppd/api/ticker/CFTC/RATES    │
└───────────────────────────────────────────────────────────────┘
```

## Flux de données

### 1. Polling DTCC API

```
Poller._poll_with_retry()
  ↓
poll_dtcc_api()
  ↓
normalize_trade() pour chaque trade
  ↓
process_trades() callback
```

### 2. Traitement des trades

```
process_trades()
  ├─→ Filtrage des doublons (seen_trade_ids)
  ├─→ Ajout au buffer (trade_buffer)
  ├─→ ExcelWriter.append_trade() (queue)
  ├─→ Traitement des stratégies pré-classifiées (de l'API)
  ├─→ AlertEngine.process_trade() (si nouveau)
  └─→ broadcast_message("trade_update")
```

### 3. Stratégies pré-classifiées

L'API interne retourne déjà les stratégies groupées avec:
- `instrument`: Maturité du swap (ex: "10Y", "5Y10Y")
- `Product`: Type de stratégie (ex: "Spread", "Butterfly", "Curve")
- `legs`: Liste de tous les legs de la stratégie

Plus besoin de classification locale - les stratégies arrivent déjà structurées.

### 4. Génération d'alertes

```
AlertEngine.process_trade()
  ├─→ Conversion EUR (ExchangeRateCache)
  ├─→ Vérification seuils (ALERT_THRESHOLDS_EUR)
  ├─→ Vérification doublons (alerted_trade_ids)
  └─→ handle_alert() callback → WebSocket broadcast
```

### 5. Écriture Excel

```
ExcelWriter.append_trade()
  ↓ (queue)
_writer_loop() (background thread)
  ├─→ _write_trade() (vérifie doublons par ID)
  └─→ workbook.save()
```

### 6. WebSocket Broadcasting

```
broadcast_message()
  ├─→ JSON serialization
  └─→ connection.send_text() pour chaque client
```

## Modules backend

### `config.py`
Configuration centralisée:
- POLL_INTERVAL: 5 secondes
- ALERT_THRESHOLDS_EUR: Seuils d'alertes
- STRATEGY_TIME_WINDOW: 20 secondes
- EXCEL_OUTPUT_DIR: Répertoire Excel

### `models.py`
Modèles Pydantic:
- `Trade`: Trade normalisé
- `Strategy`: Stratégie multi-legs
- `Alert`: Alerte
- `Analytics`: Métriques analytiques
- `CurveMetrics`, `FlowMetrics`, `RiskMetrics`, etc.

### `poller.py`
Polling de l'API interne:
- `Poller`: Classe avec exponential backoff
- `poll_internal_api()`: Requête HTTP asynchrone
- `convert_strategy_api_response()`: Conversion des stratégies API
- `normalize_leg_api_to_trade()`: Normalisation des legs
- `parse_notional()`: Parsing avec support "+"

### `main.py`
Application FastAPI:
- Endpoints REST
- WebSocket endpoint
- Orchestration des modules
- Gestion de l'état global

### `excel_writer.py`
Écriture Excel thread-safe:
- `ExcelWriter`: Classe avec queue et thread background
- Rotation quotidienne des fichiers
- Prévention des doublons
- Chargement au démarrage

### `alert_engine.py`
Moteur d'alertes:
- `AlertEngine`: Génération d'alertes
- `ExchangeRateCache`: Cache des taux de change
- Conversion EUR
- Prévention des doublons

### `analytics_engine.py`
Calculs analytiques:
- `AnalyticsEngine`: Calculs avancés
- Curve analysis
- Flow metrics
- Risk metrics
- Real-time metrics

## Modules frontend

### `App.tsx`
Composant principal:
- Layout avec Blotter, Dashboard, AlertPanel
- Gestion de l'état global

### `hooks/useWebSocket.ts`
Hook WebSocket:
- Connexion automatique
- Reconnexion automatique
- Parsing des messages
- Mise à jour de l'état

### `components/Blotter.tsx`
Blotter temps réel:
- Affichage des trades
- Filtres avancés
- Groupement des trades
- Column selector

### `components/Dashboard.tsx`
Dashboard analytique:
- Onglets pour différentes vues
- Composants de métriques

### `components/AlertPanel.tsx`
Panneau d'alertes:
- Affichage des alertes
- Compteur
- Son optionnel

## Persistance

### Excel Files
- Format: `trades_YYYYMMDD.xlsx`
- Feuilles: Trades, Strategies, Analytics
- Écriture continue (pas de doublons)
- Chargement au démarrage

### RAM Buffer
- `trade_buffer`: Max 1000 trades
- `seen_trade_ids`: Set persistant
- `package_legs`: Map des legs de packages

## Sécurité

- CORS configuré pour développement (à restreindre en production)
- Validation des données avec Pydantic
- Gestion des erreurs avec logging

## Performance

- Polling asynchrone (asyncio)
- Écriture Excel en background thread
- Buffer limité (max 1000 trades)
- WebSocket pour updates temps réel
- Virtualisation du blotter (1000+ lignes)

## Scalabilité

- Architecture modulaire
- Séparation des responsabilités
- Queue-based Excel writing
- Buffer limité pour mémoire



