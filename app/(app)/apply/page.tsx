import { hasApplyAddon, requireUser } from "@/lib/auth";
import { getApplyItems } from "@/lib/apply";
import { ApplyView } from "@/components/ApplyView";

export const dynamic = "force-dynamic";

/** Apply add-on — recommended roles the assistant applies to on approval. */
export default async function ApplyPage() {
  const user = await requireUser();
  const enabled = user ? hasApplyAddon(user) : false;
  const items = user && enabled ? await getApplyItems(user.id) : [];
  return <ApplyView enabled={enabled} initialItems={items} />;
}
