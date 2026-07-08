# Monitor Role Change

Cisco RoomOS In-Room Control panel + macro for setting HDMI output monitor roles and controlling Selfview, directly from a touch panel button on the device.

## What it does

- **Monitor Roles** — one row per HDMI output (HDMI 1/2/3). Tapping a role in each `GroupButton` sets that output's `MonitorRole` (`First` / `Second` / `Third` / `PresentationOnly`) via `xConfiguration Video Output Connector [n] MonitorRole`. Each change also recomputes and applies the device-wide `xConfiguration Video Monitors` layout (`Single`/`Dual`/`DualPresentationOnly`/`Triple`/`TriplePresentationOnly`) based on the combined roles across all three connectors.
- **Selfview Control** — toggle Selfview on/off, and pick which monitor (1/2/3) it displays on.
- **Selfview Fullscreen** — toggle whether Selfview shows as a small picture-in-picture window or takes over the full screen.

The panel stays in sync with the actual device state at all times — if a role or Selfview setting changes from the physical remote, a touch controller, or another macro, the panel updates to match.

## Files

| File | Purpose |
|---|---|
| `monitor_selfview_panel.xml` | In-Room Control panel layout (widgets, rows, value spaces) |
| `monitor_selfview_macro.js` | Macro logic — reads/writes xAPI state and keeps the panel in sync |
| `CHANGELOG.md` | Full version history |

## Deployment

1. Open the device's web UI.
2. Go to **User Interface Extensions Editor** (or **Control Panel** depending on RoomOS version) → **Import your own panel XML** → select `monitor_selfview_panel.xml` → **Save & Activate**.
3. Go to the **Macro Editor** → create a new macro → paste in `monitor_selfview_macro.js` → **Save**.
4. Make sure the macro is enabled and running (not just saved).
5. Ensure **Macros** and **In-Room Control** are enabled under the device's feature settings.

## Requirements

- RoomOS device with HDMI outputs and In-Room Control support.
- Macros feature enabled.

## Notes / gotchas

These are non-obvious RoomOS behaviors this project ran into — see `CHANGELOG.md` for the full story:

- `Button` widgets can't display an arbitrary value via `SetValue` — only widgets with a defined `ValueSpace` (`GroupButton`, `ToggleButton`, `Slider`) can. That's why monitor roles use `GroupButton`, not `Button`.
- A `GroupButton`'s `ValueSpace` must list every value the device can actually report, or `SetValue` throws `"GroupButton value outside of valuespace"`.
- `ToggleButton` widget actions fire with `Type: "changed"` — not `"released"`/`"clicked"`. Easy to miss, and the failure mode is silent (no error, nothing happens).
- `xCommand Video Selfview Set` needs all four parameters (`Mode`, `FullscreenMode`, `OnMonitorRole`, `PIPPosition`) sent together on every call — partial updates don't reliably apply.
- Prefer granular per-field `xStatus`/`xConfiguration` subscriptions over one parent-level subscription when syncing a widget to device state, and refresh the widget explicitly right after your own command instead of relying solely on the subscription.

## Known limitations

- Assumes up to 3 HDMI outputs. On a device with fewer, the extra `GroupButton`(s) simply won't reflect a role (no error).
- No control for `PIPPosition` in the panel; the macro preserves whatever the device's current PIP position is on every Selfview command.
