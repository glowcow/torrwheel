<p align="center"><img src="icon.svg" width="128" alt="torrwheel"></p>

# torrwheel

A fork of [Transmission](https://github.com/transmission/transmission) for a
home server: the daemon only, with one change in where a torrent's files are
kept while it downloads.

## Contents

- [What it is](#what-it-is)
- [What differs from Transmission](#what-differs-from-transmission)
  - [File placement](#file-placement)
  - [The tree](#the-tree)
- [Image](#image)
  - [Quick start](#quick-start)
  - [What the image holds](#what-the-image-holds)
- [Build](#build)
- [Versions](#versions)
- [Following upstream](#following-upstream)
- [License](#license)

## What it is

`transmission-daemon` 4.1.3 with its RPC, its settings and its web UI, built
from this branch. Towards peers and trackers it is Transmission 4.1.3: the
peer id and the user agent are untouched. Existing `settings.json`, resume
files and RPC clients keep working.

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
- when the torrent is done, only its complete files move to `download-dir`;
- files ticked later are downloaded in the incomplete directory and move when
  they are complete;
- a torrent with nothing complete moves nothing.

A file that is already in `download-dir` stays there, also when it is
unfinished: nothing is ever moved back. Moving a torrent, renaming a path in
it and removing it with its data act on both directories.

The change is in `libtransmission/torrent.cc` and `torrent-files.cc`; its
tests are `tests/libtransmission/torrwheel-test.cc`.

### The tree

Upstream carries every client. Here only the daemon is left: the macOS, Qt,
GTK and command-line clients, the translations, the release tooling and the
documentation except `docs/rpc-spec.md` are removed by
[`prune-upstream.sh`](prune-upstream.sh), which holds the list.

## Image

`glowcow/torrwheel` on Docker Hub, `linux/amd64`, Alpine.

### Quick start

```bash
docker run -d --name torrwheel \
  -p 9091:9091 -p 51413:51413 -p 51413:51413/udp \
  -v "$PWD/config:/etc/transmission-daemon" \
  -v "$PWD/downloads:/Downloads" \
  -v "$PWD/incomplete:/Incomplete" \
  glowcow/torrwheel:v4.1.3-1
```

The three directories must be writable by uid `100`. The first start writes a
default `settings.json`. Edit it only while the daemon is stopped — it
rewrites the file on exit: set `download-dir`, `incomplete-dir` and
`incomplete-dir-enabled`, and add your network to `rpc-whitelist` to reach
the web UI on port 9091.

### What the image holds

- `transmission-daemon`, started as
  `transmission-daemon -f --log-level=info -g /etc/transmission-daemon`;
- `transmission-remote`, `transmission-create`, `transmission-edit`,
  `transmission-show`;
- the web UI in `/usr/share/transmission/public_html`;
- the user `debian-transmission` (uid `100`, gid `101`) — the name and ids of
  Debian's package, so a config directory made for it is taken over as it is;
- a health check: a TCP probe of port 9091.

## Build

The submodules under `third-party/` are part of the build:

```bash
git submodule update --init --recursive --depth 1
docker build -t torrwheel:dev .
```

The build runs the whole test suite; a failing test fails the image. Build
arguments: `VERSION` (shown by the daemon as `4.1.3 (<VERSION>)`),
`BUILD_JOBS` (parallel compile and test jobs, every core by default) and
`ALPINE_VERSION`.

## Versions

A release is the upstream version plus the fork's own counter: `v4.1.3-1`,
`v4.1.3-2`, then `v4.1.4-1`. The image carries the same tag. Tags without the
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
sides are left to resolve by hand.

## License

Transmission's terms, unchanged: GNU GPL v2 or v3, see [`COPYING`](COPYING).
The fork's own changes are under the same terms.
