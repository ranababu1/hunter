import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getRedis } from "@/lib/users";
import { clientIp, rateLimit, retryAfterMessage } from "@/lib/rate-limit";
import {
  CONTACT_MESSAGES_KEY,
  CONTACT_TOPICS,
  contactEmail,
  type ContactMessage,
  type ContactTopic,
} from "@/lib/contact";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Public contact form. Stored in Redis for the admin; rate-limited per IP. */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = await rateLimit("contact:ip", ip, 5, 60 * 60);
  if (!limit.ok) {
    return NextResponse.json(
      { error: retryAfterMessage(limit.retryAfterSeconds), code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  const message = str(body.message, 4000);
  const topicRaw = str(body.topic, 40) || "general";
  const topic: ContactTopic = (CONTACT_TOPICS as readonly string[]).includes(topicRaw)
    ? (topicRaw as ContactTopic)
    : "general";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email.includes("@") || email.length < 5) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json(
      { error: "Message should be at least 10 characters" },
      { status: 400 },
    );
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { error: `Messaging is offline right now. Please email ${contactEmail()}.` },
      { status: 503 },
    );
  }

  const record: ContactMessage = {
    id: randomUUID(),
    name,
    email,
    topic,
    message,
    createdAt: new Date().toISOString(),
    ip,
    userId: (await getSessionUserId()) ?? undefined,
  };

  try {
    await redis.hset(CONTACT_MESSAGES_KEY, { [record.id]: JSON.stringify(record) });
  } catch (err) {
    console.warn("[hunter] contact store failed:", err);
    return NextResponse.json(
      { error: `Could not save your message. Please email ${contactEmail()}.` },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, id: record.id });
}
