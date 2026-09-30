import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { NavigationTracker } from "@/components/navigation-tracker";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mova", template: "%s · Mova" },
  description: "Your local video library",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#090909",
  colorScheme: "dark",
};

// Everything reads the local database; nothing is prerendered at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <NavigationTracker />
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          {children}
        </TooltipProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!bg-[#171717] !border-[rgb(255_255_255/0.1)] !text-foreground !rounded-lg !shadow-2xl",
              description: "!text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
