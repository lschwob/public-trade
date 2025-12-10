/**
 * Utility functions for sorting tenors (maturities) in a consistent order.
 * 
 * Tenors are sorted from shortest to longest maturity following standard
 * market conventions: 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 15Y, 20Y, 30Y.
 */

/**
 * Standard tenor ordering from shortest to longest maturity.
 */
export const TENOR_ORDER = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"];

/**
 * Sort an array of objects by their tenor property.
 * 
 * Objects with unknown tenors are placed at the end of the sorted array.
 * 
 * @template T - Type that has an optional tenor property
 * @param data - Array of objects to sort
 * @returns New sorted array (original array is not modified)
 * 
 * @example
 * const trades = [{ tenor: "10Y" }, { tenor: "2Y" }, { tenor: "5Y" }];
 * const sorted = sortByTenor(trades);
 * // Result: [{ tenor: "2Y" }, { tenor: "5Y" }, { tenor: "10Y" }]
 */
export const sortByTenor = <T extends { tenor?: string }>(data: T[]): T[] => {
  return [...data].sort((a, b) => {
    const indexA = a.tenor ? TENOR_ORDER.indexOf(a.tenor) : 999;
    const indexB = b.tenor ? TENOR_ORDER.indexOf(b.tenor) : 999;
    return indexA - indexB;
  });
};

/**
 * Sort an array of tenor strings in standard order.
 * 
 * @param tenors - Array of tenor strings to sort
 * @returns New sorted array of tenor strings
 * 
 * @example
 * const tenors = ["10Y", "2Y", "5Y"];
 * const sorted = sortTenorKeys(tenors);
 * // Result: ["2Y", "5Y", "10Y"]
 */
export const sortTenorKeys = (tenors: string[]): string[] => {
  return [...tenors].sort((a, b) => {
    const indexA = TENOR_ORDER.indexOf(a);
    const indexB = TENOR_ORDER.indexOf(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
};

