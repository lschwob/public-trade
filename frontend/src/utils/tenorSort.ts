export const TENOR_ORDER = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"];

export const sortByTenor = <T extends { tenor?: string }>(data: T[]): T[] => {
  return [...data].sort((a, b) => {
    const indexA = a.tenor ? TENOR_ORDER.indexOf(a.tenor) : 999;
    const indexB = b.tenor ? TENOR_ORDER.indexOf(b.tenor) : 999;
    return indexA - indexB;
  });
};

export const sortTenorKeys = (tenors: string[]): string[] => {
  return [...tenors].sort((a, b) => {
    const indexA = TENOR_ORDER.indexOf(a);
    const indexB = TENOR_ORDER.indexOf(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
};

