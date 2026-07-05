# Roadmap

`agnostic-web-ble` is a small library. The roadmap is a small document. This
file exists to name the things I want to build next, and — just as importantly
— the things I have deliberately decided not to build.

The current line: the shipped library covers native Web Bluetooth (Chromium)
and a mock adapter. Everything past that is proposed, not scheduled.

## 0.2 — the honest agnostic release

Landed alongside this file. Additive, no breaking changes.

- **`describeAvailability()` on the client and adapters** — inspect why every
  configured adapter is unavailable without triggering a user gesture. Renders
  an honest "not supported here" state in one call.
- **Documented capability matrix** — [`docs/compatibility`](docs/compatibility.mdx)
  states plainly what works on which browser, why Firefox and Safari are
  excluded, and how the bridge pattern extends reach if you need it.
- **The BluetoothAdapter contract as public API** — [`docs/custom-adapters`](docs/custom-adapters.mdx)
  documents the interface, the error taxonomy, and two worked examples
  (filesystem-backed simulation, WebSocket bridge).
- **Cross-browser Playwright matrix** — mock adapter contract runs identically
  in Chromium, Firefox, and WebKit. Chromium-native runs against a fake
  peripheral via CDP `BluetoothEmulation`. Firefox and WebKit assert that the
  library surfaces `UNAVAILABLE` correctly.

## 0.3 — proposed

**Official WebSocket-bridge helper.** Turn the [`docs/custom-adapters`](docs/custom-adapters.mdx)
sketch into a shipped `@0xsarwagya/agnostic-web-ble-bridge` package plus a
matching `webSocketBridgeAdapter()` in this repo. What it unblocks: real BLE
in Firefox, in desktop Safari, in restricted-context Chromium.

Not scheduled yet because these three questions need answers first:

1. **Native module toolchain.** `@stoprocent/noble` (the actively maintained
   fork) requires `node-gyp` + a C toolchain. That torpedoes any "just run
   `npx`" pitch on a fresh machine. Options: prebuilt binaries via
   `prebuild-install` in a CI matrix (macOS, Linux, Windows × 2 arches ×
   2 Node versions), or a Rust rewrite with `btleplug` shipping a single
   static binary. Rust is the better UX and the bigger lift.
2. **Token distribution.** The sketch calls for a per-launch token
   copy-pasted from the terminal into a one-time prompt in the calling app,
   with a 1-second handshake window, 128-bit entropy, and a 3-attempt
   lockout. Firefox has no Private Network Access, so origin allowlist +
   token are the only real barriers. This works, but needs UX polish before
   shipping — a rough demo would train users into unsafe habits.
3. **Publishing cadence.** Bridge lives in the same repo (initial ship) or
   its own (`agnostic-web-ble-bridge`)? Same versioning or independent?
   One-repo is simpler now; separate makes semver honest later. Undecided.

## 0.4 — proposed

**iOS Safari via specialty browsers.** Two options, either is small:

- **Bluefy** — a specialty iOS browser (App Store) that polyfills
  `navigator.bluetooth`. Users open the URL in Bluefy; the shipped `native`
  adapter works unchanged. Scope: UA detection in the demo that renders
  "Open in Bluefy →" when it detects `safari-ios` + no `navigator.bluetooth`.
- **iOSWebBLE (Beacio)** — a Safari Web Extension that polyfills
  `navigator.bluetooth` inside real Safari via `SafariWebExtensionHandler` →
  CoreBluetooth. More friction to install, but keeps users in Safari.

Both are complementary to the 0.3 bridge, not a replacement for it. Neither
helps Firefox or desktop Safari.

## 0.5 — proposed

**Binary transport for the bridge.** JSON + base64 for values is fine for
correctness and ~33% overhead. High-throughput characteristics (IMU
notifications at 1 kHz, streaming audio prototypes) will want a binary
WebSocket frame path. Wire protocol reserves the option; implementation
is future work.

**Cancel + back-pressure semantics.** The bridge sketch documents
`AbortSignal` handling client-side and notes cancel frames are
production-only. 0.5 nails both wire directions: `{ op: "cancel", id: … }`
and drop-policy on unbounded notification queues.

## What I have decided not to build

- **A native shell.** Tauri, Electron, Capacitor. If you need one, you know;
  the library is happy to live inside one, but shipping our own turns
  `agnostic-web-ble` from a library into a runtime and doubles the
  maintenance surface. Out of scope.
- **A Chromium-fork browser.** Same reasoning, more so.
- **A Web Bluetooth polyfill for Firefox/Safari over sibling APIs.** WebUSB,
  WebHID, and WebSerial are also Chromium-only. There is no sibling API to
  polyfill on top of in the browsers that need the polyfill. This is a
  physical constraint, not a design choice; see
  [`docs/compatibility`](docs/compatibility.mdx) for citations.
- **A hosted bridge.** A cloud-relayed BLE bridge is worse than useless — it
  puts a stranger between your browser tab and your device's radio. If you
  want a bridge, it runs on your machine, bound to loopback, or it does not
  run at all.

## How to nudge this

Small library, small process:

- Open an [issue](https://github.com/0xsarwagya/agnostic-web-ble/issues) if
  you have a real use case blocked by something above. Say what you're
  trying to build and which browser it has to work in.
- If you write a custom adapter — a bridge, a simulator, a specific-chipset
  driver — open an issue linking to it and I'll list it in the README so
  others can find it.
- PRs for docs, tests, and adapters are welcome. PRs that change the public
  contract need a design issue first.
