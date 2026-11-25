import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/database";
import {
  apiError,
  apiJson,
  readJsonObject,
  safelyRunApi,
  sameOriginError,
} from "@/lib/http";
import { isRoutineWeekStart } from "@/lib/routine-dates";
import {
  deleteUserRoutineWeekOverride,
  getUserRoutineForWeek,
  saveUserRoutineWeekOverride,
} from "@/lib/routine-store";
import { parseWeeklyRoutine } from "@/lib/routine-validation";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestedWeekStart(request: Request): string | null {
  const weekStart = new URL(request.url).searchParams.get("weekStart");
  return weekStart && isRoutineWeekStart(weekStart) ? weekStart : null;
}

export async function GET(request: Request) {
  return safelyRunApi("routine.get", async () => {
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to view your weekly routine.", 401);
    }

    const weekStart = requestedWeekStart(request);
    if (!weekStart) {
      return apiError("Choose a valid Monday week start.", 400);
    }

    const row = await getUserRoutineForWeek(
      getDatabase(),
      user.id,
      weekStart,
    );
    if (!row) {
      return apiError(
        "Your weekly routine is not set up yet. Run the database migrations and try again.",
        503,
      );
    }

    return apiJson({
      routine: row.routine_json,
      weekStart,
      isOverride: row.is_override,
    });
  });
}

export async function PUT(request: NextRequest) {
  return safelyRunApi("routine.save", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to edit your weekly routine.", 401);
    }
    const weekStart = requestedWeekStart(request);
    if (!weekStart) {
      return apiError("Choose a valid Monday week start.", 400);
    }

    const parsed = await readJsonObject(request, 64 * 1024);
    if (!parsed.ok) {
      return parsed.response;
    }
    const validation = parseWeeklyRoutine(parsed.value.routine);
    if (!validation.ok) {
      return apiError(validation.error, 400);
    }

    const existingRoutine = await getUserRoutineForWeek(
      getDatabase(),
      user.id,
      weekStart,
    );
    if (!existingRoutine) {
      return apiError(
        "Your default routine is not set up yet. Run the database migrations and try again.",
        503,
      );
    }

    const routine = await saveUserRoutineWeekOverride(
      getDatabase(),
      user.id,
      weekStart,
      validation.value,
    );
    return apiJson({ routine, weekStart, isOverride: true });
  });
}

export async function DELETE(request: NextRequest) {
  return safelyRunApi("routine.reset", async () => {
    const originError = sameOriginError(request);
    if (originError) {
      return originError;
    }
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to restore your weekly routine.", 401);
    }
    const weekStart = requestedWeekStart(request);
    if (!weekStart) {
      return apiError("Choose a valid Monday week start.", 400);
    }

    const existingRoutine = await getUserRoutineForWeek(
      getDatabase(),
      user.id,
      weekStart,
    );
    if (!existingRoutine) {
      return apiError(
        "Your default routine is not set up yet. Run the database migrations and try again.",
        503,
      );
    }
    await deleteUserRoutineWeekOverride(getDatabase(), user.id, weekStart);
    const routine = await getUserRoutineForWeek(
      getDatabase(),
      user.id,
      weekStart,
    );
    if (!routine) {
      return apiError(
        "Your default routine is not set up yet. Run the database migrations and try again.",
        503,
      );
    }
    return apiJson({
      routine: routine.routine_json,
      weekStart,
      isOverride: routine.is_override,
    });
  });
}
