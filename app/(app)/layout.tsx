import { Nav } from "@/components/Nav";
import { AppMain } from "@/components/AppMain";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Nav />
      <AppMain>{children}</AppMain>
    </div>
  );
}
