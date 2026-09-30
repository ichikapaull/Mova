import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { SIDEBAR_COOKIE } from "@/lib/constants";
import { AppProviders } from "@/components/providers";
import { toClientSettings } from "@/lib/settings";
import { getSettings } from "@/server/repositories/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  const settings = toClientSettings(getSettings());
  return (
    <AppProviders settings={settings}>
      <AppShell initialCollapsed={collapsed}>{children}</AppShell>
    </AppProviders>
  );
}
