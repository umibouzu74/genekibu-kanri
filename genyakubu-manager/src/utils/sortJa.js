/** Japanese locale comparator for Array.sort() */
export const compareJa = (a, b) => a.localeCompare(b, "ja");

/** Sort a string array in-place by Japanese locale order. Returns the array. */
export const sortJa = (arr) => arr.sort(compareJa);
