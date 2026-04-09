const cache = new Map<string, { expiresAt: number; value: unknown }>()

export function readCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}

export function writeCache<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value })
}
