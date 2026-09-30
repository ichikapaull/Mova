"use client";

import { createContext, useContext } from "react";
import { type ClientSettings, DEFAULT_SETTINGS, toClientSettings } from "@/lib/settings";

const SettingsContext = createContext<ClientSettings>(toClientSettings(DEFAULT_SETTINGS));

export function SettingsProvider({ value, children }: { value: ClientSettings; children: React.ReactNode }) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useClientSettings(): ClientSettings {
  return useContext(SettingsContext);
}
