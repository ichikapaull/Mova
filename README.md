# Mova

A local-only, single-user media library for the video folders on your computer.
Point it at folders like `/mnt/archive/Movies` or `~/Videos/Anime` and it indexes
them into a Netflix/Plex-style library with thumbnails, hover previews, tags,
categories, collections, series, watch history and a keyboard-friendly player.

- **Your files stay where they are.** Mova never moves, copies, renames or deletes
  videos. It only reads them.
- **Fully offline.** No accounts, telemetry, analytics, CDNs or web fonts.
- **Loopback only.** The server binds to `127.0.0.1` and rejects foreign `Host` headers.

---

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | ≥ 22.18 (tested on 26) | Built-in TypeScript support is used for the migration script |
| pnpm | 10+ | `sudo pacman -S pnpm` or `npm i -g pnpm` |
| FFmpeg + ffprobe | any recent | Needed for metadata, thumbnails and previews |
| C/C++ toolchain | — | Only if no prebuilt `better-sqlite3` binary exists for your Node version (`base-devel` on Arch) |

### FFmpeg installation

Mova checks for `ffmpeg` and `ffprobe` on startup and shows a notice in Settings → System
when they are missing. It never installs anything by itself.

```bash
# Arch Linux / CachyOS
sudo pacman -S ffmpeg

# Debian / Ubuntu
sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg-free
```

Custom binaries can be used with `MOVA_FFMPEG_PATH` / `MOVA_FFPROBE_PATH`.
Hover previews are encoded with `libx264` (falls back to `libopenh264` or VP9/VP8 if absent).

## Installation

```bash
pnpm install
pnpm db:migrate
pnpm dev          # http://127.0.0.1:3000
```

Production build:

```bash
pnpm build
pnpm start        # http://127.0.0.1:3000
```

On first launch a short setup wizard asks for your media folders, scans them and starts
generating thumbnails. No config files need to be edited.

## Development

```bash
pnpm dev          # dev server on 127.0.0.1:3000
pnpm typecheck    # tsc --noEmit (strict)
pnpm lint         # eslint
pnpm test         # vitest (no real video files needed)
pnpm build        # production build
```

Next.js telemetry is disabled in every script (`NEXT_TELEMETRY_DISABLED=1`).

### Architecture

A single Next.js (App Router) app; no separate backend or services.

```
src/
├── app/                 routes
│   ├── (app)/           pages with the sidebar shell (home, library, settings, …)
│   ├── watch/[id]       full-screen player
│   ├── setup            first-run wizard
│   └── api/             byte-serving endpoints (stream, thumbnail, preview) + JSON for the client
├── components/          React UI (shadcn/ui-style primitives in components/ui)
├── lib/                 isomorphic helpers (formatting, query parsing, search, episode parsing)
├── server/              server-only code
│   ├── db/              Drizzle schema + SQLite connection (auto-migrates on start)
│   ├── repositories/    all database reads/writes
│   ├── actions/         server actions (mutations called from the UI)
│   ├── ffmpeg/          ffprobe/ffmpeg wrappers (spawned with argument arrays, never a shell)
│   ├── scanner.ts       recursive walk + incremental indexer + scan queue
│   ├── jobs.ts          in-process thumbnail/preview job queue
│   ├── watcher.ts       optional fs.watch-based change detection
│   └── media-paths.ts   path validation (traversal/symlink protection)
├── instrumentation.ts   boots background services when the server starts
└── proxy.ts             Host-header allow-list (DNS-rebinding protection)
```

- **Pages** are server components that read SQLite directly.
- **Mutations** are server actions that validate input with zod.
- **The library grid** is virtualized and loads 60-item pages from `/api/media` into a
  client-side cache, so returning from a video restores the exact scroll position.
- **Background work** (scans, ffprobe, thumbnails, previews) runs inside the Next.js server
  process: one scan at a time, 2 thumbnail workers, 1 background + 1 on-demand preview worker.

## Database

SQLite via Drizzle ORM, stored in `data/app.db` (WAL mode). Migrations live in `drizzle/` and are
applied by `pnpm db:migrate` and automatically at server start.

| Table | Purpose |
| --- | --- |
| `media_sources` | Watched folders (path, enabled, default category, online state, last scan) |
| `media` | One row per video file: paths, file stats, ffprobe metadata, job states, favorite, status |
| `tags`, `media_tags` | Free-form tags (case-insensitive unique) |
| `categories`, `media_categories` | Broad groups with optional icon/description; many-to-many |
| `collections`, `collection_items` | Manual, ordered lists (`position`) |
| `series`, `series_episodes` | Season/episode numbers + manual `position`; a video is in at most one series |
| `media_relations` | `continuation` (A → B) and symmetric `related` links |
| `watch_history` | Position, duration, completed, play count, last watched (one row per video) |
| `settings` | Key/value JSON settings |

Indexing is incremental: unchanged files (same path, size and mtime) are skipped; changed files are
re-probed; vanished files are marked **missing** (never deleted automatically); a new path whose size
and mtime match a missing entry is treated as a **move/rename**, so tags, history and series follow the file.
"Remove from Library" hides an entry permanently without touching the file.

To change the schema: edit `src/server/db/schema.ts`, run `pnpm db:generate`, commit the new SQL in `drizzle/`.

## Adding media folders

Settings → **Media Sources** → **Add folder**. Type an absolute path or use **Browse**.
Each folder can have a default category (e.g. `/mnt/anime` → Anime) applied to new files.

- **Scan folder / Scan all** — incremental rescan.
- **Rescan metadata** — re-reads ffprobe metadata and regenerates thumbnails.
- **Disable** — hides a folder's videos temporarily (keeps all metadata).
- **Remove folder** — removes its entries from the library database. Files are not touched.

New files are picked up automatically while the app runs (recursive `fs.watch`, debounced).
A catch-up scan also runs on every start. If watching fails (e.g. inotify limits, network mounts)
Settings shows it and manual scans keep working.

**External disks:** if a folder is unreachable, or is an empty mount point while the library
knows videos there, the source is marked *offline* instead of marking everything missing.

Supported extensions: `mp4 mkv webm mov avi m4v wmv flv mpg mpeg ts m2ts ogv 3gp`.
Playback uses the browser's decoders: H.264/VP9/AV1 in MP4/WebM/MKV work everywhere; HEVC or
AVI/WMV files may not. For those the player offers **Open in system player** (xdg-open).

## Data directory

```
data/
├── app.db              ← everything you created: tags, categories, collections, series, history, settings
├── app.db-wal / -shm   ← SQLite write-ahead log (part of the database while running)
└── cache/
    ├── thumbnails/     ← <id>.jpg, 640px
    ├── previews/       ← <id>.mp4, short muted hover clips
    └── tmp/            ← in-progress FFmpeg output
```

Set `MOVA_DATA_DIR=/some/path` to keep data elsewhere (e.g. on the media server disk later).

## Cache

Thumbnails and previews are generated once and reused. Deleting `data/cache` (or using
Settings → Storage → Clear) is always safe; missing files are regenerated in the background
the next time they are needed. Previews can be generated for the whole library in the
background (default), only when hovering (*on demand*), or disabled.

## Backup

Back up **`data/app.db`** — that single file holds all user metadata. The cache never needs a backup.

For a consistent copy while Mova is running, use SQLite's online backup:

```bash
sqlite3 data/app.db ".backup 'mova-backup.db'"
```

or stop Mova and copy `data/app.db` (plus `app.db-wal` if present). To restore, put the file back
at `data/app.db` and start Mova; thumbnails are rebuilt automatically.

## Keyboard shortcuts

| Where | Keys |
| --- | --- |
| Anywhere | `/` or `Ctrl+K` search |
| Library | `Shift`/`Ctrl`+click multi-select · `Ctrl+A` select all · `Esc` clear selection |
| Player | `Space`/`K` play/pause · `←`/`→` ±5 s · `J`/`L` ±10 s · `↑`/`↓` volume · `M` mute · `F` fullscreen · `P` picture-in-picture · `N` next · `Shift+P` previous · `0–9` jump to 0–90 % · `,`/`.` speed · `Esc` exit fullscreen |

## Troubleshooting

**"FFmpeg is required for thumbnails and previews."** — Install FFmpeg (see above) and press
*Re-check* in Settings → System. Pending thumbnails start automatically.

**`better-sqlite3` fails to install / "Could not locate the bindings file".** — No prebuilt binary
for your Node version; install a compiler toolchain (`sudo pacman -S base-devel python`) and run
`pnpm rebuild better-sqlite3`. If you switched Node versions, run the rebuild as well.

**A video shows only audio or "Can't play this video".** — The browser can't decode the codec
(common for HEVC/x265 in Firefox or AVI/WMV). Use *Open in system player*. Mova does not transcode.

**New files don't appear.** — Press *Scan folder*. If Settings mentions watcher errors, raise the inotify
limit: `echo fs.inotify.max_user_watches=524288 | sudo tee /etc/sysctl.d/40-inotify.conf && sudo sysctl --system`.

**A source shows "Offline".** — Mount the disk, then *Scan folder*. Nothing is lost while offline.

**Port 3000 is busy.** — `pnpm dev --port 3001` (still bound to 127.0.0.1).

**"The library database is unavailable".** — Check that `data/` exists and is writable by your user.

**403 "Forbidden host".** — You opened Mova through a hostname other than `127.0.0.1`/`localhost`.

## Future server deployment

The architecture is ready for a home server (e.g. a box with a 5–10 TB disk) without changes to
the data model: sources are just paths, and all state is in `MOVA_DATA_DIR`.

When you get there:

1. Build and run on the server: `pnpm build && MOVA_DATA_DIR=/srv/mova pnpm exec next start --hostname 127.0.0.1`.
2. Put it behind a VPN (WireGuard/Tailscale) or a reverse proxy that adds authentication — **Mova has no
   login of its own** and must not be exposed directly.
3. Allow the hostname you use: `MOVA_ALLOWED_HOSTS=mova.home.lan`.
4. Run it as a systemd service; back up `/srv/mova/app.db`.

Multi-user accounts, remote access, transcoding and authentication are intentionally out of scope for now.
