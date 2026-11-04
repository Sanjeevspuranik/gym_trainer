import {
  clearSessionCookie,
  revokeCurrentSession,
} from "@/lib/auth";
import { apiJson, safelyRunApi, sameOriginError } from "@/lib/http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return safelyRunApi("auth.logout", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }

    await revokeCurrentSession();
    return clearSessionCookie(apiJson({ ok: true }));
  });
}
