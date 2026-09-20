import { getUserDailyDigests, getUserJobs } from "@/lib/jobs";
import { getAppState, getCompanies } from "@/lib/redis";
import { getProfile } from "@/lib/users";
import { requireUser } from "@/lib/auth";
import { DailyView } from "@/components/DailyView";
import { EmptyFeed } from "@/components/EmptyFeed";

export const dynamic = "force-dynamic";

/** Daily feed — strictly this tenant's ingested digests. */
export default async function DailyPage() {
  const user = await requireUser();
  if (!user) {
    return <EmptyFeed roles={[]} companiesCount={0} jobsCount={0} />;
  }

  const [digests, state, allJobs] = await Promise.all([
    getUserDailyDigests(user.id),
    getAppState(user.id),
    getUserJobs(user.id),
  ]);

  if (digests.length === 0) {
    const [profile, { companies }] = await Promise.all([
      getProfile(user.id),
      getCompanies(user.id),
    ]);
    return (
      <EmptyFeed
        roles={profile.targetRoles.map((r) => r.label)}
        companiesCount={companies.filter((c) => c.active).length}
        jobsCount={allJobs.length}
      />
    );
  }

  const dates = digests.map((d) => d.date);
  const initialDate = dates[0] ?? digests[0].date;

  return (
    <DailyView
      dates={dates}
      digests={digests}
      initialDate={initialDate}
      initialState={state}
      allJobs={allJobs}
    />
  );
}
