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
  deleteUserSession,
  setUserSessionCompletion,
} from "@/lib/session-store";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function sessionIdFrom(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) {
    return null;
  }
  const sessionId = Number(id);
  return Number.isSafeInteger(sessionId) ? sessionId : null;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return safelyRunApi("sessions.update", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to update a workout session.", 401);
    }

    const sessionId = await sessionIdFrom(context);
    if (sessionId === null) {
      return apiError("Workout session not found.", 404);
    }
    const parsed = await readJsonObject(request);
    if (!parsed.ok) {
      return parsed.response;
    }
    if (typeof parsed.value.completed !== "boolean") {
      return apiError("The completed value must be true or false.", 400);
    }

    const session = await setUserSessionCompletion(
      getDatabase(),
      user.id,
      sessionId,
      parsed.value.completed,
    );
    if (!session) {
      return apiError("Workout session not found.", 404);
    }
    return apiJson({ session });
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return safelyRunApi("sessions.delete", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to delete a workout session.", 401);
    }

    const sessionId = await sessionIdFrom(context);
    if (sessionId === null) {
      return apiError("Workout session not found.", 404);
    }
    const deleted = await deleteUserSession(
      getDatabase(),
      user.id,
      sessionId,
    );
    if (!deleted) {
      return apiError("Workout session not found.", 404);
    }
    return apiJson({ ok: true });
  });
}
