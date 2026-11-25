import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import {
  apiError,
  apiJson,
  readJsonObject,
  safelyRunApi,
  sameOriginError,
} from "@/lib/http";
import { setUserSessionCardioCompletion } from "@/lib/session-store";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return safelyRunApi("sessions.cardio", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to update workout cardio.", 401);
    }

    const { id } = await context.params;
    const sessionId = parseId(id);
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

    const session = await setUserSessionCardioCompletion(
      getDatabase(),
      user.id,
      sessionId,
      parsed.value.completed,
    );
    if (!session) {
      return apiError("Workout cardio not found or no longer editable.", 404);
    }
    return apiJson({ session });
  });
}
