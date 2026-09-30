"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const databaseProblem = /database/i.test(error.message);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangleIcon className="size-10 text-warning" strokeWidth={1.5} />
      <h1 className="text-xl font-semibold">{databaseProblem ? "The library database is unavailable" : "Something went wrong"}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {databaseProblem
          ? "Mova couldn't open data/app.db. Check that the data folder exists and is writable, then try again."
          : error.message || "An unexpected error occurred."}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
