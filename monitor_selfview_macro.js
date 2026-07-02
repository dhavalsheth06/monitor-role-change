import xapi from 'xapi';

/*
 * Macro: Monitor Roles / Selfview Control
 * Version: 1.9.0
 * Description: Drives the "panel_monitor_selfview" In-Room Control panel
 *              (see monitor_selfview_panel.xml). Sets HDMI output monitor
 *              roles directly (GroupButton per output), toggles Selfview
 *              on/off and its target monitor, and toggles Selfview
 *              fullscreen mode. Keeps the panel in sync with device state
 *              changed from elsewhere (remote, touch panel, another macro,
 *              or another In-Room Control session).
 * Date: 2026-07-02
 * Changelog: see CHANGELOG.md
 *
 * NOTE ON xAPI: monitor role is a *configuration*, not a command — it's set
 * via xConfiguration Video Output Connector [n] MonitorRole, not an
 * "xCommand Video Output Set". Selfview on/off + target monitor + fullscreen
 * are all one command: xCommand Video Selfview Set, and it needs all four
 * parameters (Mode, FullscreenMode, OnMonitorRole, PIPPosition) sent
 * together on every call — see applySelfview() below.
 */

// Map panel widget -> HDMI output connector index
const OUTPUT_WIDGETS = {
  widget_hdmi1_role: 1,
  widget_hdmi2_role: 2,
  widget_hdmi3_role: 3
};

// Must match the <Key> values in each HDMI role GroupButton's ValueSpace in
// monitor_selfview_panel.xml.
const VALID_ROLES = ['First', 'Second', 'Third', 'PresentationOnly'];

// Map GroupButton key (selected monitor) -> Selfview OnMonitorRole value
const MONITOR_ROLE_BY_KEY = {
  1: 'First',
  2: 'Second',
  3: 'Third'
};
const KEY_BY_MONITOR_ROLE = { First: '1', Second: '2', Third: '3' };

// FullscreenMode (both the widget's own value and xStatus) can report
// "Current"/"current" in addition to On/Off — treat that as "on" wherever
// the value is read or compared.
function isFullscreenOn(value) {
  return value === 'On' || value === 'on' || value === 'Current' || value === 'current';
}

// ---- Monitor role helpers ----

async function getOutputRole(connector) {
  try {
    return await xapi.Config.Video.Output.Connector[connector].MonitorRole.get();
  } catch (e) {
    // Connector doesn't exist on this device (fewer than 3 HDMI outputs)
    return null;
  }
}

async function setOutputRole(connector, role) {
  await xapi.Config.Video.Output.Connector[connector].MonitorRole.set(role);
}

async function refreshOutputButton(widgetId, connector) {
  const role = await getOutputRole(connector);
  // No matching ValueSpace key for a missing connector, or a role RoomOS
  // reports that isn't in the panel's ValueSpace — leave the widget as-is
  // rather than calling SetValue with an invalid key (throws "GroupButton
  // value outside of valuespace").
  if (role === null || !VALID_ROLES.includes(role)) return;
  await xapi.Command.UserInterface.Extensions.Widget.SetValue({
    WidgetId: widgetId,
    Value: role
  });
}

async function refreshAllOutputButtons() {
  await Promise.all(
    Object.entries(OUTPUT_WIDGETS).map(([widgetId, connector]) => refreshOutputButton(widgetId, connector))
  );
}

// ---- Selfview helpers ----

// Reads current Selfview state so applySelfview() can always send all four
// Selfview.Set parameters together — sending only the parameter(s) being
// changed does not reliably apply on this device.
async function getCurrentSelfviewState() {
  const [mode, fullscreen, onMonitorRole, pipPosition] = await Promise.all([
    xapi.Status.Video.Selfview.Mode.get().catch(() => 'Off'),
    xapi.Status.Video.Selfview.FullscreenMode.get().catch(() => 'Off'),
    xapi.Status.Video.Selfview.OnMonitorRole.get().catch(() => 'Current'),
    xapi.Status.Video.Selfview.PIPPosition.get().catch(() => 'LowerRight')
  ]);
  return { Mode: mode, FullscreenMode: fullscreen, OnMonitorRole: onMonitorRole, PIPPosition: pipPosition };
}

// Merges overrides onto current Selfview state and issues one
// xCommand Video Selfview Set with all four parameters present.
async function applySelfview(overrides) {
  const params = { ...(await getCurrentSelfviewState()), ...overrides };
  await xapi.Command.Video.Selfview.Set(params);
  return params;
}

async function refreshSelfviewWidgets() {
  const [mode, fullscreen, onMonitorRole] = await Promise.all([
    xapi.Status.Video.Selfview.Mode.get().catch(() => 'Off'),
    xapi.Status.Video.Selfview.FullscreenMode.get().catch(() => 'Off'),
    xapi.Status.Video.Selfview.OnMonitorRole.get().catch(() => 'Current')
  ]);

  await xapi.Command.UserInterface.Extensions.Widget.SetValue({
    WidgetId: 'widget_sv_toggle',
    Value: mode === 'On' ? 'on' : 'off'
  });

  await xapi.Command.UserInterface.Extensions.Widget.SetValue({
    WidgetId: 'widget_fs_toggle',
    Value: isFullscreenOn(fullscreen) ? 'on' : 'off'
  });

  const key = KEY_BY_MONITOR_ROLE[onMonitorRole];
  if (key) {
    await xapi.Command.UserInterface.Extensions.Widget.SetValue({
      WidgetId: 'widget_sv_monitor_group',
      Value: key
    });
  }
}

// ---- Event handling: user interaction on the panel ----

xapi.Event.UserInterface.Extensions.Widget.Action.on(async (event) => {
  // Unconditional diagnostic log — fires for every widget action, before any
  // filtering, so we can see in the macro console whether the panel is
  // sending an action at all for a given tap, and with what Type/Value.
  console.log(`Widget Action received: WidgetId=${event.WidgetId} Type=${event.Type} Value=${event.Value}`);

  // Button/GroupButton actions arrive as Type 'released' or 'clicked';
  // ToggleButton actions arrive as Type 'changed' — confirmed via the
  // diagnostic log above (widget_sv_toggle / widget_fs_toggle both fired
  // with Type=changed). Missing 'changed' here silently dropped every
  // ToggleButton tap before this line was added.
  if (!['released', 'clicked', 'changed'].includes(event.Type)) return;

  // Monitor role GroupButton: event.Value is the selected key (First/Second/Third/PresentationOnly)
  if (OUTPUT_WIDGETS[event.WidgetId] !== undefined) {
    const connector = OUTPUT_WIDGETS[event.WidgetId];
    await setOutputRole(connector, event.Value);
    return; // xConfiguration.on listener below refreshes the widget
  }

  // Selfview on/off toggle — event.Value is the state the switch just moved
  // to ('on'/'off'), use it directly rather than re-reading xStatus and
  // inverting (a stale read there would flip back to the same state).
  if (event.WidgetId === 'widget_sv_toggle') {
    await applySelfview({ Mode: event.Value === 'on' ? 'On' : 'Off' });
    await refreshSelfviewWidgets(); // don't rely solely on the status subscription for our own change
    return;
  }

  // Selfview target monitor (GroupButton selection)
  if (event.WidgetId === 'widget_sv_monitor_group') {
    const role = MONITOR_ROLE_BY_KEY[event.Value];
    if (!role) return;
    await applySelfview({ Mode: 'On', OnMonitorRole: role });
    await refreshSelfviewWidgets();
    return;
  }

  // Selfview fullscreen toggle. Logged so failures are visible in the macro
  // console instead of failing silently.
  if (event.WidgetId === 'widget_fs_toggle') {
    const wantFullscreen = isFullscreenOn(event.Value);
    try {
      const applied = await applySelfview({ Mode: 'On', FullscreenMode: wantFullscreen ? 'On' : 'Off' });
      await refreshSelfviewWidgets(); // don't rely solely on the status subscription for our own change
      const confirmed = await xapi.Status.Video.Selfview.FullscreenMode.get();
      console.log(`Selfview Fullscreen requested=${applied.FullscreenMode} confirmed=${confirmed}`);
    } catch (e) {
      console.log(`Selfview Fullscreen command failed: ${JSON.stringify(e)}`);
    }
    return;
  }
});

// ---- Feedback loop: keep the panel in sync when state changes from elsewhere ----
// (physical remote, touch controller, another macro, or Control Hub)

// Granular per-field subscriptions rather than one parent xapi.Status.Video.Selfview.on()
// — mirrors the per-connector MonitorRole subscriptions below, which are known to fire
// reliably; the parent-level subscription was not reliably reflecting FullscreenMode
// changes back into the widget.
xapi.Status.Video.Selfview.Mode.on(() => refreshSelfviewWidgets());
xapi.Status.Video.Selfview.FullscreenMode.on(() => refreshSelfviewWidgets());
xapi.Status.Video.Selfview.OnMonitorRole.on(() => refreshSelfviewWidgets());

// Granular per-connector subscriptions — each fires with just that connector's
// new MonitorRole value, so no need to walk a nested event object here.
Object.values(OUTPUT_WIDGETS).forEach((connector) => {
  xapi.Config.Video.Output.Connector[connector].MonitorRole.on(() => refreshAllOutputButtons());
});

// ---- Initialization: sync panel to current device state on macro start ----

async function init() {
  await refreshAllOutputButtons();
  await refreshSelfviewWidgets();
}

init();
