import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBilling, getRedis } from "@/lib/users";
import { resolveEntitlements } from "@/lib/plans";
import { CONTACT_MESSAGES_KEY, type ContactMessage } from "@/lib/contact";

/** Admin-only: list contact-form messages, newest first. */
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ent = resolveEntitlements(user.role, await getBilling(user.id));
  if (!ent.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const redis = getRedis();
  if (!redis) return NextResponse.json({ messages: [] });

  const raw = await redis.hgetall<Record<string, string | ContactMessage>>(
    CONTACT_MESSAGES_KEY,
  );
  const messages: ContactMessage[] = [];
  for (const v of Object.values(raw ?? {})) {
    try {
      messages.push(typeof v === "string" ? (JSON.parse(v) as ContactMessage) : v);
    } catch {
      // skip malformed
    }
  }
  messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ messages });
}
