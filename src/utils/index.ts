/**
 * Groups array elements by a key extracted from each element.
 *
 * @param items - The array of items to group
 * @param keySelector - A function that extracts the grouping key from each item
 * @returns A Map where keys are the group identifiers and values are arrays of items
 *
 * @example
 * ```ts
 * const users = [
 *   { id: 1, role: "admin" },
 *   { id: 2, role: "user" },
 *   { id: 3, role: "admin" },
 * ];
 *
 * const byRole = groupBy(users, (u) => u.role);
 * // Map { "admin" => [{id: 1, ...}, {id: 3, ...}], "user" => [{id: 2, ...}] }
 * ```
 */
export function groupBy<T, K>(
  items: T[],
  keySelector: (item: T) => K
): Map<K, T[]> {
  return items.reduce((map, item) => {
    const key = keySelector(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
    return map;
  }, new Map<K, T[]>());
}
