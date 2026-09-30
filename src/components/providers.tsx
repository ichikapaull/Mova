"use client";

import { MediaActionsProvider } from "@/components/media/media-actions";
import { SettingsProvider } from "@/components/settings-context";
import type { ClientSettings } from "@/lib/settings";

export function AppProviders({ settings, children }: { settings: ClientSettings; children: React.ReactNode }) {
  return (
    <SettingsProvider value={settings}>
      <MediaActionsProvider>{children}</MediaActionsProvider>
    </SettingsProvider>
  );
}
