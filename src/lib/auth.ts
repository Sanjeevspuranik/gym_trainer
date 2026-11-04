import {
  createHash,
  pbkdf2,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDatabase, type PgQueryable } from "./database";
import type { PublicUser } from "./types";

export const SESSION_COOKIE_NAME = "gym_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_KEY_LENGTH = 32;

type UserRow = {
  id: number;
  username: string;
};

type PasswordRow = UserRow & {
  password_salt: string;
  password_hash: string;
};

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(
      password,
      salt,
      PASSWORD_ITERATIONS,
      PASSWORD_KEY_LENGTH,
      "sha256",
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(
  password: string,
): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

export async function verifyPassword(
  password: string,
  saltHex: string | null,
  hashHex: string | null,
): Promise<boolean> {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : Buffer.alloc(16);
  const candidate = await derivePassword(password, salt);
  if (!hashHex) {
    timingSafeEqual(candidate, Buffer.alloc(PASSWORD_KEY_LENGTH));
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  return (
    expected.length === candidate.length && timingSafeEqual(candidate, expected)
  );
}

export type GeneratedSessionToken = {
  token: string;
  tokenHash: string;
  expiresAt: number;
};

export function generateSessionToken(): GeneratedSessionToken {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
}

export async function createSessionToken(
  database: PgQueryable,
  userId: number,
): Promise<string> {
  const session = generateSessionToken();
  await database.query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [session.tokenHash, userId, session.expiresAt],
  );
  return session.token;
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = Math.floor(Date.now() / 1000);
  const database = getDatabase();
  const result = await database.query<UserRow>(
    `SELECT users.id, users.username
     FROM auth_sessions
     JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = $1 AND auth_sessions.expires_at > $2`,
    [tokenHash, now],
  );
  const user = result.rows[0];

  if (!user) {
    await database.query(
      "DELETE FROM auth_sessions WHERE token_hash = $1 AND expires_at <= $2",
      [tokenHash, now],
    );
    return null;
  }
  return { id: user.id, username: user.username };
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return;
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await getDatabase()
    .query("DELETE FROM auth_sessions WHERE token_hash = $1", [tokenHash]);
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function findPasswordRow(
  database: PgQueryable,
  username: string | null,
): Promise<PasswordRow | undefined> {
  if (!username) {
    return undefined;
  }
  const result = await database.query<PasswordRow>(
    `SELECT id, username, password_salt, password_hash
     FROM users WHERE username = $1`,
    [username],
  );
  return result.rows[0];
}
