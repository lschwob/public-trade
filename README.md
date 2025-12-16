# Real-Time IRS (Interest Rate Swaps) Monitoring Application

Application de monitoring temps réel des transactions publiques Interest Rate Swaps via l'API DTCC, avec détection automatique de stratégies multi-legs et alertes sur gros trades.

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [Structure du projet](#structure-du-projet)
- [Documentation API](#documentation-api)
- [Développement](#développement)
- [Dépannage](#dépannage)

## 🎯 Vue d'ensemble

Cette application permet de surveiller en temps réel les transactions d'Interest Rate Swaps (IRS) publiées par le DTCC (Depository Trust & Clearing Corporation). Elle offre:

- **Polling en temps réel** de l'API DTCC toutes les 5 secondes
- **Détection automatique** de stratégies multi-legs (Spreads, Butterflies, Curves)
- **Alertes configurables** basées sur le notionnel en EUR
- **Export Excel continu** avec fichiers quotidiens
- **Dashboard interactif** avec visualisations en temps réel

## ✨ Fonctionnalités

### F1 - Polling & Stockage
- Polling automatique de l'API DTCC toutes les 5 secondes
- Parsing et normalisation des données JSON
- Normalisation des notionnels en EUR
- Écriture continue dans des fichiers Excel quotidiens (`trades_YYYYMMDD.xlsx`)
- Buffer mémoire pour les trades de la session courante

### F2 - Blotter Temps Réel
- Affichage des colonnes essentielles (Timestamp, Action, Underlying, Notional, Tenor, Rate, etc.)
- Tri par timestamp décroissant (plus récents en premier)
- Auto-scroll avec mise en évidence des nouveaux trades
- Support de la virtualisation pour 1000+ lignes
- Filtres avancés (Action, Tenor, Forward/Spot, Strategy Type, Platform)
- Groupement des trades (même timestamp/underlying)

### F3 - Détection de Stratégies
- Détection basée sur `packageIndicator=TRUE` (même `packageTransactionPrice`)
- Détection personnalisée (même underlying, <20s d'intervalle, maturités différentes)
- Classification: Spread (2 legs), Butterfly (3 legs), Curve (4+ legs)
- Affichage avec badge, Strategy ID et tooltip avec détails
- Détection des paires de tenors (ex: "10Y/30Y")

### F4 - Alertes Notionnels
- Seuils configurables:
  - **Critical**: ≥ 2B EUR
  - **High**: ≥ 1B EUR
  - **Medium**: ≥ 500M EUR
- Types d'alertes: Large Trade, Strategy Package, Trend (volume 5min)
- Interface: panneau latéral, compteur, son optionnel
- Alertes uniquement pour les nouveaux trades (pas de doublons)

### F5 - Export Excel Continu
- Fichier quotidien: `trades_YYYYMMDD.xlsx`
- Feuille "Trades": ajout de nouveaux trades (pas de doublons)
- Feuille "Strategies": mise à jour périodique
- Feuille "Analytics": recalcul en fin de journée

### F6 - Dashboard Analytics
- **KPIs temps réel**: Total Trades, Notional Cumulé, # Strategies, Largest Trade
- **Graphiques**:
  - Top 10 underlyings
  - Trades par heure
  - Distribution des stratégies
  - Analyse de courbe (tenor distribution, rates par tenor, spreads)
  - Métriques de flux (action breakdown, market share par plateforme)
  - Métriques de risque (DV01, concentration HHI, percentiles)
  - Métriques temps réel (volume 5min/15min/1h, liquidity score)

## 🏗️ Architecture

### Stack Technique

**Backend:**
- **FastAPI**: Framework web asynchrone pour l'API REST et WebSocket
- **Python 3.11+**: Langage de programmation
- **asyncio**: Programmation asynchrone pour le polling
- **httpx**: Client HTTP asynchrone pour l'API DTCC
- **openpyxl**: Écriture/lecture de fichiers Excel
- **pydantic**: Validation et sérialisation des données

**Frontend:**
- **React 18+**: Bibliothèque UI
- **TypeScript**: Typage statique
- **Tailwind CSS**: Framework CSS utilitaire
- **Recharts**: Bibliothèque de graphiques
- **Vite**: Build tool et dev server

**Communication:**
- **WebSocket**: Communication bidirectionnelle temps réel
- **REST API**: Endpoints pour les données historiques

**Stockage:**
- **Excel files**: Fichiers quotidiens (pas de base de données)
- **RAM buffer**: Trades de la session courante (max 1000)

### Flux de Données

```
DTCC API → Poller → Normalize → Process Trades
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
            Excel Writer                    Strategy Detector
                    ↓                               ↓
            Daily Excel Files              Alert Engine
                    ↓                               ↓
            Load on Startup              WebSocket Broadcast
                    ↓                               ↓
            Trade Buffer ────────────────→ Frontend (React)
```

## 🚀 Installation

### Prérequis

- Docker et Docker Compose
- OU Python 3.11+ et Node.js 18+ (pour développement local)

### Installation avec Docker (Recommandé)

**Mode Bridge (par défaut):**
```bash
# Cloner le repository
git clone <repository-url>
cd sdr-trades

# Construire et démarrer les services
docker-compose up --build

# L'application sera accessible sur:
# - Backend API: http://localhost:8000
# - Frontend: http://localhost:5173
# - API Docs: http://localhost:8000/docs
```

**Mode Host Network (pour accès direct depuis l'hôte):**
```bash
# Utiliser le fichier docker-compose avec mode host
docker-compose -f docker-compose.host.yml up --build

# Les services seront directement accessibles sur l'hôte:
# - Backend API: http://localhost:8000
# - Frontend: http://localhost:5173
# - API Docs: http://localhost:8000/docs
```

**Note:** Le backend écoute sur `0.0.0.0:8000` pour être accessible depuis l'hôte dans les deux modes.

### Installation locale (Développement)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Sur Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## ⚙️ Configuration

La configuration se trouve dans `backend/app/config.py`:

```python
# Polling
POLL_INTERVAL = 5  # secondes entre chaque poll

# Alertes (en EUR)
ALERT_THRESHOLDS_EUR = {
    "critical": 2_000_000_000,  # 2B EUR
    "high": 1_000_000_000,       # 1B EUR
    "medium": 500_000_000        # 500M EUR
}

# Détection de stratégies
STRATEGY_TIME_WINDOW = 20  # secondes

# Buffer mémoire
MAX_TRADES_IN_BUFFER = 1000

# Répertoire Excel
EXCEL_OUTPUT_DIR = Path("./excel_output")
```

### Variables d'environnement

- `EXCEL_OUTPUT_DIR`: Répertoire pour les fichiers Excel (défaut: `./excel_output`)

## 📖 Utilisation

### Démarrage de l'application

1. **Avec Docker:**
   ```bash
   docker-compose up
   ```

2. **Local:**
   - Démarrer le backend: `uvicorn app.main:app --reload`
   - Démarrer le frontend: `npm run dev`

### Interface utilisateur

1. **Blotter**: Affiche tous les trades en temps réel
   - Utilisez les filtres pour affiner l'affichage
   - Cliquez sur une ligne pour voir les détails
   - Les trades groupés peuvent être déroulés

2. **Dashboard**: Métriques et graphiques analytiques
   - Vue d'ensemble du marché
   - Analyse de courbe
   - Métriques de flux
   - Métriques de risque
   - Métriques temps réel

3. **Alertes**: Panneau latéral avec notifications
   - Alertes pour gros trades
   - Alertes pour stratégies détectées
   - Alertes de tendance (volume)

### Export Excel

Les fichiers Excel sont générés automatiquement dans `backend/excel_output/`:
- Format: `trades_YYYYMMDD.xlsx`
- Feuilles: Trades, Strategies, Analytics
- Mise à jour continue (pas de doublons)

## 📁 Structure du projet

```
sdr-trades/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py              # Configuration centralisée
│   │   ├── models.py              # Modèles Pydantic (Trade, Strategy, Alert, etc.)
│   │   ├── main.py                # Application FastAPI principale
│   │   ├── poller.py              # Polling API interne (stratégies pré-classifiées)
│   │   ├── excel_writer.py        # Écriture Excel thread-safe
│   │   ├── alert_engine.py        # Moteur d'alertes avec conversion EUR
│   │   └── analytics_engine.py    # Calculs analytiques avancés
│   ├── excel_output/              # Fichiers Excel générés (gitignored)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Blotter.tsx        # Blotter temps réel
│   │   │   ├── Dashboard.tsx     # Dashboard principal
│   │   │   ├── AlertPanel.tsx    # Panneau d'alertes
│   │   │   ├── TradeRow.tsx      # Ligne de trade
│   │   │   ├── ColumnSelector.tsx # Sélecteur de colonnes
│   │   │   ├── charts/            # Composants graphiques
│   │   │   └── dashboard/         # Composants dashboard
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts   # Hook WebSocket
│   │   ├── types/
│   │   │   └── trade.ts          # Types TypeScript
│   │   ├── utils/
│   │   │   └── tenorSort.ts      # Utilitaires de tri
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

## 📡 Documentation API

### WebSocket Endpoint

**URL:** `ws://localhost:8000/ws`

**Messages reçus:**

1. **trade_update** - Nouveau trade
   ```json
   {
     "type": "trade_update",
     "data": { /* Trade object */ },
     "timestamp": "2024-01-15T10:30:00Z"
   }
   ```

2. **alert** - Nouvelle alerte
   ```json
   {
     "type": "alert",
     "data": {
       "alert_id": "...",
       "alert_type": "LargeTrade",
       "severity": "critical",
       "message": "...",
       "notional_eur": 2000000000
     }
   }
   ```

3. **analytics_update** - Mise à jour analytics
   ```json
   {
     "type": "analytics_update",
     "data": { /* Analytics object */ }
   }
   ```

### REST Endpoints

- `GET /api/trades` - Liste des trades (buffer mémoire)
- `GET /api/strategies` - Liste des stratégies détectées
- `GET /api/analytics` - Métriques analytiques
- `GET /api/alerts` - Dernières alertes

Documentation complète: http://localhost:8000/docs (Swagger UI)

## 🔧 Développement

### Structure du code

**Backend:**
- Modules séparés par responsabilité
- Utilisation d'asyncio pour les opérations I/O
- Thread-safe pour l'écriture Excel
- Validation avec Pydantic

**Frontend:**
- Composants React fonctionnels avec hooks
- TypeScript pour la sécurité de type
- Tailwind CSS pour le styling
- Recharts pour les visualisations

### Tests

```bash
# Backend (à implémenter)
cd backend
pytest

# Frontend (à implémenter)
cd frontend
npm test
```

### Linting

```bash
# Backend
black backend/app
flake8 backend/app

# Frontend
npm run lint
```

## 🐛 Dépannage

### Problèmes courants

1. **Pas de trades affichés**
   - Vérifier que le poller fonctionne (logs backend)
   - Vérifier la connexion WebSocket (console navigateur)
   - Vérifier les filtres dans le Blotter

2. **Erreurs de parsing notional**
   - Les notionals avec "+" sont maintenant gérés automatiquement
   - Vérifier les logs backend pour les warnings

3. **Fichiers Excel non créés**
   - Vérifier les permissions d'écriture dans `excel_output/`
   - Vérifier les logs backend pour les erreurs

4. **WebSocket déconnecté**
   - Vérifier que le backend est démarré
   - Vérifier la configuration CORS
   - Recharger la page frontend

### Logs

**Backend:**
```bash
docker-compose logs -f backend
```

**Frontend:**
- Console navigateur (F12)

## 📝 Licence

[À définir]

## 👥 Contribution

[À définir]
