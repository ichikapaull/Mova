import { type NextRequest, NextResponse } from "next/server";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
const EXTRA_HOSTNAMES = new Set(
  (process.env.MOVA_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

function hostnameOf(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  return host.split(":")[0] ?? "";
}

/**
 * Rejects requests whose Host header isn't a loopback name. Binding to 127.0.0.1
 * already blocks the network; this additionally stops DNS-rebinding attacks from
 * web pages open in the local browser. Future LAN use: set MOVA_ALLOWED_HOSTS.
 */
export function proxy(request: NextRequest) {
  const hostname = hostnameOf(request.headers.get("host") ?? "");
  if (LOCAL_HOSTNAMES.has(hostname) || EXTRA_HOSTNAMES.has(hostname)) return NextResponse.next();
  return new NextResponse("Forbidden host", { status: 403 });
}

export const config = {
  matcher: "/:path*",
};
