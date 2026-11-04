import { getCurrentUser } from "@/lib/auth";
import { apiError, apiJson, safelyRunApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return safelyRunApi("auth.me", async () => {
    const user = await getCurrentUser();
    if (!user) {
      return apiError("Sign in to access your account.", 401);
    }
    return apiJson({ user });
  });
}
