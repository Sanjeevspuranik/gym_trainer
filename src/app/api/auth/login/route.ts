import {
  createSessionToken,
  findPasswordRow,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import {
  apiError,
  apiJson,
  readJsonObject,
  safelyRunApi,
  sameOriginError,
} from "@/lib/http";
import { AUTH_RATE_LIMITS, checkAuthRateLimit } from "@/lib/rate-limit";
import { normalizeUsername } from "@/lib/validation";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return safelyRunApi("auth.login", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }

    const parsed = await readJsonObject(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const username = normalizeUsername(parsed.value.username);
    const rateLimit = await checkAuthRateLimit(
      request,
      AUTH_RATE_LIMITS.login,
      username ?? "invalid",
    );
    if (!rateLimit.allowed) {
      return apiError(
        "Too many sign-in attempts. Try again later.",
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    const password = parsed.value.password;
    if (
      typeof password !== "string" ||
      password.length === 0 ||
      password.length > 128
    ) {
      return apiError("Enter your username and passphrase.", 400);
    }

    const database = getDatabase();
    const user = await findPasswordRow(database, username);
    const passwordMatches = await verifyPassword(
      password,
      user?.password_salt ?? null,
      user?.password_hash ?? null,
    );
    if (!user || !passwordMatches) {
      return apiError("Username or passphrase is incorrect.", 401);
    }

    const token = await createSessionToken(database, user.id);
    const response = apiJson({
      user: { id: user.id, username: user.username },
    });
    return setSessionCookie(response, token);
  });
}
