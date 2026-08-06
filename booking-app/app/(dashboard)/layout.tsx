import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <Header />
      <main className="lg:ml-64 pt-16 px-4 md:px-6 lg:px-8 pb-8 min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
