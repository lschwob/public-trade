# Blotter Improvements - Instrument, Rates, et Drag & Drop

## Date: 2025-12-16

## Changements Implémentés

### 1. ✅ Affichage de l'Instrument

**Problème :** La colonne "Tenor" n'était pas claire

**Solution :**
- Renommé la colonne "Tenor" en "Instrument" pour plus de clarté
- L'instrument (10Y, 5Y10Y, 30Y, etc.) est maintenant clairement affiché

**Fichier modifié :**
- `frontend/src/components/Blotter.tsx` - Ligne 46

```typescript
// Avant
{ id: 'tenor', label: 'Tenor', visible: true, width: 80 },

// Après  
{ id: 'tenor', label: 'Instrument', visible: true, width: 100 },
```

---

### 2. ✅ Correction des Rates (Facteur 100)

**Problème :** Les rates étaient affichés avec un facteur 100 incorrect (soit trop grand, soit trop petit selon la source)

**Solution :**
- Détection automatique du format du rate :
  - Si `|rate| > 1` : C'est déjà un pourcentage (ex: 3.5 = 3.5%)
  - Si `|rate| < 1` : C'est un décimal (ex: 0.035 = 3.5%)
- Application intelligente du facteur 100 uniquement quand nécessaire

**Fichiers modifiés :**
- `frontend/src/components/TradeRow.tsx` - formatRate()
- `frontend/src/components/StrategyRow.tsx` - case 'rate'

**Code Avant :**
```typescript
// Toujours multiplier par 100
return `${(trade.fixed_rate_leg1 * 100).toFixed(4)}%`;
```

**Code Après :**
```typescript
// Détection automatique
const rate = trade.fixed_rate_leg1;
const displayRate = Math.abs(rate) > 1 ? rate : rate * 100;
return `${displayRate.toFixed(4)}%`;
```

**Exemples :**
```
Input: 0.035  → Output: 3.5000%  (multiplié par 100)
Input: 3.5    → Output: 3.5000%  (déjà en %)
Input: 0.0025 → Output: 0.2500%  (multiplié par 100)
Input: 2.5    → Output: 2.5000%  (déjà en %)
```

---

### 3. ✅ Drag & Drop des Colonnes

**Problème :** Les colonnes ne pouvaient pas être réorganisées

**Solution :**
- Implémentation du drag & drop natif HTML5
- Les colonnes peuvent être déplacées par glisser-déposer
- L'ordre est sauvegardé dans localStorage
- Indicateur visuel pendant le drag (opacité + bordure bleue)

**Fichiers modifiés :**
- `frontend/src/components/Blotter.tsx`

**Fonctionnalités :**

1. **État du Drag :**
```typescript
const [draggedColumn, setDraggedColumn] = useState<number | null>(null);
const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);
```

2. **Handlers :**
```typescript
const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
  setDraggedColumn(index);
  e.dataTransfer.effectAllowed = 'move';
}, []);

const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
  e.preventDefault();
  setDragOverColumn(index);
}, []);

const handleDragEnd = useCallback(() => {
  if (draggedColumn !== null && dragOverColumn !== null && draggedColumn !== dragOverColumn) {
    const newColumns = [...columns];
    const [removed] = newColumns.splice(draggedColumn, 1);
    newColumns.splice(dragOverColumn, 0, removed);
    setColumns(newColumns);
  }
  setDraggedColumn(null);
  setDragOverColumn(null);
}, [draggedColumn, dragOverColumn, columns]);
```

3. **Propriétés HTML5 :**
```typescript
<th
  draggable
  onDragStart={(e) => handleDragStart(e, index)}
  onDragOver={(e) => handleDragOver(e, index)}
  onDragEnd={handleDragEnd}
  className={`... cursor-move ${
    draggedColumn === index ? 'opacity-50' : ''
  } ${
    dragOverColumn === index ? 'border-l-4 border-l-blue-500' : ''
  }`}
>
  <div className="flex items-center gap-1">
    <span className="text-gray-400">⋮⋮</span>
    {col.label}
  </div>
</th>
```

**UX Features :**
- 🖱️ Curseur "move" pour indiquer que la colonne est déplaçable
- 👻 Opacité 50% pendant le drag
- 📍 Bordure bleue sur la zone de drop
- 💾 Sauvegarde automatique dans localStorage
- ⋮⋮ Icône "grip" pour indiquer la possibilité de drag

---

## Utilisation

### Déplacer une Colonne

1. **Cliquer et maintenir** sur un en-tête de colonne
2. **Glisser** vers la gauche ou la droite
3. **Relâcher** à la position désirée

![Drag & Drop Demo]
```
┌─────┬────────┬────────┬────────┐
│Time │Action  │🔵Under │Notional│  ← Glisser "Underlying"
└─────┴────────┴────────┴────────┘

┌─────┬────────┬────────┬────────┐
│Time │🔵Under │Action  │Notional│  ← Relâcher ici
└─────┴────────┴────────┴────────┘

Résultat :
┌─────┬────────┬────────┬────────┐
│Time │Under   │Action  │Notional│  ✅ Colonne déplacée
└─────┴────────┴────────┴────────┘
```

### Réinitialiser l'Ordre

Si vous voulez revenir à l'ordre par défaut :
1. Ouvrir la console du navigateur (F12)
2. Exécuter : `localStorage.removeItem('blotter-columns')`
3. Rafraîchir la page

---

## Tests Effectués

### 1. Test de l'Instrument
```
✅ Colonne "Instrument" visible par défaut
✅ Affiche: 10Y, 5Y10Y, 30Y, etc.
✅ Largeur augmentée à 100px pour meilleure lisibilité
```

### 2. Test des Rates
```
✅ Rate decimal (0.035) → 3.5000%
✅ Rate percentage (3.5) → 3.5000%
✅ Rate négatif (-0.02) → -2.0000%
✅ Rate négatif (%) (-2.0) → -2.0000%
✅ Legs dans package → formatés correctement
✅ Strategy avgRate → formaté correctement
```

### 3. Test du Drag & Drop
```
✅ Colonne draggable (cursor: move)
✅ Opacité réduite pendant le drag
✅ Bordure bleue sur drop zone
✅ Colonne déplacée avec succès
✅ Ordre sauvegardé dans localStorage
✅ Ordre restauré après refresh
✅ Pas de crash si drop sur la même position
```

---

## Impact sur la Performance

### Drag & Drop
- ✅ Utilise `useCallback()` pour éviter re-création des handlers
- ✅ Pas de re-render des lignes pendant le drag
- ✅ Uniquement l'en-tête est mis à jour
- ✅ Performance native HTML5 Drag & Drop API

### Rates
- ✅ Calcul simple (pas d'impact sur performance)
- ✅ Détection inline (pas de fonction externe)
- ✅ Pas de re-calcul inutile

---

## Compatibilité

### Navigateurs
- ✅ Chrome/Edge (HTML5 Drag & Drop natif)
- ✅ Firefox (HTML5 Drag & Drop natif)
- ✅ Safari (HTML5 Drag & Drop natif)
- ❌ Mobile (touch events non implémentés)

**Note:** Pour le support mobile, il faudrait ajouter une bibliothèque comme `react-beautiful-dnd` ou implémenter les touch events.

---

## Prochaines Améliorations Possibles

### Court Terme
1. **Support Mobile** - Ajouter touch events pour drag & drop sur mobile
2. **Animation** - Animer la transition des colonnes lors du drag
3. **Bouton Reset** - Ajouter un bouton pour réinitialiser l'ordre

### Long Terme
1. **Largeur Redimensionnable** - Permettre de redimensionner les colonnes
2. **Colonnes Épinglées** - Épingler certaines colonnes (Time, Action)
3. **Presets** - Sauvegarder/charger des configurations de colonnes

---

## Résumé des Fichiers Modifiés

### Frontend (3 fichiers)
1. `frontend/src/components/Blotter.tsx`
   - Renommé "Tenor" → "Instrument"
   - Ajout état drag & drop
   - Ajout handlers drag & drop
   - Ajout props draggable sur th

2. `frontend/src/components/TradeRow.tsx`
   - Correction formatRate() avec détection auto
   - Correction rate dans package legs

3. `frontend/src/components/StrategyRow.tsx`
   - Correction avgRate avec détection auto

---

## Commandes de Test

### Vérifier l'Ordre des Colonnes
```javascript
// Dans la console du navigateur
JSON.parse(localStorage.getItem('blotter-columns')).map(c => c.label)
// Output: ["Time", "Action", "Underlying", "Notional", "Instrument", ...]
```

### Réinitialiser les Colonnes
```javascript
localStorage.removeItem('blotter-columns');
window.location.reload();
```

### Tester les Rates
```javascript
// Simuler différents formats
const testRates = [0.035, 3.5, -0.02, -2.0];
testRates.forEach(rate => {
  const display = Math.abs(rate) > 1 ? rate : rate * 100;
  console.log(`${rate} → ${display.toFixed(4)}%`);
});
```

---

## Conclusion

✅ **Instrument clairement affiché** (colonne "Instrument")
✅ **Rates correctement formatés** (détection automatique %)
✅ **Colonnes déplaçables** (drag & drop HTML5)
✅ **Sauvegarde persistante** (localStorage)
✅ **Performance optimale** (useCallback + memoization)

**Status : READY FOR PRODUCTION** 🚀
