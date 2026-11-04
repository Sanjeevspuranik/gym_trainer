import { timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/lib/database";
import { apiError, apiJson, safelyRunApi } from "@/lib/http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || secret.length < 32 || !authorization) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(authorization);
  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}

export async function GET(request: NextRequest) {
  return safelyRunApi("cron.cleanup", async () => {
    if (!isAuthorized(request)) {
      return apiError("Not authorized.", 401);
    }

    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const [sessions, rateLimits] = await Promise.all([
      database.query<{ token_hash: string }>(
        "DELETE FROM auth_sessions WHERE expires_at <= $1 RETURNING token_hash",
        [now],
      ),
      database.query<{ key_hash: string }>(
        "DELETE FROM auth_rate_limits WHERE window_start < $1 RETURNING key_hash",
        [now - 24 * 60 * 60],
      ),
    ]);

    return apiJson({
      status: "ok",
      removedExpiredLoginSessions: sessions.rows.length,
      removedOldRateLimitBuckets: rateLimits.rows.length,
    });
  });
}
