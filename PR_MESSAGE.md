# Adaptation à la nouvelle API avec stratégies pré-classifiées et améliorations réseau

## 🎯 Résumé

Cette PR adapte l'application pour utiliser une nouvelle API qui retourne déjà les stratégies classifiées avec toutes les informations sur les legs. Elle inclut également des améliorations pour l'affichage des stratégies déroulables, la gestion des types de données (int/str pour les IDs) et des valeurs NaN, ainsi que la configuration réseau pour permettre l'accès depuis l'hôte.

## ✨ Fonctionnalités principales

### 1. Support de la nouvelle structure API
- ✅ Nouveaux modèles `LegAPI` et `StrategyAPIResponse` pour la nouvelle API
- ✅ Conversion automatique vers les modèles internes `Trade` et `Strategy`
- ✅ Support des deux formats API (ancien et nouveau) avec détection automatique
- ✅ Extraction complète des informations des legs (notionals, rates, spreads, tenors, etc.)

### 2. Affichage des stratégies déroulables
- ✅ Nouveau composant `StrategyRow` pour afficher les stratégies comme lignes déroulables
- ✅ Regroupement automatique des trades par stratégie dans le Blotter
- ✅ Possibilité de dérouler une stratégie pour voir tous ses legs
- ✅ Style visuel distinct (fond violet) pour différencier les stratégies

### 3. Gestion robuste des données
- ✅ Gestion des types flexibles : `id` peut être `int` ou `str` (conversion automatique)
- ✅ Validators Pydantic pour gérer les valeurs NaN/None dans tous les champs numériques
- ✅ Conversion automatique de `Packagetransactionprice` en string (gestion des NaN)

### 4. Configuration réseau améliorée
- ✅ Mapping des ports avec `0.0.0.0` pour permettre l'accès depuis l'hôte
- ✅ Nouveau fichier `docker-compose.host.yml` avec `network_mode: host`
- ✅ Détection automatique de l'environnement dans le frontend (Docker vs Browser)

## 📦 Fichiers modifiés

### Backend
- `backend/app/models.py` - Nouveaux modèles pour l'API avec gestion des types et NaN
- `backend/app/poller.py` - Conversion de la nouvelle API vers modèles internes
- `backend/app/main.py` - Envoi des stratégies via WebSocket dans l'état initial
- `backend/Dockerfile` - Configuration réseau pour écouter sur 0.0.0.0

### Frontend
- `frontend/src/components/Blotter.tsx` - Regroupement par stratégie et affichage déroulable
- `frontend/src/components/StrategyRow.tsx` - **Nouveau** composant pour afficher les stratégies
- `frontend/src/hooks/useWebSocket.ts` - Détection automatique de l'environnement pour les URLs

### Docker
- `docker-compose.yml` - Configuration réseau améliorée avec mapping 0.0.0.0
- `docker-compose.host.yml` - **Nouveau** fichier pour mode host network
- `README.md` - Documentation mise à jour

## 🔧 Détails techniques

### Structure de la nouvelle API

Chaque élément de l'API contient :
- Informations de stratégie (id, executiondatetime, price, Ironprice, Product, Underlier, Tenor, etc.)
- Liste de legs avec toutes les informations (id, Upifisn, Upi, rates, spreads, notionals, tenors, etc.)

### Conversion automatique

- Chaque élément de l'API est converti en une `Strategy` avec tous ses `Trade` (legs)
- Les stratégies sont automatiquement classifiées (Outright, Spread, Butterfly, Curve)
- Les tenors sont extraits et formatés en tenor pairs (ex: "10Y/30Y")

### Gestion des valeurs manquantes

- Validators Pydantic convertissent automatiquement NaN, None, "nan", etc. en None
- Les IDs sont convertis en string automatiquement (support int et str)
- `Packagetransactionprice` est converti en string quand présent, sinon None

## 🧪 Tests

- ✅ Pas d'erreurs de linting
- ✅ Compatibilité avec l'ancien format API maintenue
- ✅ Gestion des valeurs manquantes (NaN, None)
- ✅ Conversion des types (int → str pour les IDs)

## 🚀 Déploiement

### Mode Bridge (par défaut)
```bash
docker-compose up --build
```

### Mode Host Network
```bash
docker-compose -f docker-compose.host.yml up --build
```

## ✅ Checklist

- [x] Code testé localement
- [x] Pas d'erreurs de linting
- [x] Documentation mise à jour
- [x] Compatibilité avec l'ancien format maintenue
- [x] Gestion des erreurs (NaN, None, types)
- [x] Configuration réseau pour accès host
- [x] Affichage des stratégies déroulables

## 📝 Notes

- Les devises sont par défaut "EUR" (peut être amélioré si l'API fournit cette info)
- Le calcul de `notional_eur` est simplifié (peut être amélioré avec conversion de devises)
- Le mode host network peut nécessiter des permissions spéciales sur certains systèmes
