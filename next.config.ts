import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native module; must be required at runtime, never bundled.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
