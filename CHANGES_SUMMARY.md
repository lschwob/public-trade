# Résumé des modifications - Migration vers instrument et product

## Objectif
Utiliser directement les champs `instrument` et `product` fournis par l'API interne, qui retourne déjà les stratégies groupées avec toutes leurs legs. Suppression des fonctions de classification locales devenues obsolètes.

## Fichiers supprimés
- `backend/app/strategy_detector.py` - Classification locale de stratégies (obsolète)
- `backend/app/trade_grouper.py` - Groupement local de trades (obsolète)

## Modifications Backend

### `backend/app/main.py`
- Suppression des imports `StrategyDetector` et `TradeGrouper`
- Suppression de l'instanciation de `trade_grouper`
- Suppression de l'appel à `trade_grouper.group_trades()`
- Simplification du traitement des trades groupés
- Suppression des références à `grouped_trades` dans les broadcasts WebSocket

### `backend/app/poller.py`
- Suppression de la fonction `calculate_tenor()` (obsolète)
- Utilisation du champ `Product` de l'API quand disponible
- Mise à jour des commentaires (instrument au lieu de tenor)

### `backend/app/analytics_engine.py`
- Remplacement de `tenor` par `instrument` dans les logs de debug
- Remplacement de `tenor_deltas` par `instrument_deltas`

### `backend/app/excel_writer.py`
- Ligne 242: `trade.tenor` → `trade.instrument`
- Ligne 274: `trade.tenor` → `trade.instrument`
- Ligne 308: `strategy.tenor_pair` → `strategy.instrument_pair`

### `backend/app/models.py`
- Aucun changement nécessaire
- Les champs `Tenor`, `Tenorleg1`, `Tenorleg2` dans les modèles API sont conservés (reflètent l'API externe)
- Les modèles utilisent déjà `instrument` et `instrument_pair`

## Modifications Frontend

### `frontend/src/types/trade.ts`
- Suppression des champs `grouped_trades`, `grouped_trades_count`, et `group_id`
- Conservation de `package_legs` et `package_legs_count`

### `frontend/src/components/TradeRow.tsx`
- Suppression de toutes les références à `grouped_trades`
- Suppression de la section d'affichage des "Grouped Trades"
- Simplification de la colonne "package"
- Mise à jour des commentaires (instrument pairs au lieu de tenor pairs)

### `frontend/src/components/Blotter.tsx`
- Suppression de la logique de groupement manuel des trades
- Simplification du code - groupement uniquement par `strategy_id`
- Mise à jour des commentaires

## Modifications Documentation

### `ARCHITECTURE.md`
- Mise à jour de la section "Détection de stratégies"
- Suppression des références à `StrategyDetector` et `TradeGrouper`
- Documentation de l'utilisation des stratégies pré-classifiées de l'API

### `README.md`
- Mise à jour de la structure du projet
- Suppression de `strategy_detector.py` et `trade_grouper.py`
- Mise à jour de la description de `poller.py`

## Impact

### Simplification
- ~300 lignes de code supprimées (strategy_detector.py)
- ~150 lignes de code supprimées (trade_grouper.py)
- Logique simplifiée dans le frontend et backend

### Amélioration
- Utilisation directe des données de l'API (single source of truth)
- Plus de cohérence entre l'API et l'application
- Moins de risques d'incohérence dans la classification

### Compatibilité
- Les stratégies sont maintenant basées uniquement sur ce que l'API retourne
- `instrument` (ex: "10Y", "5Y10Y") remplace `tenor`
- `Product` (ex: "Spread", "Butterfly") utilisé quand disponible
- `instrument_pair` (ex: "10Y/30Y") remplace `tenor_pair`

## Correction supplémentaire - Suppression de instrument_pair

### Contexte
Le champ `instrument` contient déjà l'information complète (ex: "10Y/30Y" pour un spread), rendant `instrument_pair` et `instrument_legs` redondants.

### Modifications supplémentaires

#### Backend
- **models.py**: Suppression des champs `instrument_pair` et `instrument_legs` de Strategy
- **poller.py**: Suppression de la logique de génération de `instrument_pair`
- **analytics_engine.py**: `instrument_pair_distribution` → `instrument_distribution`
- **excel_writer.py**: Suppression de la colonne "Instrument Pair" dans l'Excel

#### Frontend
- **types/trade.ts**: Suppression de `instrument_pair` et `instrument_legs` de Strategy et StrategyMetrics
- **Blotter.tsx**: Suppression du filtre par instrument pair
- **TradeRow.tsx**: Simplification - utilise directement `strategy_type`
- **StrategyRow.tsx**: Simplification - utilise directement `strategy_type`
- **CurveAnalysis.tsx**: `instrument_pair_distribution` → `instrument_distribution`

### Résultat final
- **`instrument`** de l'API est utilisé directement (ex: "10Y", "10Y/30Y")
- **`Product`** de l'API est utilisé pour le type de stratégie (ex: "Spread", "Butterfly")
- **`strategy_type`** contient le type complet quand disponible
- Aucun calcul ou formatage local n'est nécessaire
