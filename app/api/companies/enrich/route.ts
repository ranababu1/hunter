import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCompanies, saveCompanies } from "@/lib/redis";
import { enrichCompaniesFromSeed } from "@/lib/enrich-companies";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let companyIds: string[] | undefined;
  try {
    const body: unknown = await request.json();
    if (body != null && isRecord(body) && "companyIds" in body) {
      const raw = body.companyIds;
      if (raw != null) {
        if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string")) {
          return NextResponse.json(
            { error: "companyIds must be an array of strings" },
            { status: 400 },
          );
        }
        companyIds = raw;
      }
    }
  } catch {
    // empty body is fine — enrich all
  }

  const { companies, redisAvailable } = await getCompanies(user.id);
  if (!redisAvailable) {
    return NextResponse.json(
      { error: "Redis unavailable — cannot persist companies" },
      { status: 503 },
    );
  }

  const result = await enrichCompaniesFromSeed(companies, { companyIds });

  if (result.updated > 0) {
    const ok = await saveCompanies(user.id, result.companies);
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to write companies to Redis" },
        { status: 503 },
      );
    }
  }

  return NextResponse.json(result);
}
