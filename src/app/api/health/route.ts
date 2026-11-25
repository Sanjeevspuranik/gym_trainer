import { getDatabase } from "@/lib/database";
import { apiJson, safelyRunApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return safelyRunApi("health.check", async () => {
    const result = await getDatabase().query<{ version: string }>(
      `SELECT version
       FROM gym_trainer_migrations
      WHERE version = '0003_routine_workout_tracking'`,
    );
    if (result.rows.length === 0) {
      throw new Error("The current database migrations have not been applied.");
    }
    return apiJson({ status: "ok" });
  });
}
