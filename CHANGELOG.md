# Changelog

All notable changes to the Monitor Role Change macro/panel are documented here.

## 1.10.0 — 2026-07-02
HDMI monitor-role `GroupButton` handler now logs the requested vs. confirmed `MonitorRole` value (reading it back via `getOutputRole` after `setOutputRole`), and catches/logs any error — matching the same confirm-and-log pattern already used for Selfview Fullscreen.

## 1.9.0 — 2026-07-02
Selfview Fullscreen applied correctly on-device but the toggle widget's displayed state didn't update. Fixed by:
- Calling `refreshSelfviewWidgets()` immediately after each `applySelfview()` call, instead of relying solely on the status subscription.
- Replacing the single parent-level `xapi.Status.Video.Selfview.on()` subscription with granular per-field subscriptions (`Mode`, `FullscreenMode`, `OnMonitorRole`) — the parent-level subscription did not reliably reflect `FullscreenMode` changes back into the widget.

## 1.8.0 — 2026-07-02
**Root cause of "Selfview Fullscreen not working" found:** `ToggleButton` widget actions fire with `Type: "changed"`, not `"released"`/`"clicked"`. The event filter had been silently dropping every ToggleButton tap (both the Selfview and Fullscreen toggles) since 1.0.0. Added `'changed'` to the allowed `Type` list.

## 1.7.0 — 2026-07-02
Added an unconditional diagnostic `console.log` at the top of the Widget Action handler (`WidgetId`/`Type`/`Value`) to determine why Fullscreen produced no console output at all — a symptom that pointed at the event never reaching the handler, not the command failing silently.

## 1.6.0 — 2026-07-02
Sending partial `Selfview.Set` commands (just `Mode`, or `Mode` then a separate `FullscreenMode` call) did not reliably apply on-device. Added `getCurrentSelfviewState()` / `applySelfview()` so every `Selfview.Set` call sends all four parameters together — `Mode`, `FullscreenMode`, `OnMonitorRole`, `PIPPosition` — merging the requested change onto current state.

## 1.5.0 — 2026-07-02
`FullscreenMode` (both the widget's own event value and `xStatus`) can report `Current`/`current` in addition to `On`/`Off`. Added `isFullscreenOn()` to treat `Current` as on, used consistently wherever the value is read or compared.

## 1.4.0 — 2026-07-02
Removed the `Recorder` monitor role option per request. Note: if a connector's actual current role is `Recorder`, its `GroupButton` will show no selection until a different role is picked, since the macro skips `SetValue` for roles outside the panel's `ValueSpace`.

## 1.3.0 — 2026-07-02
Selfview on/off and Fullscreen handlers now use the `ToggleButton` event's own `Value` instead of reading `xStatus` and inverting it (a stale read there could silently no-op). Renamed the "Fullscreen"/"Display Mode" widget and row to "Selfview Fullscreen" for clarity.

## 1.2.0 — 2026-07-02
Added `Recorder` as a 5th `MonitorRole` option — RoomOS throws `"GroupButton value outside of valuespace"` if a connector's actual role isn't listed, and `Recorder` is a valid (non-viewable) role distinct from `First`/`Second`/`Third`/`PresentationOnly`.

## 1.1.0 — 2026-07-02
Switched the monitor-role widgets from `Button` to `GroupButton`. Plain `Button` widgets reject `SetValue` with arbitrary text (`"Invalid Button value: '<text>'"`) — only widget types with a defined `ValueSpace` accept `SetValue`.

## 1.0.0 — 2026-07-02
Initial version: In-Room Control panel + macro for setting HDMI output monitor roles and controlling Selfview (on/off, target monitor, fullscreen).
