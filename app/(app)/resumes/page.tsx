import { hasResumesAddon, requireUser } from "@/lib/auth";
import { listResumes } from "@/lib/resumes";
import { getApplyItems } from "@/lib/apply";
import { ResumesView } from "@/components/ResumesView";

export const dynamic = "force-dynamic";

/** Resume Manager add-on — resume versions, editor, tailored drafts, export. */
export default async function ResumesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await requireUser();
  const enabled = user ? hasResumesAddon(user) : false;
  const resumes = user && enabled ? await listResumes(user.id) : [];
  const applyItems = user && enabled ? await getApplyItems(user.id) : [];
  const { id } = await searchParams;
  return (
    <ResumesView
      enabled={enabled}
      initialResumes={resumes}
      applyItems={applyItems.map((a) => ({ id: a.id, label: `${a.company} — ${a.role}` }))}
      initialId={id}
    />
  );
}
