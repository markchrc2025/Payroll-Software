/**
 * Cache helpers: getOrSet, invalidate, invalidatePattern.
 *
 * All helpers degrade gracefully when Redis is not configured —
 * `getOrSet` calls the fetcher directly; `invalidate` is a no-op.
 */

import { getRedis } from "./client";

/**
 * Try cache first; on miss, call `fetcher`, store the result, and return it.
 *
 * @param key   Cache key string.
 * @param ttl   Expiry in seconds.  Use 0 for no expiry (write-once entries).
 * @param fetcher  Async function that produces the value on a cache miss.
 */
export async function getOrSet<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return fetcher();

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;

    const value = await fetcher();
    if (ttl > 0) {
      await redis.set(key, value, { ex: ttl });
    } else {
      await redis.set(key, value);
    }
    return value;
  } catch {
    // Redis error — fall through to DB
    return fetcher();
  }
}

/**
 * Delete a single cache key.  No-op when Redis is not configured.
 */
export async function invalidate(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // ignore
  }
}

/**
 * Delete all keys matching a pattern (uses SCAN to avoid blocking).
 * No-op when Redis is not configured.
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    // Upstash supports SCAN via the scan() helper
    let cursor: number = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = Number(nextCursor);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== 0);
  } catch {
    // ignore
  }
}
