import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Public marketing shell: Home, About, Pricing, Contact. */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = Boolean(await getSessionUserId());
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader authed={authed} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
