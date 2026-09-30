import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">This video or page isn&apos;t in your library — it may have been removed.</p>
      <Button asChild variant="secondary">
        <Link href="/">Back to library</Link>
      </Button>
    </div>
  );
}
