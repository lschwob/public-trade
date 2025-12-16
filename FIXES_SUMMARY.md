# Fixes Summary

## Issues Fixed

### 1. Notional Amount Parsing (String Format Support)
**Problem:** The application expected notional amounts to be numeric values, but the API provides them as strings in abbreviated formats like "20M" (20 million), "2B" (2 billion), "150M" (150 million).

**Files Modified:**
- `/workspace/backend/app/poller.py`
- `/workspace/backend/app/models.py`

**Changes:**
1. **Enhanced `parse_notional()` function in `poller.py`:**
   - Added support for abbreviated formats: "M" (millions), "B" (billions), "K" (thousands)
   - Handles decimal values like "1.5B" = 1,500,000,000
   - Maintains backward compatibility with numeric types and comma-separated formats

2. **Added validators in `models.py`:**
   - `LegAPI.handle_notional_amount()`: Validates and parses `notionalAmountLeg1` and `notionalAmountLeg2`
   - `StrategyAPIResponse.handle_notional_amount_strategy()`: Validates and parses `notional` and `notionalTruncated`
   - Both validators handle:
     - String formats: "20M", "2B", "150M", "1.5B", etc.
     - Numeric types: int, float
     - Invalid values: NaN, Inf, "nan", "null", empty strings → converted to None

**Examples:**
```python
parse_notional("20M")      # → 20,000,000.0
parse_notional("2B")       # → 2,000,000,000.0
parse_notional("1.5B")     # → 1,500,000,000.0
parse_notional("150M")     # → 150,000,000.0
parse_notional("500K")     # → 500,000.0
parse_notional(1000000)    # → 1,000,000.0
```

---

### 2. WebSocket NaN Parsing Error
**Problem:** When the backend sends NaN or Infinity values in JSON messages, the frontend's `JSON.parse()` fails because JSON doesn't support NaN/Infinity.

**Files Modified:**
- `/workspace/backend/app/main.py`
- `/workspace/frontend/src/hooks/useWebSocket.ts`

**Changes:**

1. **Backend: Added `sanitize_for_json()` function in `main.py`:**
   - Recursively traverses dictionaries and lists
   - Converts NaN and Infinity float values to `None` (which becomes `null` in JSON)
   - Applied to all WebSocket messages before serialization in `broadcast_message()`

2. **Frontend: Added sanitization in `useWebSocket.ts`:**
   - Added `sanitizeValue()` helper function in the `ws.onmessage` handler
   - Recursively checks for non-finite numbers (NaN, Infinity, -Infinity)
   - Converts them to `null` for safe processing
   - Protects against any NaN values that might slip through backend sanitization

**Example Flow:**
```
Backend: {rate: NaN, volume: 1000000}
↓ sanitize_for_json()
→ {rate: null, volume: 1000000}
↓ JSON.stringify()
→ '{"rate":null,"volume":1000000}'
↓ WebSocket
→ Frontend JSON.parse()
→ Safe to use!
```

---

### 3. Standard Deviation (stdev) Error with mss.numerator
**Problem:** The `statistics.stdev()` function throws a `StatisticsError` when:
- Less than 2 values are provided
- All values are NaN or Infinity
- Only one valid value after filtering

**File Modified:**
- `/workspace/backend/app/analytics_engine.py`

**Changes:**

1. **Enhanced volatility calculation in `_calculate_instrument_details_eur()`:**
   - Added `math` import for `isnan()` and `isinf()` checks
   - Filter out NaN and Infinity values before calling `stdev()`
   - Wrapped `stdev()` call in try-except block to catch `StatisticsError`
   - Only calculate volatility if there are 2+ valid values
   - Log warnings when errors occur

2. **Fixed bid/ask spread calculation:**
   - Only use `std_dev` if it was successfully calculated (not None)
   - Prevents crashes when std_dev calculation fails

**Code Example:**
```python
# Before (could crash):
std_dev = statistics.stdev(rates)
volatility = std_dev * (252 ** 0.5) * 100

# After (safe):
valid_rates = [r for r in rates if not (math.isnan(r) or math.isinf(r))]
if len(valid_rates) > 1:
    try:
        std_dev = statistics.stdev(valid_rates)
        volatility = std_dev * (252 ** 0.5) * 100
    except (statistics.StatisticsError, ValueError) as e:
        logger.warning(f"Error calculating stdev: {e}")
        volatility = None
else:
    volatility = None
```

---

## Testing

### Manual Tests Performed:

1. **Notional Parsing:**
   ```python
   parse_notional("20M")      # ✓ 20,000,000
   parse_notional("2B")       # ✓ 2,000,000,000
   parse_notional("150M")     # ✓ 150,000,000
   parse_notional("1.5B")     # ✓ 1,500,000,000
   ```

2. **NaN Handling:**
   ```python
   # Backend sanitization
   sanitize_for_json({"value": float('nan')})  # ✓ {"value": null}
   
   # Frontend sanitization
   sanitizeValue(NaN)  # ✓ null
   ```

3. **stdev Edge Cases:**
   ```python
   # Single value
   stdev([1.0])  # ✓ Returns None (not enough values)
   
   # With NaN
   stdev([NaN, 2.0, 3.0])  # ✓ Filters NaN, calculates stdev([2.0, 3.0])
   
   # With Infinity
   stdev([1.0, Inf, 3.0])  # ✓ Filters Inf, calculates stdev([1.0, 3.0])
   ```

---

## Validation

All Python files compiled successfully without syntax errors:
```bash
python3 -m py_compile app/poller.py app/models.py app/analytics_engine.py app/main.py
# ✓ Exit code: 0 (no errors)
```

---

## Backward Compatibility

All changes maintain backward compatibility:
- `parse_notional()` still handles numeric types and comma-separated formats
- NaN/Infinity values are converted to `None`/`null`, which is the expected behavior for missing/invalid data
- stdev calculation gracefully handles edge cases that would have crashed before

---

## Impact

These fixes ensure:
1. ✅ Notional amounts in all formats (20M, 2B, 150M) are correctly parsed
2. ✅ WebSocket messages never fail due to NaN/Infinity values
3. ✅ Analytics calculations don't crash when rate data is insufficient or contains invalid values
4. ✅ Improved error logging for debugging
5. ✅ Robust handling of edge cases throughout the application
