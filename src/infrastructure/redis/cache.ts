import { getRedis } from "./client";

/**
 * Generic cache-aside helpers using Upstash Redis.
 * All functions gracefully degrade to no-ops if Redis is unavailable.
 */

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get<T>(key);
    return data ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    // fail silently
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch {
    // fail silently
  }
}
