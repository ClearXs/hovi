# (D) - UI Agent Desktop Packaging - Tauri Gateway Desktop Design

## Background

`ui-agent` already includes an initial Tauri shell under `ui-agent/src-tauri/`, but the app still behaves like a web-first Next.js project. It does not yet meet the desktop requirement that a user can install one application, launch it, automatically start the bundled gateway, and immediately use the `ui-agent` interface.

This design chooses the approved direction:

- `Tauri + gateway sidecar + static ui-agent`
- no user-installed Node, pnpm, or `openclaw` requirement
- desktop app starts the bundled gateway automatically
- the UI loads only after the gateway is healthy
- the frontend connects directly to the local gateway over HTTP and WebSocket

## Goals

- Ship a desktop application that is self-contained for macOS, Windows, and Linux.
- Start a bundled local gateway automatically when the desktop app launches.
- Load the `ui-agent` UI only after the gateway is ready.
- Keep core business logic in the gateway instead of duplicating it in Tauri.
- Convert `ui-agent` into a static frontend client suitable for Tauri packaging.

## Non-Goals

- Keeping Next.js server runtime as the long-term desktop architecture.
- Shipping auto-update, tray mode, or login-item startup in the first delivery.
- Replacing gateway business APIs with Tauri-native Rust implementations.
- Covering mobile platforms in this work.

## Current Constraints

The current codebase has several constraints that shape the design:

- `ui-agent/next.config.js` relies on `rewrites()` for `/api/*` and `/files/*` proxying.
- `ui-agent/src/app/api/mcpso/search/route.ts`
- `ui-agent/src/app/api/mcpso/detail/route.ts`
- `ui-agent/src/app/api/mcpso/import/route.ts`

These route handlers depend on Next server runtime and cannot remain in the final desktop packaging model.

- `ui-agent/src/app/personas/[id]/page.tsx`
- `ui-agent/src/app/scenes/[id]/page.tsx`

These are dynamic routes and must be adjusted for static export compatibility.

- `ui-agent/src-tauri/tauri.conf.json` currently points `frontendDist` at `../dist`, which does not match the intended static export output.
- `ui-agent/package.json` exposes Tauri scripts, but the desktop build chain is not yet complete.
- `ui-agent` production build currently fails before packaging due to an existing TypeScript error in `ui-agent/src/app/page.tsx`.

## Architecture Summary

The desktop application will have four layers:

1. Tauri host layer
   - owns windows, app lifecycle, sidecar lifecycle, logging bridges, and desktop-specific commands
2. Gateway sidecar layer
   - runs the bundled `openclaw gateway`
   - serves HTTP APIs and WebSocket streams over loopback only
3. Static frontend layer
   - serves the built `ui-agent` assets from Tauri WebView
   - talks directly to the local gateway
4. Tauri bridge layer
   - provides a minimal command surface for capabilities that currently depend on Next Route Handlers or local system integration

The boundary rule is strict:

- gateway keeps business logic
- Tauri manages process lifecycle and a small set of host-only actions
- `ui-agent` becomes a pure client application

## Startup Flow

Desktop startup behavior will follow this sequence:

1. User launches the desktop app.
2. Tauri enters application setup.
3. Tauri checks whether a managed gateway instance is already running on the configured loopback port.
4. If no managed instance exists, Tauri starts the bundled gateway sidecar.
5. Tauri polls the local health endpoint until the gateway is ready or startup times out.
6. After the gateway is healthy, Tauri creates the main window and loads the static `ui-agent` app.
7. The frontend initializes:
   - HTTP base URL: `http://127.0.0.1:18789`
   - WebSocket base URL: `ws://127.0.0.1:18789`
8. If startup fails, the app shows a startup failure screen instead of a broken main window.

## Startup Failure Screen

The startup failure screen must provide:

- a short error summary
- a retry action
- recent gateway logs
- a copy-diagnostics action
- an open-log-directory action

This avoids leaving the user with a blank or partially loaded UI when the local service failed to start.

## Process Model

The first release uses a two-process model only:

- Tauri desktop host
- bundled gateway sidecar

There will be no separate bundled Next.js UI server.

This is intentional:

- fewer processes to manage
- lower startup complexity
- smaller surface area for cross-platform failures
- clearer ownership of business logic

Default lifecycle policy:

- app launch starts the gateway
- app exit stops the gateway

Future enhancements like tray mode can relax that policy later, but they are not part of this design.

## Gateway Sidecar

The desktop package must include a runnable gateway artifact that Tauri can launch as a sidecar.

Target launch shape:

```bash
openclaw gateway run --bind loopback --port 18789 --force
```

The bundled sidecar must satisfy these conditions:

- no dependency on a globally installed `openclaw`
- no dependency on a globally installed Node runtime
- stable stdout and stderr capture for logging
- loopback-only network binding
- explicit crash detection from Tauri

### Packaging Options

Preferred option:

- produce a platform-specific gateway distributable
- package it via Tauri `externalBin`

Fallback option:

- bundle Node runtime + built gateway output + startup wrapper
- launch the wrapper as the Tauri sidecar

The preferred option is cleaner and should be the long-term target. The fallback is acceptable as an implementation bridge if needed.

## Frontend Deployment Model

`ui-agent` will move from a server-assisted Next deployment model to a static frontend model.

Final runtime behavior:

- Tauri loads the built frontend assets directly
- the frontend calls the local gateway explicitly
- the frontend no longer depends on Next `rewrites`
- the frontend no longer depends on Next Route Handlers

This change is required to make the desktop package reliable and aligned with Tauri's static frontend workflow.

## UI Agent Refactor Scope

### 1. Remove Next rewrites

The current rewrite configuration in `ui-agent/next.config.js` must be removed.

All API consumers that currently depend on:

- `/api/...`
- `/files/...`

must instead resolve through an explicit gateway base URL abstraction.

### 2. Replace Route Handlers

These files currently depend on Next server runtime and must be replaced:

- `ui-agent/src/app/api/mcpso/search/route.ts`
- `ui-agent/src/app/api/mcpso/detail/route.ts`
- `ui-agent/src/app/api/mcpso/import/route.ts`

Recommended replacement:

- move these operations into Tauri commands

Reason:

- they act as local proxy/adapter logic
- they are not gateway core business APIs
- they fit the host bridge layer better than the static frontend

### 3. Adjust Dynamic Routes

These pages currently use dynamic route segments:

- `ui-agent/src/app/personas/[id]/page.tsx`
- `ui-agent/src/app/scenes/[id]/page.tsx`

Recommended adjustment:

- replace path-param routes with query-based pages
- for example:
  - `/personas?id=<id>`
  - `/scenes?id=<id>`

This keeps the frontend compatible with static export while preserving the same data model.

### 4. Unify Base URL Handling

The following areas need a shared configuration path for desktop mode:

- `ui-agent/src/lib/api.ts`
- `ui-agent/src/stores/connectionStore.ts`
- any direct `fetch("/api/...")` call sites
- any direct `window.location.origin` assumptions that imply a co-hosted server

The frontend must distinguish between:

- browser/web mode
- Tauri desktop mode

Desktop mode should prefer host-provided gateway configuration instead of web rewrite assumptions.

## Tauri Command Surface

The Tauri bridge layer should stay intentionally small.

### App Lifecycle Commands

- `app_start_gateway`
- `app_stop_gateway`
- `app_gateway_status`
- `app_read_logs`
- `app_reveal_log_dir`
- `app_copy_diagnostics`

### MCP SO Adapter Commands

- `mcpso_search`
- `mcpso_detail`
- `mcpso_import`

These commands replace the current Next Route Handler bridge behavior. They should not expand into general business API duplication.

## Configuration Model

Configuration should be split into two ownership domains.

### Desktop App Configuration

Managed by Tauri. Examples:

- window size and position
- whether gateway auto-start is enabled
- desktop UI preferences
- startup diagnostics state

### Gateway Runtime Configuration

Managed by gateway. Examples:

- sessions
- knowledge data
- credentials
- logs
- connector settings

The desktop app should expose diagnostic entry points, but it should not own or redefine gateway internal config semantics.

## Data and Log Locations

The design assumes platform-standard user directories.

Requirements:

- no hardcoded machine-specific paths in code or docs
- clear separation between desktop app data and gateway data
- a user-visible way to open logs and diagnostics

The UI should expose:

- open log directory
- copy diagnostics
- view recent startup errors

## Error Handling

The first delivery must explicitly handle these cases:

### Gateway Spawn Failure

- show startup failure screen
- keep the main app responsive
- provide retry and diagnostics

### Health Check Timeout

- show a startup timeout error
- include recent log output
- allow manual retry

### Gateway Crash After Startup

- notify the frontend that the local service is unavailable
- show reconnect and restart options
- avoid silent broken UI state

### Port Conflict

- if the configured port is already in use, detect whether it is the expected managed instance
- if it is not the expected instance, fail clearly
- do not silently switch ports in the first release

## Security Requirements

- gateway must bind only to loopback
- desktop frontend must default to localhost communication only
- Tauri permissions remain minimal
- local file access must not be broadly exposed to the frontend
- all host-privileged behavior must go through explicit Tauri commands
- external links should continue using the opener plugin rather than unrestricted browser behavior

## Logging and Diagnostics

At minimum, the app should capture:

- Tauri host logs
- gateway sidecar stdout and stderr
- frontend startup errors

The user-facing diagnostics feature should include:

- app version
- gateway version
- platform and architecture
- health check result
- last sidecar spawn error
- current configured port

## Build and Packaging Flow

The intended build pipeline is:

1. build the gateway distributable
2. build the static `ui-agent` frontend
3. package both into the Tauri desktop app

Target Tauri configuration shape:

- `frontendDist` points at the static export output, such as `../out`
- `bundle.externalBin` points at the packaged gateway sidecar

Expected packaging targets:

- macOS: `.app`, `.dmg`
- Windows: `.msi` or `.exe`
- Linux: `AppImage`, `.deb`

## Implementation Phases

### Phase 1: Restore Build Health

- fix existing `ui-agent` production build failures
- complete the local Tauri build toolchain
- make `ui-agent` produce a successful production build

### Phase 2: Static Frontend Conversion

- remove Next rewrites
- replace Route Handlers
- resolve dynamic route export issues
- centralize gateway base URL handling

### Phase 3: Sidecar Integration

- start gateway from Tauri
- add health checks
- bridge logs and diagnostics
- add startup failure screen

### Phase 4: Cross-Platform Packaging

- validate macOS packaging on real hardware
- validate Windows packaging on real hardware
- validate Linux packaging on real hardware

### Phase 5: Enhancements

- tray mode
- login-item startup
- auto-update
- improved crash recovery

## Acceptance Criteria

The design is considered successfully implemented when:

- the desktop app installs without requiring extra user runtime dependencies
- launching the app automatically starts the bundled gateway
- the UI becomes usable within 30 seconds on a normal machine
- the frontend can communicate with the local gateway over HTTP and WebSocket
- gateway failure states are visible and recoverable from the UI
- core user workflows remain functional:
  - sessions
  - chat
  - knowledge features
  - connectors
  - streaming updates
- macOS, Windows, and Linux each have at least one successful real-machine validation run

## Key Risks

The primary risk is not Tauri itself. The main risk is the current `ui-agent` dependency on Next server runtime behavior.

Secondary risks:

- unclear gateway distributable strategy for sidecar packaging
- remaining browser-only assumptions in OAuth or file-preview flows
- environment-specific startup behavior differences across operating systems

## Decision Summary

This design makes one core decision:

`ui-agent` desktop will be a static frontend client hosted by Tauri, and the desktop application will automatically start a bundled gateway sidecar before loading the UI.

That decision keeps business logic inside gateway, keeps Tauri focused on host responsibilities, and provides the cleanest path to a cross-platform desktop package that is installable and usable without extra operator setup.
