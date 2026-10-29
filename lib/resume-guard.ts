import { NextResponse } from "next/server";
import { hasResumesAddon, requireUser } from "@/lib/auth";
import { getRedis } from "@/lib/users";
import type { User } from "@/lib/types";

/** Session + Resume Manager add-on guard for /api/resumes/*. */
export async function requireResumesUser(): Promise<
  { user: User } | { res: NextResponse }
> {
  const user = await requireUser();
  if (!user) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!hasResumesAddon(user)) {
    return {
      res: NextResponse.json({ error: "ADDON_REQUIRED", addon: "resumes" }, { status: 402 }),
    };
  }
  if (!getRedis()) {
    return { res: NextResponse.json({ error: "Redis required" }, { status: 503 }) };
  }
  return { user };
}
