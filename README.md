<div align="center">
  <img src="src-tauri/icons/128x128.png" alt="dusk chat" width="100" />

  <h1>dusk chat</h1>
  <p>a peer-to-peer community chat platform. no central server. your data stays yours.</p>

  <p>
    <img alt="version" src="https://img.shields.io/badge/version-0.1.0-FF4F00?style=flat-square&labelColor=000000" />
    <img alt="license" src="https://img.shields.io/badge/license-MIT-FF4F00?style=flat-square&labelColor=000000" />
    <img alt="rust" src="https://img.shields.io/badge/rust-stable-FF4F00?style=flat-square&logo=rust&logoColor=white&labelColor=000000" />
    <img alt="tauri" src="https://img.shields.io/badge/tauri-v2-FF4F00?style=flat-square&logo=tauri&logoColor=white&labelColor=000000" />
    <img alt="solid-js" src="https://img.shields.io/badge/solid--js-1.9-FF4F00?style=flat-square&logo=solid&logoColor=white&labelColor=000000" />
    <img alt="p2p" src="https://img.shields.io/badge/libp2p-peer--to--peer-FF4F00?style=flat-square&logo=libp2p&logoColor=white&labelColor=000000" />
  </p>
</div>

---

## what is dusk chat

dusk chat is a decentralized alternative to discord. every user runs a full node and client in a single desktop app with peer discovery through a custom relay server. messages sync between peers using CRDTs (conflict-free replicated data types), so there's no single point of failure and no server that can read your messages.

## key features

- **serverless**: no central database or message storage. every peer stores their own data
- **privacy-first**: end-to-end encrypted by design. the relay only forwards encrypted bytes
- **offline-first**: continue chatting while offline. messages sync when you reconnect
- **crdt-powered**: automatic conflict resolution using automerge. no message loss
- **lan discovery**: automatic peer discovery on local networks via mDNS
- **wan connectivity**: connect to peers anywhere via relay server and rendezvous protocol
- **invite codes**: share communities without exposing IP addresses

## getting started

### prerequisites

- **bun**: package manager for frontend (https://bun.sh)
- **rust**: for backend and relay server (https://rustup.rs)
- **node**: for tauri cli (comes with bun)

### system dependencies

dusk chat is built on tauri v2, which requires platform-specific system libraries. install the dependencies for your OS before building.

#### linux

<details>
<summary>debian / ubuntu</summary>

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

</details>

<details>
<summary>arch / manjaro</summary>

```bash
sudo pacman -Syu
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  libappindicator-gtk3 \
  librsvg \
  xdotool
```

</details>

<details>
<summary>fedora</summary>

```bash
sudo dnf check-update
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  libxdo-devel
sudo dnf group install "c-development"
```

</details>

<details>
<summary>gentoo</summary>

```bash
sudo emerge --ask \
  net-libs/webkit-gtk:4.1 \
  dev-libs/libappindicator \
  net-misc/curl \
  net-misc/wget \
  sys-apps/file
```

</details>

<details>
<summary>opensuse</summary>

```bash
sudo zypper up
sudo zypper in webkit2gtk3-devel \
  libopenssl-devel \
  curl \
  wget \
  file \
  libappindicator3-1 \
  librsvg-devel
sudo zypper in -t pattern devel_basis
```

</details>

<details>
<summary>alpine</summary>

```bash
sudo apk add \
  build-base \
  webkit2gtk-4.1-dev \
  curl \
  wget \
  file \
  openssl \
  libayatana-appindicator-dev \
  librsvg
```

note: alpine containers don't include fonts by default. install at least one font package (e.g. `font-dejavu`) for text to render correctly.

</details>

<details>
<summary>ostree (silverblue / kinoite)</summary>

```bash
sudo rpm-ostree install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  libxdo-devel \
  gcc \
  gcc-c++ \
  make
sudo systemctl reboot
```

</details>

<details>
<summary>nixos</summary>

see the [nixos wiki page for tauri](https://wiki.nixos.org/wiki/Tauri).

</details>

#### macos

install [xcode](https://developer.apple.com/xcode/resources/) from the mac app store or the apple developer website. launch it once after installing so it finishes setup.

#### windows

1. install [microsoft c++ build tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and check "desktop development with c++" during setup
2. webview2 is pre-installed on windows 10 (1803+) and windows 11. if you're on an older version, install the [webview2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
3. install rust via [rustup](https://rustup.rs) or `winget install --id Rustlang.Rustup` -- make sure the MSVC toolchain is selected as default

### installation

1. clone the repository

```bash
git clone https://git.clxud.dev/duskchat/app dusk-chat
cd dusk-chat
```

2. install frontend dependencies

```bash
bun install
```

3. (optional) clone and run the relay server locally

```bash
git clone https://git.clxud.dev/duskchat/relay relay-server
cd relay-server
cargo run
```

### running the app

#### development mode (full app)

```bash
bun run tauri dev
```

this compiles the rust backend and starts the vite dev server on port 1420.

#### frontend only (no tauri shell)

```bash
bun run dev
```

this will run the vite dev server without the tauri backend. useful for faster iteration on UI components with mock data.

### wan connectivity setup

dusk chat comes with a built-in relay server (relay.duskchat.app) that serves as the primary relay for peer discovery. you can also run your own locally or deploy it to a cloud provider.

to add your own:

```env
DUSK_RELAY_ADDR=/ip4/<relay-ip>/tcp/<port>/p2p/<relay-peer-id>
```

## development commands

```bash
# install frontend dependencies
bun install

# run full app (rust + vite)
bun run tauri dev

# run frontend only (demo data)
bun run dev

# build for production
bun run tauri build

# run relay server
cd relay-server && cargo run

# run relay server with custom port
DUSK_RELAY_PORT=4002 cargo run
```

## desktop packaging (windows / macos / linux)

run packaging commands from the `app/` directory.

```bash
# all bundles supported by your current OS
bun run package

# linux bundles
bun run package:linux

# macOS bundles
bun run package:macos

# windows bundles
bun run package:windows
```

expected bundle outputs are written to:

```text
app/src-tauri/target/release/bundle/
```

common artifact types by platform:

- linux: `appimage`, `deb`, `rpm`
- macos: `.app`, `.dmg`
- windows: `nsis` installer, `msi`

### ci packaging workflow

cross-platform packaging is automated in:

```text
app/.github/workflows/desktop-packaging.yml
```

workflow behavior:

- runs a matrix build on `ubuntu-22.04`, `macos-latest`, and `windows-latest`
- installs bun + rust, then runs platform-specific packaging scripts from `app/package.json`
- uploads generated bundles from `app/src-tauri/target/release/bundle/**` as artifacts:
  - `dusk-linux-bundles`
  - `dusk-macos-bundles`
  - `dusk-windows-bundles`

the workflow triggers on manual dispatch, version tags (`v*`), and pull requests that touch the app or packaging workflow.

## contributing

1. fork the repository and install dependencies as described above
2. create a feature branch (`git checkout -b feature/my-feature`)
3. make your changes with clear commit messages
4. ensure application is in a working state and all tests pass if applicable
5. submit a pull request with a detailed description of your changes and the problem they solve.

## license

see the main project license file.
