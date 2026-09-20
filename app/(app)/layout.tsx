import { Nav } from "@/components/Nav";
import { AppMain } from "@/components/AppMain";
import { MeProvider } from "@/components/MeProvider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MeProvider>
      <div className="min-h-screen">
        <Nav />
        <AppMain>{children}</AppMain>
      </div>
    </MeProvider>
  );
}
