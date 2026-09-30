"use client";

import { AlertTriangleIcon, CheckIcon, FolderIcon, FolderPlusIcon, ImageIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { FolderBrowser } from "@/components/settings/folder-browser";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { callAction } from "@/lib/client/run-action";
import { useActivity } from "@/lib/client/use-activity";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addSourceAction, completeSetupAction, removeSourceAction, scanSourcesAction } from "@/server/actions/library";

type Source = { id: number; name: string; path: string; videoCount: number };
const STEPS = ["Welcome", "Media folders", "Scan", "Thumbnails", "Done"] as const;

export function SetupWizard({ initialSources, ffmpegAvailable, ffmpegError }: { initialSources: Source[]; ffmpegAvailable: boolean; ffmpegError: string | null }) {
  const router = useRouter();
  const activity = useActivity();
  const [step, setStep] = useState(0);
  const [sources, setSources] = useState(initialSources);
  const [path, setPath] = useState("");
  const [seedCategories, setSeedCategories] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);

  const addFolder = async () => {
    setBusy(true);
    const created = await callAction(addSourceAction({ path, scan: false }));
    setBusy(false);
    if (created) {
      setSources((s) => [...s, { id: created.id, name: created.name, path: created.path, videoCount: 0 }]);
      setPath("");
    }
  };

  const startScan = async () => {
    setScanStartedAt(Date.now());
    await callAction(scanSourcesAction());
  };

  const scanRunning =
    Boolean(activity?.scan.running) || (scanStartedAt !== null && (activity?.scan.lastFinishedAt ?? 0) < scanStartedAt);
  const thumbsLeft = activity ? activity.jobs.thumbnails.queued + activity.jobs.thumbnails.running : 0;

  const finish = async () => {
    setBusy(true);
    await callAction(completeSetupAction({ seedCategories }));
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(255_106_61/0.08),transparent)]" />
      <div className="relative flex w-full max-w-xl flex-col gap-8">
        <Logo />
        <ol className="flex gap-1.5" aria-label="Setup progress">
          {STEPS.map((label, i) => (
            <li key={label} className={cn("h-1 flex-1 rounded-full bg-white/10 transition-colors duration-300", i <= step && "bg-foreground")} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">{label}</span>
            </li>
          ))}
        </ol>

        <div className="min-h-[360px] animate-fade-in" key={step}>
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <h1 className="text-3xl font-semibold tracking-tight">Welcome to your library</h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                Mova turns the video folders on this computer into a browsable library with thumbnails, hover previews, tags, series and
                watch history. Everything runs locally — nothing is uploaded, and your files are never moved or modified.
              </p>
              {!ffmpegAvailable && (
                <div className="flex gap-3 rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div>
                    <p className="font-medium text-warning">FFmpeg is required for thumbnails and previews.</p>
                    <p className="mt-1 text-muted-foreground">{ffmpegError}</p>
                    <pre className="mt-2 rounded bg-black/40 px-3 py-2 font-mono text-xs">sudo pacman -S ffmpeg</pre>
                    <p className="mt-2 text-muted-foreground">You can continue; thumbnails will be created once FFmpeg is installed.</p>
                  </div>
                </div>
              )}
              <label className="flex items-center gap-3 text-sm">
                <Checkbox checked={seedCategories} onCheckedChange={(v) => setSeedCategories(v === true)} />
                Create starter categories (Anime, Movies, Series, Clips, Music, Documentary)
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h1 className="text-2xl font-semibold tracking-tight">Add your media folders</h1>
              <p className="text-sm text-muted-foreground">Pick folders that contain videos. Sub-folders are included. You can add more later in Settings.</p>
              {sources.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {sources.map((source) => (
                    <li key={source.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                      <FolderIcon className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{source.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{source.path}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove"
                        onClick={async () => {
                          if ((await callAction(removeSourceAction(source.id))) !== undefined) setSources((s) => s.filter((x) => x.id !== source.id));
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <FolderBrowser value={path} onChange={setPath} />
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addFolder();
                }}
              >
                <Input value={path} onChange={(e) => setPath(e.target.value)} className="font-mono text-[13px]" placeholder="/path/to/videos" />
                <Button type="submit" variant="secondary" disabled={busy || !path.trim()}>
                  <FolderPlusIcon /> Add
                </Button>
              </form>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <h1 className="text-2xl font-semibold tracking-tight">Scanning your library</h1>
              <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
                {scanRunning ? <Loader2Icon className="size-6 animate-spin text-muted-foreground" /> : <CheckIcon className="size-6 text-success" />}
                <div className="text-sm">
                  {scanRunning ? (
                    <>
                      <p className="font-medium">{activity?.scan.phase === "probing" ? "Reading video metadata" : `Looking for videos in ${activity?.scan.sourceName ?? "your folders"}`}</p>
                      <p className="text-muted-foreground">
                        {activity?.scan.phase === "probing"
                          ? `${activity.scan.processed} of ${activity.scan.total}`
                          : `${activity?.scan.found ?? 0} videos found so far`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Scan complete</p>
                      <p className="text-muted-foreground">New files will be picked up automatically.</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <h1 className="text-2xl font-semibold tracking-tight">Generating thumbnails</h1>
              <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
                {thumbsLeft > 0 ? <Loader2Icon className="size-6 animate-spin text-muted-foreground" /> : <ImageIcon className="size-6 text-success" />}
                <div className="text-sm">
                  <p className="font-medium">{thumbsLeft > 0 ? `${pluralize(thumbsLeft, "thumbnail")} left` : ffmpegAvailable ? "Thumbnails ready" : "Waiting for FFmpeg"}</p>
                  <p className="text-muted-foreground">This continues in the background — you can open the library right away.</p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <h1 className="text-3xl font-semibold tracking-tight">You&apos;re all set</h1>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li>• Hover a video to preview it, click to see details, or press play.</li>
                <li>
                  • Press <kbd className="rounded border border-border-strong px-1 font-mono text-xs">/</kbd> anywhere to search.
                </li>
                <li>• Shift/Ctrl-click cards to select several and tag them at once.</li>
                <li>• In the player: Space, ←/→, J/L, M, F and ↑/↓ work as you&apos;d expect.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)} className={cn(step === 0 && "invisible")}>
            Back
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => {
                if (step === 1 && scanStartedAt === null) void startScan();
                setStep((s) => s + 1);
              }}
              disabled={(step === 1 && sources.length === 0) || (step === 2 && scanRunning)}
            >
              {step === 0 ? "Get started" : step === 3 ? "Continue" : "Next"}
            </Button>
          ) : (
            <Button onClick={finish} disabled={busy}>
              Open library
            </Button>
          )}
        </div>
        {step === 1 && sources.length === 0 && (
          <button type="button" className="-mt-4 self-end text-xs text-muted-foreground hover:text-foreground" onClick={() => void finish()}>
            Skip setup
          </button>
        )}
      </div>
    </div>
  );
}
