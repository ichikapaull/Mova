"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  FolderPlusIcon,
  HardDriveIcon,
  Loader2Icon,
  RefreshCwIcon,
  ScanSearchIcon,
  Trash2Icon,
  WifiOffIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddFolderDialog } from "@/components/settings/add-folder-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { invalidateLibraryCache } from "@/lib/client/library-cache";
import { callAction } from "@/lib/client/run-action";
import { useActivity } from "@/lib/client/use-activity";
import { formatBytes, formatCount, formatRelativeTime, pluralize } from "@/lib/format";
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
  cleanupMissingAction,
  clearCacheAction,
  generateAllPreviewsAction,
  recheckFfmpegAction,
  regenerateThumbnailsAction,
  removeSourceAction,
  rescanMetadataAction,
  restoreRemovedAction,
  scanSourcesAction,
  updateSettingsAction,
  updateSourceAction,
} from "@/server/actions/library";
import type { FfmpegStatus } from "@/server/ffmpeg/detect";
import type { MediaSourceSummary } from "@/server/repositories/sources";

export type SettingsViewProps = {
  settings: Settings;
  sources: MediaSourceSummary[];
  categories: Array<{ id: number; name: string }>;
  ffmpeg: FfmpegStatus;
  storage: {
    dataDir: string;
    dbPath: string;
    dbBytes: number;
    thumbnails: { bytes: number; files: number };
    previews: { bytes: number; files: number };
  };
  counts: { missing: number; removed: number };
  watcher: { watching: number[]; failed: Array<{ sourceId: number; error: string }> };
};

const SECTIONS = [
  ["sources", "Media Sources"],
  ["previews", "Preview Generation"],
  ["player", "Player"],
  ["appearance", "Appearance"],
  ["library", "Library"],
  ["storage", "Storage"],
  ["system", "System"],
] as const;

function Section({ id, title, description, children, actions }: { id: string; title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

function SliderSetting({
  value,
  min,
  max,
  step,
  format,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const [committed, setCommitted] = useState(value);
  if (committed !== value) {
    setCommitted(value);
    setLocal(value);
  }
  return (
    <div className="flex w-64 items-center gap-3">
      <Slider min={min} max={max} step={step} value={[local]} onValueChange={([v]) => setLocal(v ?? value)} onValueCommit={([v]) => onCommit(v ?? value)} />
      <span className="w-14 text-right font-mono text-xs text-muted-foreground tabular-nums">{format(local)}</span>
    </div>
  );
}

export function SettingsView(props: SettingsViewProps) {
  const router = useRouter();
  const activity = useActivity();
  const [settings, setSettings] = useState(props.settings);
  const [serverSettings, setServerSettings] = useState(props.settings);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<MediaSourceSummary | null>(null);
  if (serverSettings !== props.settings) {
    setServerSettings(props.settings);
    setSettings(props.settings);
  }

  const refresh = () => {
    invalidateLibraryCache();
    router.refresh();
  };

  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    if ((await callAction(updateSettingsAction({ [key]: value }))) !== undefined) router.refresh();
  };

  const scanningSourceId = activity?.scan.running ? activity.scan.sourceId : null;
  const scanBusy = Boolean(activity?.scan.running);

  return (
    <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav className="hidden lg:block" aria-label="Settings sections">
        <ul className="sticky top-24 flex flex-col gap-0.5">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-col gap-12">
        {/* ------------------------------------------------------------ Sources */}
        <Section
          id="sources"
          title="Media Sources"
          description="Folders Mova indexes. Videos stay where they are; only metadata is stored."
          actions={
            <>
              <Button variant="secondary" size="sm" disabled={scanBusy || props.sources.length === 0} onClick={() => void callAction(scanSourcesAction(), { success: "Scanning all folders…" })}>
                <ScanSearchIcon /> Scan all
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={scanBusy || props.sources.length === 0}
                onClick={() => void callAction(rescanMetadataAction(), { success: "Re-reading metadata for all videos…" })}
              >
                <RefreshCwIcon /> Rescan metadata
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <FolderPlusIcon /> Add folder
              </Button>
            </>
          }
        >
          {props.sources.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <p className="text-sm font-medium">No media folders yet</p>
              <p className="text-sm text-muted-foreground">Add a folder like ~/Videos or /mnt/archive/Movies.</p>
            </div>
          )}
          {props.sources.map((source) => {
            const scanning = scanningSourceId === source.id;
            const watchFailed = props.watcher.failed.find((f) => f.sourceId === source.id);
            return (
              <div key={source.id} className={cn("flex flex-col gap-3 px-5 py-4", !source.enabled && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <HardDriveIcon className="size-4 shrink-0 text-muted-foreground" />
                      <Input
                        defaultValue={source.name}
                        aria-label="Source name"
                        onBlur={(e) => e.target.value.trim() !== source.name && void callAction(updateSourceAction(source.id, { name: e.target.value })).then(refresh)}
                        className="field-sizing-content h-7 w-auto max-w-full min-w-16 border-transparent bg-transparent px-1 text-sm font-medium hover:border-input"
                      />
                      {!source.isOnline && (
                        <Badge variant="warning">
                          <WifiOffIcon /> Offline
                        </Badge>
                      )}
                      {scanning && (
                        <Badge>
                          <Loader2Icon className="animate-spin" /> Scanning
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate pl-6 font-mono text-xs text-muted-foreground" title={source.path}>
                      {source.path}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{source.enabled ? "Enabled" : "Disabled"}</span>
                    <Switch checked={source.enabled} onCheckedChange={(enabled) => void callAction(updateSourceAction(source.id, { enabled })).then(refresh)} aria-label="Enabled" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-6 text-xs text-muted-foreground">
                  <span>
                    <strong className="font-medium text-foreground">{formatCount(source.videoCount)}</strong> videos
                  </span>
                  {source.missingCount > 0 && <span className="text-warning">{source.missingCount} missing</span>}
                  <span suppressHydrationWarning>Last scan: {formatRelativeTime(source.lastScanAt)}</span>
                  <span className="flex items-center gap-1.5">
                    Default category:
                    <Select
                      value={source.defaultCategoryId ? String(source.defaultCategoryId) : "none"}
                      onValueChange={(value) =>
                        void callAction(updateSourceAction(source.id, { defaultCategoryId: value === "none" ? null : Number(value) })).then(refresh)
                      }
                    >
                      <SelectTrigger className="h-7 w-auto min-w-24 border-transparent bg-transparent px-2 text-xs hover:border-input">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {props.categories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                </div>
                {(source.lastScanError || watchFailed) && (
                  <p className="ml-6 flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                    <AlertTriangleIcon className="mt-px size-3.5 shrink-0" />
                    {source.lastScanError ?? `Live folder watching unavailable (${watchFailed?.error}). Use Scan to pick up changes.`}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pl-6">
                  <Button variant="secondary" size="sm" disabled={scanBusy} onClick={() => void callAction(scanSourcesAction([source.id]), { success: `Scanning ${source.name}…` })}>
                    <ScanSearchIcon /> Scan folder
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={scanBusy}
                    onClick={() => void callAction(rescanMetadataAction([source.id]), { success: "Re-reading metadata…" })}
                  >
                    <RefreshCwIcon /> Rescan metadata
                  </Button>
                  <Button variant="ghost" size="sm" className="hover:text-destructive" onClick={() => setRemoving(source)}>
                    <Trash2Icon /> Remove folder
                  </Button>
                </div>
              </div>
            );
          })}
          {activity?.scan.running && (
            <div className="flex items-center gap-3 px-5 py-3 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {activity.scan.phase === "probing"
                ? `Reading metadata ${activity.scan.processed}/${activity.scan.total}`
                : `Scanning ${activity.scan.sourceName ?? ""} · ${activity.scan.found} videos found`}
            </div>
          )}
        </Section>

        {/* ------------------------------------------------------------ Previews */}
        <Section id="previews" title="Preview Generation" description="Short muted clips that play when you hover a video.">
          <Row title="Hover preview" description="Play a preview when the mouse rests on a card.">
            <Switch checked={settings.hoverPreviewEnabled} onCheckedChange={(v) => update("hoverPreviewEnabled", v)} />
          </Row>
          <Row title="Hover delay" description="How long to wait before the preview starts.">
            <SliderSetting value={settings.hoverDelayMs} min={200} max={2000} step={50} format={(v) => `${v} ms`} onCommit={(v) => update("hoverDelayMs", v)} />
          </Row>
          <Row title="Generation" description="Background: build previews for the whole library after thumbnails. On demand: only when you hover.">
            <Select value={settings.previewGeneration} onValueChange={(v) => update("previewGeneration", v as Settings["previewGeneration"])}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="background">Background</SelectItem>
                <SelectItem value="on-demand">On demand</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row title="Preview length" description="Applies to newly generated previews.">
            <SliderSetting value={settings.previewLengthSec} min={4} max={20} step={1} format={(v) => `${v} s`} onCommit={(v) => update("previewLengthSec", v)} />
          </Row>
          <Row title="Preview resolution">
            <Select value={String(settings.previewHeight)} onValueChange={(v) => update("previewHeight", Number(v) as Settings["previewHeight"])}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="240">240p (smallest)</SelectItem>
                <SelectItem value="360">360p</SelectItem>
                <SelectItem value="480">480p</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row title="Generate missing previews now" description={`${formatCount(props.storage.previews.files)} previews cached.`}>
            <Button variant="secondary" size="sm" onClick={() => void callAction(generateAllPreviewsAction(), { success: (n) => `Queued ${pluralize(n, "preview")}` })}>
              Generate
            </Button>
          </Row>
        </Section>

        {/* ------------------------------------------------------------ Player */}
        <Section id="player" title="Player">
          <Row title="Autoplay next episode" description="When a series episode or linked continuation ends.">
            <Switch checked={settings.autoplayNextEpisode} onCheckedChange={(v) => update("autoplayNextEpisode", v)} />
          </Row>
          <Row title="Countdown before next episode">
            <SliderSetting value={settings.autoplayCountdownSec} min={3} max={30} step={1} format={(v) => `${v} s`} onCommit={(v) => update("autoplayCountdownSec", v)} />
          </Row>
          <Row title="Resume playback" description="Offer to continue where you left off.">
            <Switch checked={settings.resumePlayback} onCheckedChange={(v) => update("resumePlayback", v)} />
          </Row>
          <Row title="Count as watched at" description="Share of the video that must be played.">
            <SliderSetting
              value={settings.completedThreshold}
              min={0.5}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onCommit={(v) => update("completedThreshold", v)}
            />
          </Row>
        </Section>

        {/* ------------------------------------------------------------ Appearance */}
        <Section id="appearance" title="Appearance">
          <Row title="Grid size" description="Card size in the library grid.">
            <Select value={settings.gridSize} onValueChange={(v) => update("gridSize", v as Settings["gridSize"])}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </Section>

        {/* ------------------------------------------------------------ Library */}
        <Section id="library" title="Library">
          <Row
            title="Watch folders for changes"
            description={
              settings.watchFolders
                ? `New files are picked up automatically (${props.watcher.watching.length} folder(s) watched). Manual scan always works.`
                : "Only manual and startup scans pick up new files."
            }
          >
            <Switch checked={settings.watchFolders} onCheckedChange={(v) => update("watchFolders", v)} />
          </Row>
          <Row title="Thumbnail position" description="Where in the video the thumbnail frame is taken.">
            <SliderSetting
              value={settings.thumbnailPosition}
              min={0.05}
              max={0.9}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onCommit={(v) => update("thumbnailPosition", v)}
            />
            <Button variant="secondary" size="sm" onClick={() => void callAction(regenerateThumbnailsAction(), { success: "Regenerating thumbnails…" })}>
              Regenerate
            </Button>
          </Row>
          <Row title="Missing files" description={`${pluralize(props.counts.missing, "entry", "entries")} whose file is gone. Cleaning up deletes their tags and history.`}>
            <Button
              variant="secondary"
              size="sm"
              disabled={props.counts.missing === 0}
              onClick={() => void callAction(cleanupMissingAction(), { success: (n) => `Removed ${pluralize(n, "entry", "entries")}` }).then(refresh)}
            >
              Clean up
            </Button>
          </Row>
          <Row title="Removed videos" description={`${pluralize(props.counts.removed, "video")} hidden with “Remove from Library”.`}>
            <Button
              variant="secondary"
              size="sm"
              disabled={props.counts.removed === 0}
              onClick={() => void callAction(restoreRemovedAction(), { success: "Restoring…" }).then(refresh)}
            >
              Restore all
            </Button>
          </Row>
        </Section>

        {/* ------------------------------------------------------------ Storage */}
        <Section id="storage" title="Storage" description="Back up the database file to keep all tags, collections, series and history. The cache can always be rebuilt.">
          <Row title="Database" description={<span className="font-mono text-xs">{props.storage.dbPath}</span>}>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <DatabaseIcon className="size-4" /> {formatBytes(props.storage.dbBytes)}
            </span>
          </Row>
          <Row title="Thumbnail cache" description={`${formatCount(props.storage.thumbnails.files)} files · ${formatBytes(props.storage.thumbnails.bytes)}`}>
            <Button variant="secondary" size="sm" onClick={() => void callAction(clearCacheAction("thumbnails"), { success: "Thumbnail cache cleared; regenerating…" }).then(refresh)}>
              Clear
            </Button>
          </Row>
          <Row title="Preview cache" description={`${formatCount(props.storage.previews.files)} files · ${formatBytes(props.storage.previews.bytes)}`}>
            <Button variant="secondary" size="sm" onClick={() => void callAction(clearCacheAction("previews"), { success: "Preview cache cleared" }).then(refresh)}>
              Clear
            </Button>
          </Row>
          <Row title="Data folder" description={<span className="font-mono text-xs">{props.storage.dataDir}</span>}>
            <span className="text-xs text-muted-foreground">Set MOVA_DATA_DIR to move it</span>
          </Row>
        </Section>

        {/* ------------------------------------------------------------ System */}
        <Section id="system" title="System">
          <Row
            title="FFmpeg"
            description={
              props.ffmpeg.available ? (
                <>
                  ffmpeg {props.ffmpeg.ffmpegVersion} · ffprobe {props.ffmpeg.ffprobeVersion} · preview encoder {props.ffmpeg.previewEncoder ?? "none found"}
                </>
              ) : (
                props.ffmpeg.error
              )
            }
          >
            {props.ffmpeg.available ? (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2Icon className="size-4" /> Available
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-warning">
                <AlertTriangleIcon className="size-4" /> Missing
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={() => void callAction(recheckFfmpegAction()).then(refresh)}>
              Re-check
            </Button>
          </Row>
          {!props.ffmpeg.available && (
            <div className="px-5 py-4 text-sm">
              <p className="mb-2 font-medium">FFmpeg is required for thumbnails and previews.</p>
              <p className="mb-3 text-muted-foreground">Install it with your package manager, then press Re-check:</p>
              <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed text-foreground/90">
                {`# Arch Linux / CachyOS
sudo pacman -S ffmpeg

# Debian / Ubuntu
sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg-free`}
              </pre>
            </div>
          )}
          {props.ffmpeg.available && !props.ffmpeg.previewEncoder && (
            <div className="px-5 py-4 text-sm text-warning">No H.264 or VP9 encoder was found in this FFmpeg build; hover previews are disabled.</div>
          )}
        </Section>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        {addOpen && (
          <AddFolderDialog
            categories={props.categories}
            onAdded={() => {
              setAddOpen(false);
              refresh();
            }}
          />
        )}
      </Dialog>
      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        {removing && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove “{removing.name}”?</DialogTitle>
              <DialogDescription>
                {pluralize(removing.videoCount, "video")} from this folder will be removed from the library together with their tags, history and
                collection entries. <strong className="text-foreground">No files on disk are touched.</strong> Tip: disable the folder instead to hide it temporarily.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if ((await callAction(removeSourceAction(removing.id), { success: "Folder removed" })) !== undefined) {
                    setRemoving(null);
                    refresh();
                  }
                }}
              >
                Remove folder
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
