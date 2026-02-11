import { NextResponse } from "next/server";
import type { Ratelimit } from "@upstash/ratelimit";

/**
 * Check rate limit and return a 429 response if exceeded, or null if allowed.
 * If the limiter is null (Redis unavailable), always allows the request.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<NextResponse | null> {
  if (!limiter) return null;

  try {
    const result = await limiter.limit(identifier);

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
  } catch {
    // Redis error — fail open (allow the request)
  }

  return null;
}
