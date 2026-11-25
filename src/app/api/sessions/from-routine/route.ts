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
  createUserRoutineSession,
} from "@/lib/session-store";
import { getUserRoutineForWeek } from "@/lib/routine-store";
import { parseRoutineWorkoutStart } from "@/lib/routine-session";
import { isRoutineWeekStart } from "@/lib/routine-dates";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return safelyRunApi("sessions.start_from_routine", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }

    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to start a planned workout.", 401);
    }

    const weekStart = request.nextUrl.searchParams.get("weekStart");
    if (!weekStart || !isRoutineWeekStart(weekStart)) {
      return apiError("Choose a valid Monday week start.", 400);
    }

    const parsed = await readJsonObject(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const database = getDatabase();
    const storedRoutine = await getUserRoutineForWeek(
      database,
      user.id,
      weekStart,
    );
    if (!storedRoutine) {
      return apiError(
        "Your weekly routine is not set up yet. Run the database migrations and try again.",
        503,
      );
    }
    const validation = parseRoutineWorkoutStart(
      parsed.value,
      weekStart,
      storedRoutine.routine_json,
    );
    if (!validation.ok) {
      return apiError(validation.error, 400);
    }

    const session = await createUserRoutineSession(
      database,
      user.id,
      validation.value,
    );
    return apiJson({ session }, 201);
  });
}
