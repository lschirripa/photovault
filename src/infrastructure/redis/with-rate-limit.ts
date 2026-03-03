import { NextResponse } from "next/server";
import type { Ratelimit } from "@upstash/ratelimit";

// Track consecutive Redis failures to avoid log spam
let consecutiveFailures = 0;

/**
 * Check rate limit and return a 429 response if exceeded, or null if allowed.
 * If the limiter is null (Redis unavailable), always allows the request.
 * On Redis errors, logs the first failure and periodic reminders, then fails open.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<NextResponse | null> {
  if (!limiter) return null;

  try {
    const result = await limiter.limit(identifier);

    // Reset failure counter on success
    if (consecutiveFailures > 0) {
      console.log(`Rate limiter recovered after ${consecutiveFailures} failures`);
      consecutiveFailures = 0;
    }

    if (!result.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(result.reset),
            "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)),
          },
        }
      );
    }
  } catch (err) {
    consecutiveFailures++;
    // Log first failure and every 100th after to avoid log spam
    if (consecutiveFailures === 1 || consecutiveFailures % 100 === 0) {
      console.error(
        `Rate limiter Redis error (failure #${consecutiveFailures}):`,
        err instanceof Error ? err.message : err
      );
    }
    // Fail open — allow the request through
  }

  return null;
}
