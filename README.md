# dusk chat

a peer-to-peer community chat platform. no central server. your data stays yours.

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

## contributing

1. fork the repository and install dependencies as described above
2. create a feature branch (`git checkout -b feature/my-feature`)
3. make your changes with clear commit messages
4. ensure application is in a working state and all tests pass if applicable
5. submit a pull request with a detailed description of your changes and the problem they solve.

## license

see the main project license file.
