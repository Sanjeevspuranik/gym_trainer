import {
  generateSessionToken,
  hashPassword,
  setSessionCookie,
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
import { isValidRegistrationPassword, normalizeUsername } from "@/lib/validation";
import { createUserWithSession } from "@/lib/auth-store";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return safelyRunApi("auth.register", async () => {
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
      AUTH_RATE_LIMITS.register,
      username ?? "invalid",
    );
    if (!rateLimit.allowed) {
      return apiError(
        "Too many account creation attempts. Try again later.",
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }
    if (!username) {
      return apiError(
        "Use 3–32 letters, numbers, hyphens, or underscores for your username.",
        400,
      );
    }

    const password = parsed.value.password;
    if (!isValidRegistrationPassword(password)) {
      return apiError("Use a passphrase between 12 and 128 characters.", 400);
    }

    const credentials = await hashPassword(password);
    const session = generateSessionToken();
    const database = getDatabase();
    try {
      const user = await createUserWithSession(database, {
        username,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
      });

      const response = apiJson({ user }, 201);
      return setSessionCookie(response, session.token);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        return apiError("That username is already in use.", 409);
      }
      throw error;
    }
  });
}
