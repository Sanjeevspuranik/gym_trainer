import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import {
  apiError,
  apiJson,
  readJsonObject,
  safelyRunApi,
  sameOriginError,
} from "@/lib/http";
import {
  createUserSession,
  listUserSessions,
} from "@/lib/session-store";
import { parseWorkoutSession } from "@/lib/validation";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return safelyRunApi("sessions.list", async () => {
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to access your workout sessions.", 401);
    }
    return apiJson({
      sessions: await listUserSessions(getDatabase(), user.id),
    });
  });
}

export async function POST(request: NextRequest) {
  return safelyRunApi("sessions.create", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to create a workout session.", 401);
    }

    const parsed = await readJsonObject(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    const validation = parseWorkoutSession(parsed.value);
    if (!validation.ok) {
      return apiError(validation.error, 400);
    }

    const session = await createUserSession(
      getDatabase(),
      user.id,
      validation.value,
    );
    return apiJson({ session }, 201);
  });
}
