import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import {
  apiError,
  apiJson,
  readJsonObject,
  safelyRunApi,
  sameOriginError,
} from "@/lib/http";
import { updateUserSessionSetResult } from "@/lib/session-store";
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
  return safelyRunApi("sessions.set_result", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to update a workout set.", 401);
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
    const exerciseId = parsed.value.exerciseId;
    const setNumber = parsed.value.setNumber;
    const actualReps = parsed.value.actualReps;
    const actualWeightKg = parsed.value.actualWeightKg;
    const completed = parsed.value.completed;

    if (
      typeof exerciseId !== "number" ||
      !Number.isSafeInteger(exerciseId) ||
      exerciseId < 1 ||
      typeof setNumber !== "number" ||
      !Number.isInteger(setNumber) ||
      setNumber < 1 ||
      setNumber > 20
    ) {
      return apiError("The exercise or set number is invalid.", 400);
    }
    if (
      typeof actualReps !== "number" ||
      !Number.isInteger(actualReps) ||
      actualReps < 1 ||
      actualReps > 100
    ) {
      return apiError("Actual reps must be a whole number from 1 to 100.", 400);
    }
    if (
      typeof actualWeightKg !== "number" ||
      !Number.isFinite(actualWeightKg) ||
      actualWeightKg < 0 ||
      actualWeightKg > 1000
    ) {
      return apiError("Actual weight must be between 0 and 1,000 kg.", 400);
    }
    if (typeof completed !== "boolean") {
      return apiError("The completed value must be true or false.", 400);
    }

    const session = await updateUserSessionSetResult(
      getDatabase(),
      user.id,
      sessionId,
      exerciseId,
      setNumber,
      actualReps,
      actualWeightKg,
      completed,
    );
    if (!session) {
      return apiError("Workout set not found or no longer editable.", 404);
    }
    return apiJson({ session });
  });
}
