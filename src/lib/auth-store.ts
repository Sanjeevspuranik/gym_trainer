import type { PgQueryable } from "./database";
import type { PublicUser } from "./types";

export type NewAccountWithSession = {
  username: string;
  passwordSalt: string;
  passwordHash: string;
  tokenHash: string;
  expiresAt: number;
};

export async function createUserWithSession(
  database: PgQueryable,
  input: NewAccountWithSession,
): Promise<PublicUser> {
  const result = await database.query<PublicUser>(
    `WITH new_user AS (
       INSERT INTO users
         (username, password_salt, password_hash, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, username
     ),
     new_auth_session AS (
       INSERT INTO auth_sessions
         (token_hash, user_id, expires_at, created_at)
       SELECT $4, new_user.id, $5, NOW()
       FROM new_user
       RETURNING user_id
     )
     SELECT new_user.id, new_user.username
     FROM new_user
     JOIN new_auth_session ON new_auth_session.user_id = new_user.id`,
    [
      input.username,
      input.passwordSalt,
      input.passwordHash,
      input.tokenHash,
      input.expiresAt,
    ],
  );
  const user = result.rows[0];
  if (!user) {
    throw new Error("The new account could not be loaded.");
  }
  return user;
}
