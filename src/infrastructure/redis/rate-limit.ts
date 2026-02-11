import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./client";

type LimiterName = "upload" | "standard" | "webhook";

const limiters = new Map<LimiterName, Ratelimit>();

function getOrCreate(name: LimiterName, tokens: number, window: string): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(tokens, window as `${number} ${"s" | "m" | "h" | "d"}`),
      prefix: `rl:${name}`,
    });
    limiters.set(name, limiter);
  }
  return limiter;
}

/** Upload endpoints (presign, confirm): 30 req/min per user */
export function getUploadLimiter(): Ratelimit | null {
  return getOrCreate("upload", 30, "1 m");
}

/** Standard read endpoints (url, urls, download, geo): 60 req/min per user */
export function getStandardLimiter(): Ratelimit | null {
  return getOrCreate("standard", 60, "1 m");
}

/** Webhook endpoint: 10 req/min per asset */
export function getWebhookLimiter(): Ratelimit | null {
  return getOrCreate("webhook", 10, "1 m");
}
