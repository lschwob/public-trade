import type { Trade } from '../types/trade';

export function extractUnderlierTenor(raw: string | undefined | null): string | null {
  const s = (raw ?? '').toUpperCase();
  if (!s) return null;

  // Common patterns: "EURIBOR 6M", "EUR-EURIBOR-6M", "ESTR 3M" etc.
  const m = s.match(/\b(\d{1,2})\s*(M|Y)\b/);
  if (m) return `${m[1]}${m[2]}`;

  // O/N style indices often won't carry a numeric tenor in the label.
  if (/\bESTR\b|€STR|\bEONIA\b/.test(s)) return 'O/N';

  return null;
}

export function getTenorFromTrade(trade: Trade): string {
  const fromName = extractUnderlierTenor(trade.unique_product_identifier_underlier_name);
  if (fromName) return fromName;
  const fromUpi = extractUnderlierTenor(trade.unique_product_identifier);
  if (fromUpi) return fromUpi;
  return '-';
}

