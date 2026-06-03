/**
 * Upstash Redis client — singleton with graceful no-op degradation.
 *
 * When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set,
 * `getRedis()` returns null and the cache helpers fall through to the
 * underlying fetcher.  This ensures the app works without Redis configured.
 */

import { Redis } from "@upstash/redis";

let _client: Redis | null | undefined = undefined; // undefined = not yet initialised

export function getRedis(): Redis | null {
  if (_client !== undefined) return _client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _client = null;
    return null;
  }

  _client = new Redis({ url, token });
  return _client;
}
