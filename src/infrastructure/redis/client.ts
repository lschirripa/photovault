import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

/**
 * Returns the Upstash Redis singleton, or null if env vars are missing.
 * All callers must handle the null case (graceful no-op).
 */
export function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  redis = new Redis({ url, token });
  return redis;
}
