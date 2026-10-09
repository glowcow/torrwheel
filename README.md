<p align="center"><img src="icon.svg" width="128" alt="torrwheel"></p>

# torrwheel

A fork of [Transmission](https://github.com/transmission/transmission) for a
home server: the daemon and a web UI of its own. The daemon differs in where
a torrent's files are kept while it downloads, in moving finished files to
another disk without freezing, and in a fix for downloads that stall after a
file pick.

## Contents

- [What it is](#what-it-is)
- [What differs from Transmission](#what-differs-from-transmission)
  - [File placement](#file-placement)
  - [Moving in the background](#moving-in-the-background)
  - [Downloading after a file pick](#downloading-after-a-file-pick)
  - [Web UI](#web-ui)
  - [URLs](#urls)
  - [Download directories](#download-directories)
  - [Peer countries](#peer-countries)
  - [The tree](#the-tree)
- [Image](#image)
  - [Quick start](#quick-start)
  - [What the image holds](#what-the-image-holds)
- [Build](#build)
  - [Web UI development](#web-ui-development)
- [Versions](#versions)
- [Following upstream](#following-upstream)
- [License](#license)

## What it is

`transmission-daemon` 4.1.3 with its RPC and its settings, built from this
branch, and a web UI written for it. Towards peers and trackers it is
Transmission 4.1.3: the peer id and the user agent are untouched. Existing
`settings.json` and resume files keep working; an RPC client needs the new
[URL](#urls).

`main` is upstream's branch and is never committed to; everything of the fork
is on `torrwheel`, so `main...torrwheel` is the whole difference.

## What differs from Transmission

### File placement

With `incomplete-dir` enabled, Transmission downloads into the incomplete
directory and moves the torrent to `download-dir` once it is done. "Done"
counts wanted files only, so a torrent with some files unticked is done as
soon as the ticked ones are — and a torrent with every file unticked is done
at once. From then on it lives in `download-dir`, and files ticked later are
downloaded straight into it. On a setup where the incomplete directory is the
fast disk and `download-dir` is the slow one, that puts random writes exactly
where they were to be avoided.

torrwheel keeps the rule per file:

- a file stays in the incomplete directory until it is complete;
- when the torrent is done, only its complete files move to `download-dir`
  ([in the background](#moving-in-the-background));
- files ticked later are downloaded in the incomplete directory and move when
  they are complete;
- a torrent with nothing complete moves nothing.

A file that is already in `download-dir` stays there, also when it is
unfinished: nothing is ever moved back. Moving a torrent, renaming a path in
it and removing it with its data act on both directories.

The change is in `libtransmission/torrent.cc` and `torrent-files.cc`; its
tests are `tests/libtransmission/torrwheel-test.cc`.

### Moving in the background

When the incomplete directory and `download-dir` are on different
filesystems, moving a finished file is a full copy. Transmission makes that
copy in the thread that runs everything else: until it ends, no torrent
downloads or seeds and the RPC does not answer.

torrwheel copies in a thread of its own, one file at a time for the whole
daemon:

- the file is copied to its new place under a temporary name ending in
  `.tw-move`, while the torrent goes on reading — and seeding — it from the
  old place;
- once the copy is whole and flushed to disk it takes its real name and the
  old file is removed, which is a moment's work;
- `torrent_get` reports the move as `move_bytes_done` and `move_bytes_total`,
  both zero when nothing is being copied. The torrent's `status` does not
  change.

Within one filesystem a move is still a rename and takes no time.

What happens in the middle of a copy:

| Event | Result |
| --- | --- |
| The torrent is paused | the copy goes on; it does not depend on peers |
| The torrent is removed | the copy stops and its temporary file is deleted first |
| The file selection changes | nothing: only finished files are moved |
| A check is asked for | it starts when the move is over |
| A path in the torrent is renamed | refused until the move is over |
| The daemon stops | the copy stops, its temporary file is deleted, the source is intact; the move starts again with the daemon |
| The daemon is killed | a `.tw-move` file is left behind and overwritten when the move starts again |
| The disk is full, or another error | the temporary file is deleted and the torrent stops with the error |

Moving a torrent by hand (`torrent_set_location` with `move`) uses the same
thread. A torrent that is still downloading is stopped for the time of the
copy and started again after it. When the new place is neither `download-dir`
nor the incomplete directory, every file is copied first and they all change
place together at the end, so the torrent never has files in a directory it
does not look in.

The copy is in `libtransmission/torrwheel-mover.cc`, the torrent's side in
`torrent.cc`; the tests are in `tests/libtransmission/torrwheel-test.cc`.
`TORRWHEEL_MOVE_THROTTLE`, bytes per second, slows the copies down — for a
test stand, not for use.

### Downloading after a file pick

Transmission 4.1.3 drops its list of pieces to request when a torrent becomes
done and builds it again only when the torrent is started. A running torrent
that turns from done back to downloading — every file unticked and some
ticked again, or more files picked on a finished partial torrent — stays
connected to its peers and requests nothing until it is stopped and started.

torrwheel builds the list on the next request, as Transmission did before
4.1. The change is in `libtransmission/peer-mgr.cc`.

### Web UI

Transmission's web client is replaced by a single page in `web/` — React,
TypeScript, Vite, Tailwind — that talks to the daemon over the same RPC:

- the list of torrents with a name filter, a status filter and a sort, each
  row with its state, share done, size, both rates and buttons to pause or
  resume and to remove;
- the daemon's totals above the list: download and upload rate, bytes left,
  counts by state, free space in the download directory;
- a torrent's details: its numbers, its location and hash, pause, verify,
  remove with or without the data, and its files as a tree where a tick picks
  a file or a folder;
- adding by magnet link, URL or `.torrent` file, with the directory to
  download to;
- a light and a dark theme, two colour schemes, English and Russian.

Daemon settings are not edited in the page; they stay in `settings.json`.

### URLs

The web UI is served from `/` and the RPC from `/rpc` — Transmission has
them at `/transmission/web/` and `/transmission/rpc`. `rpc-url` in
`settings.json` still moves both: with `"rpc-url": "/transmission/"` the page
is at `/transmission/` and the RPC at `/transmission/rpc`, where Transmission's
clients expect it. A `settings.json` that names `rpc-url` keeps its value.

The page is sent with a content security policy that allows only its own
origin, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`;
files under `assets/` are cached for a year, the page itself is revalidated.

### Download directories

`download_dirs` in `settings.json` is a list of directories a client may
offer when a torrent is added:

```json
"download_dirs": ["/Downloads", "/Dumps"]
```

The daemon only hands the list out — `session_get` returns it as
`download_dirs`, and `session_set` does not change it. The web UI puts these
directories first in the add dialog's list, each with the free space the
daemon reports there; any other path can still be typed.

### Peer countries

When the daemon finds a country database, every peer in `torrent_get`'s
`peers` whose address the database knows carries `country`, a two-letter ISO
code; the web UI draws its flag. The database is an MMDB file read with
libmaxminddb, looked for at `/usr/share/transmission/country.mmdb` or where
`TORRWHEEL_COUNTRY_DB` points. Without the file, or in a build without
libmaxminddb, the field is simply absent.

The image ships DB-IP's monthly "IP to Country Lite" database — see
[License](#license).

### The tree

Upstream carries every client. Here only the daemon is left: the macOS, Qt,
GTK and command-line clients, upstream's web client, the translations, the
release tooling and the documentation except `docs/rpc-spec.md` are removed
by [`prune-upstream.sh`](prune-upstream.sh), which holds the list.

## Image

`glowcow/torrwheel` on Docker Hub, `linux/amd64`, Alpine.

### Quick start

```bash
docker run -d --name torrwheel \
  -p 9091:9091 -p 51413:51413 -p 51413:51413/udp \
  -v "$PWD/config:/etc/transmission-daemon" \
  -v "$PWD/downloads:/Downloads" \
  -v "$PWD/incomplete:/Incomplete" \
  glowcow/torrwheel:v4.1.3-3
```

The three directories must be writable by uid `100`. The first start writes a
default `settings.json`. Edit it only while the daemon is stopped — it
rewrites the file on exit: set `download-dir`, `incomplete-dir` and
`incomplete-dir-enabled`, and add your network to `rpc-whitelist` to reach
the web UI at `http://<host>:9091/`.

### What the image holds

- `transmission-daemon`, started as
  `transmission-daemon -f --log-level=info -g /etc/transmission-daemon`;
- `transmission-remote`, `transmission-create`, `transmission-edit`,
  `transmission-show`;
- the built web UI in `/usr/share/transmission/public_html`;
- the country database in `/usr/share/transmission/country.mmdb`;
- the user `torrwheel` (uid `100`, gid `101`) — the ids of Debian's
  `transmission-daemon` package, so a config directory made for it is taken
  over as it is;
- a health check: a TCP probe of port 9091.

## Build

The submodules under `third-party/` are part of the build:

```bash
git submodule update --init --recursive --depth 1
docker build -t torrwheel:dev .
```

The test suite is a stage of its own, built on the same compiled tree:

```bash
docker build --target test -t torrwheel:test .
```

Build arguments: `VERSION` (shown by the daemon as `4.1.3 (<VERSION>)` and in
the page's footer), `COMMIT` and `BUILD_DATE` (the footer), `BUILD_JOBS`
(parallel compile and test jobs, every core by default), `ALPINE_VERSION`,
`NODE_VERSION` and `DBIP_VERSION` (the month of the country database, moved
by hand with a release). The web UI is built in a stage of its own and copied into the
image; cmake does not touch it.

### Web UI development

Vite serves the page and passes `/rpc` on to a running daemon:

```bash
docker run --rm -it -p 5173:5173 -v "$PWD/web":/app -w /app \
  -e VITE_API_HOST=http://host.docker.internal:9091 \
  node:26.10.0-alpine sh -c "npm ci && npm run dev"
```

That daemon needs `"rpc-url": "/"` and the container's address in its
`rpc-whitelist`. `npx tsc -b` and `npx eslint .` in the same container are
what the pipeline checks.

## Versions

A release is the upstream version plus the fork's own counter: `v4.1.3-1`,
`v4.1.3-2`, `v4.1.3-3`, then `v4.1.4-1`. The image carries the same tag. Tags without the
`v` are upstream's.

## Following upstream

A new release of the same line is merged, then pruned again:

```bash
git fetch upstream --tags
git merge 4.1.4
./prune-upstream.sh
```

Files upstream changed under a removed path come up as conflicts, and the
script settles them by removing the paths again. Only files changed on both
sides are left to resolve by hand — among them `web/package.json`,
`web/package-lock.json` and `web/eslint.config.js`, where the fork's version
is the one to keep.

## License

Transmission's terms, unchanged: GNU GPL v2 or v3, see [`COPYING`](COPYING).
The fork's own changes are under the same terms.

The image includes the "IP to Country Lite" database by
[DB-IP](https://db-ip.com), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The flags in the
web UI are from [flag-icons](https://github.com/lipis/flag-icons), MIT.
