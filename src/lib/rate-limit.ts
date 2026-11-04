import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import type { PgQueryable } from "./database";
import { getDatabase } from "./database";

type RateLimitPolicy = {
  scope: "login" | "register";
  limit: number;
  windowSeconds: number;
};

type RateLimitRow = {
  request_count: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function rateLimitSecret(): string {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_RATE_LIMIT_SECRET must contain at least 32 characters.",
    );
  }
  return secret;
}

function clientAddress(request: NextRequest): string {
  const vercelAddress = request.headers.get("x-vercel-forwarded-for");
  if (vercelAddress) {
    return vercelAddress.split(",")[0].trim();
  }
  const forwardedAddress = request.headers.get("x-forwarded-for");
  if (forwardedAddress) {
    return forwardedAddress.split(",")[0].trim();
  }
  return "unknown";
}

function hashBucket(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

async function incrementBuckets(
  database: PgQueryable,
  bucketHashes: string[],
  windowStart: number,
): Promise<number[]> {
  const result = await database.query<RateLimitRow>(
    `INSERT INTO auth_rate_limits (key_hash, window_start, request_count)
     SELECT bucket_hash, $2, 1
     FROM unnest($1::text[]) AS buckets(bucket_hash)
     ON CONFLICT (key_hash) DO UPDATE
     SET request_count = CASE
           WHEN auth_rate_limits.window_start < EXCLUDED.window_start THEN 1
           ELSE auth_rate_limits.request_count + 1
         END,
         window_start = GREATEST(
           auth_rate_limits.window_start,
           EXCLUDED.window_start
         ),
         updated_at = NOW()
     RETURNING request_count`,
    [bucketHashes, windowStart],
  );
  return result.rows.map((row) => row.request_count);
}

export async function checkAuthRateLimit(
  request: NextRequest,
  policy: RateLimitPolicy,
  subject: string,
  database: PgQueryable = getDatabase(),
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / policy.windowSeconds) * policy.windowSeconds;
  const address = clientAddress(request);
  const secret = rateLimitSecret();
  const bucketHashes = [
    hashBucket(secret, `${policy.scope}:address:${address}`),
    hashBucket(secret, `${policy.scope}:subject:${subject}`),
  ];
  const counts = await incrementBuckets(
    database,
    bucketHashes,
    windowStart,
  );
  const retryAfterSeconds = policy.windowSeconds - (now - windowStart);
  return {
    allowed: counts.every((count) => count <= policy.limit),
    retryAfterSeconds,
  };
}

export const AUTH_RATE_LIMITS = {
  login: { scope: "login", limit: 10, windowSeconds: 15 * 60 },
  register: { scope: "register", limit: 8, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitPolicy>;
