# Changes: Notional Amount Parsing & Error Fixes

## Date: 2025-12-16

## Summary
Fixed three critical issues related to notional amount parsing, NaN handling in WebSocket messages, and standard deviation calculation errors.

## Issues Fixed

### 1. ✅ Notional Amount String Parsing
**Problem**: API returns notional amounts as strings like "20M", "2B", "150M" instead of numeric values.

**Solution**: 
- Enhanced `parse_notional()` function to handle abbreviated formats (M, B, K)
- Added validators in Pydantic models to automatically parse string notional amounts
- Supports formats: "20M" (20 million), "2B" (2 billion), "1.5B" (1.5 billion), etc.

**Files Changed**:
- `backend/app/poller.py` - Enhanced parse_notional() function
- `backend/app/models.py` - Added validators for LegAPI and StrategyAPIResponse

### 2. ✅ WebSocket NaN Parsing Error
**Problem**: NaN and Infinity values in JSON cause parsing errors in the frontend.

**Solution**:
- Added `sanitize_for_json()` function in backend to convert NaN/Inf to None
- Added sanitization in frontend WebSocket handler to filter any remaining NaN values
- All WebSocket messages are now sanitized before sending

**Files Changed**:
- `backend/app/main.py` - Added sanitize_for_json() and applied to broadcast_message()
- `frontend/src/hooks/useWebSocket.ts` - Added sanitizeValue() in onmessage handler

### 3. ✅ Standard Deviation (stdev) Error
**Problem**: `statistics.stdev()` crashes with "mss.numerator" error when:
- Less than 2 values provided
- Values contain NaN or Infinity
- Only one valid value after filtering

**Solution**:
- Filter out NaN and Infinity values before calculating stdev
- Check for minimum 2 valid values
- Wrapped in try-except to catch StatisticsError
- Gracefully returns None when calculation not possible

**Files Changed**:
- `backend/app/analytics_engine.py` - Enhanced stdev calculation with filtering and error handling

## Test Results

All fixes verified and working:

### Notional Parsing Tests
```
✓ "20M"         → 20,000,000
✓ "2B"          → 2,000,000,000
✓ "150M"        → 150,000,000
✓ "1.5B"        → 1,500,000,000
✓ "500K"        → 500,000
✓ 1000000       → 1,000,000
```

### NaN Sanitization Tests
```
✓ {rate: NaN}   → {rate: null}
✓ {rate: Inf}   → {rate: null}
✓ [1.0, NaN]    → [1.0, null]
```

### stdev Edge Cases
```
✓ [1.0, 2.0, 3.0]           → stdev = 1.0000
✓ [1.0]                     → None (need 2+ values)
✓ [NaN, 2.0, 3.0]           → stdev = 0.7071 (filtered)
✓ [1.0, Inf, 3.0]           → stdev = 1.4142 (filtered)
✓ []                        → None
```

## Impact

### Positive Changes:
- ✅ Handles all notional amount formats from API
- ✅ No more WebSocket parsing crashes
- ✅ No more analytics calculation crashes
- ✅ Better error logging for debugging
- ✅ Maintains backward compatibility

### No Breaking Changes:
- All existing numeric formats still work
- NaN/Inf converted to None (expected behavior for missing data)
- API remains unchanged

## Files Modified

### Backend (Python)
1. `backend/app/poller.py`
2. `backend/app/models.py`
3. `backend/app/analytics_engine.py`
4. `backend/app/main.py`

### Frontend (TypeScript)
1. `frontend/src/hooks/useWebSocket.ts`

## Validation

```bash
# All Python files compile successfully
python3 -m py_compile backend/app/*.py
# Exit code: 0 ✅

# All tests pass
python3 test_fixes.py
# Exit code: 0 ✅
```

## Next Steps

The application is now ready to handle:
- String notional amounts ("20M", "2B", etc.)
- NaN/Infinity values in data
- Edge cases in statistical calculations

No additional changes needed - all fixes are production-ready.
