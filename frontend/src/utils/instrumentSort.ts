/**
 * Utility functions for sorting instruments (maturities) in a consistent order.
 * 
 * Instruments are sorted from shortest to longest maturity following standard
 * market conventions: 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 15Y, 20Y, 30Y.
 * For complex instruments like "5Y10Y", the base tenor (first part) is used for sorting.
 */

/**
 * Standard instrument ordering from shortest to longest maturity.
 */
export const INSTRUMENT_ORDER = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"];

/**
 * Extract base instrument for sorting (e.g., "10Y" from "5Y10Y").
 */
const getBaseInstrument = (instrument: string): string => {
  // Extract base instrument (first part before '/' or the whole string)
  return instrument.split('/')[0] || instrument;
};

/**
 * Sort an array of objects by their instrument property.
 * 
 * Objects with unknown instruments are placed at the end of the sorted array.
 * 
 * @template T - Type that has an optional instrument property
 * @param data - Array of objects to sort
 * @returns New sorted array (original array is not modified)
 * 
 * @example
 * const trades = [{ instrument: "10Y" }, { instrument: "2Y" }, { instrument: "5Y" }];
 * const sorted = sortByInstrument(trades);
 * // Result: [{ instrument: "2Y" }, { instrument: "5Y" }, { instrument: "10Y" }]
 */
export const sortByInstrument = <T extends { instrument?: string }>(data: T[]): T[] => {
  return [...data].sort((a, b) => {
    const baseA = a.instrument ? getBaseInstrument(a.instrument) : null;
    const baseB = b.instrument ? getBaseInstrument(b.instrument) : null;
    const indexA = baseA ? INSTRUMENT_ORDER.indexOf(baseA) : 999;
    const indexB = baseB ? INSTRUMENT_ORDER.indexOf(baseB) : 999;
    return indexA - indexB;
  });
};

/**
 * Sort an array of instrument strings in standard order.
 * 
 * @param instruments - Array of instrument strings to sort
 * @returns New sorted array of instrument strings
 * 
 * @example
 * const instruments = ["10Y", "2Y", "5Y"];
 * const sorted = sortInstrumentKeys(instruments);
 * // Result: ["2Y", "5Y", "10Y"]
 */
export const sortInstrumentKeys = (instruments: string[]): string[] => {
  return [...instruments].sort((a, b) => {
    const baseA = getBaseInstrument(a);
    const baseB = getBaseInstrument(b);
    const indexA = INSTRUMENT_ORDER.indexOf(baseA);
    const indexB = INSTRUMENT_ORDER.indexOf(baseB);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
};

// Legacy exports for backward compatibility (deprecated)
/** @deprecated Use sortByInstrument instead */
export const sortByTenor = sortByInstrument;
/** @deprecated Use sortInstrumentKeys instead */
export const sortTenorKeys = sortInstrumentKeys;
/** @deprecated Use INSTRUMENT_ORDER instead */
export const TENOR_ORDER = INSTRUMENT_ORDER;

