import { createSessionToken, hashPassword, setSessionCookie } from "@/lib/auth";
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
    const database = getDatabase();
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: number; username: string }>(
        `INSERT INTO users (username, password_salt, password_hash, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, username`,
        [username, credentials.salt, credentials.hash],
      );
      const user = result.rows[0];
      if (!user) {
        throw new Error("The new account could not be loaded.");
      }

      const token = await createSessionToken(client, user.id);
      await client.query("COMMIT");
      const response = apiJson({ user }, 201);
      return setSessionCookie(response, token);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error(
          JSON.stringify({ event: "auth_register_rollback_failed" }),
        );
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        return apiError("That username is already in use.", 409);
      }
      throw error;
    } finally {
      client.release();
    }
  });
}
