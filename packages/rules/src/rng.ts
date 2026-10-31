// mulberry32. Bombs are regenerated from their stored seed on every request, so this sequence must
// stay fixed across dependency upgrades, which Effect's Random.withSeed doesn't promise.
export function createRng(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  return {
    int,
    pick: <T>(items: readonly [T, ...T[]]): T => items[int(0, items.length - 1)] ?? items[0],
    shuffle: <T>(items: readonly T[]): T[] =>
      items
        .map((item) => ({ item, key: next() }))
        .sort((a, b) => a.key - b.key)
        .map(({ item }) => item),
  }
}

export type Rng = ReturnType<typeof createRng>
