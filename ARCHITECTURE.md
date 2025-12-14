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
  ├─→ StrategyDetector.detect_strategies()
  ├─→ AlertEngine.process_trade() (si nouveau)
  ├─→ TradeGrouper.group_trades()
  └─→ broadcast_message("trade_update")
```

### 3. Détection de stratégies

```
StrategyDetector.detect_strategies()
  ├─→ _detect_package_strategy() (packageIndicator=TRUE)
  └─→ _detect_custom_strategies() (même underlying, <20s)
      ├─→ _classify_strategy_type() (Spread/Butterfly/Curve)
      └─→ _extract_tenor_pair() (ex: "10Y/30Y")
```

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
Polling DTCC API:
- `Poller`: Classe avec exponential backoff
- `poll_dtcc_api()`: Requête HTTP asynchrone
- `normalize_trade()`: Normalisation des données
- `calculate_tenor()`: Calcul du tenor
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

### `strategy_detector.py`
Détection de stratégies:
- `StrategyDetector`: Détection package et custom
- Classification: Spread/Butterfly/Curve
- Extraction des paires de tenors
- Filtrage NEWT uniquement

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

### `trade_grouper.py`
Groupement de trades:
- `TradeGrouper`: Groupement par timestamp/underlying
- Utilisé pour l'affichage dans le blotter

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



