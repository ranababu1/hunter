import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getBilling,
  getFetchRuns,
  getLastFetchDate,
  getUsage,
  listAllUsers,
} from "@/lib/users";
import { getCompanies } from "@/lib/redis";
import {
  companyPlanLabel,
  formatBytes,
  resolveEntitlements,
  storagePlanLabel,
} from "@/lib/plans";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingSelf = await getBilling(user.id);
  const ent = resolveEntitlements(user.role, billingSelf);
  if (!ent.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await listAllUsers();
  const rows = await Promise.all(
    users.map(async (u) => {
      const [billing, usage, companiesResult, runs, lastFetchDate] =
        await Promise.all([
          getBilling(u.id),
          getUsage(u.id),
          getCompanies(u.id),
          getFetchRuns(u.id),
          getLastFetchDate(u.id),
        ]);
      const e = resolveEntitlements(u.role, billing);
      const companyPlan = e.companyPlan;
      const storagePlan = e.storagePlan;
      const bytesUsed = usage?.bytesUsed ?? 0;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? "",
        role: u.role,
        companyPlan,
        storagePlan,
        planLabel: `${companyPlanLabel(companyPlan)} · ${storagePlanLabel(storagePlan)}`,
        companiesCount: companiesResult.companies.length,
        fetchRunsCount: runs.length,
        bytesUsed,
        bytesUsedFormatted: formatBytes(bytesUsed),
        lastFetchDate: lastFetchDate ?? null,
        createdAt: u.createdAt,
      };
    }),
  );

  return NextResponse.json({ users: rows });
}
