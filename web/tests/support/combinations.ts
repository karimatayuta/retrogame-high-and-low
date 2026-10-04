/**
 * Calls `fn` once for every k-combination of `items` (lexicographic by index).
 * The same `combo` array instance is reused between calls to avoid allocation:
 * copy it (`[...combo]`) if you need to keep it.
 */
export function forEachCombination<T>(items: readonly T[], k: number, fn: (combo: readonly T[]) => void): void {
  const n = items.length;
  if (!Number.isInteger(k) || k < 0 || k > n) return;
  const idx = new Array<number>(k);
  const combo = new Array<T>(k);
  for (let i = 0; i < k; i++) {
    idx[i] = i;
    combo[i] = items[i] as T;
  }
  for (;;) {
    fn(combo);
    let i = k - 1;
    while (i >= 0 && (idx[i] as number) === n - k + i) i--;
    if (i < 0) return;
    idx[i] = (idx[i] as number) + 1;
    combo[i] = items[idx[i] as number] as T;
    for (let j = i + 1; j < k; j++) {
      idx[j] = (idx[j - 1] as number) + 1;
      combo[j] = items[idx[j] as number] as T;
    }
  }
}
