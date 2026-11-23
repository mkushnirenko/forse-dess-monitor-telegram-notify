import { dict, translateStatus, type Dict } from '../shared/i18n';
import type { AppState, Lang, NotifySettings, Snapshot } from '../shared/types';

export type Send = (title: string, body: string) => void;

/** How many identical observations in a row are needed to accept a state change. */
const CONFIRM = 2;
/** The connection counts as lost once errors have lasted at least this long. */
const CONNECTION_LOST_MS = 60_000;
/** Hysteresis gap, %: a repeat notification only fires after leaving the zone by this much. */
const HYSTERESIS = 5;
/** Grid voltage at or below this value counts as no grid. */
const GRID_MIN_V = 80;

interface Cond {
  value: boolean;
  pending: boolean;
  n: number;
}

/** "1.25 kW" for large values, "480 W" otherwise, in the dictionary's units and locale. */
function formatPower(w: number | null, d: Dict): string {
  if (w === null) return '—';
  if (Math.abs(w) >= 1000) {
    const kw = new Intl.NumberFormat(d.lang.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(w / 1000);
    return `${kw} ${d.units.kw}`;
  }
  return `${Math.round(w)} ${d.units.w}`;
}

/**
 * Tracks state transitions and sends notifications.
 * Independent of Electron: how a notification is shown is passed in from outside.
 *
 * Rules against noise: a state must be confirmed by two observations in a row,
 * thresholds have hysteresis, and the first snapshot after start reports nothing.
 */
export class Notifier {
  private conds = new Map<string, Cond>();
  private lastFetched = 0;
  private errorSince: number | null = null;
  private connLost = false;

  constructor(
    private send: Send,
    private settings: () => NotifySettings,
    private lang: () => Lang,
  ) {}

  reset() {
    this.conds.clear();
    this.lastFetched = 0;
    this.errorSince = null;
    this.connLost = false;
  }

  handle(state: AppState, now = Date.now()) {
    if (!state.loggedIn) {
      this.reset();
      return;
    }
    this.checkConnection(state, now);

    const snap = state.snapshot;
    if (!snap || snap.fetchedAt === this.lastFetched) return; // each snapshot is examined once
    this.lastFetched = snap.fetchedAt;
    this.checkSnapshot(snap);
  }

  private on(key: keyof NotifySettings) {
    const s = this.settings();
    return s.enabled && s[key] === true;
  }

  /** Dictionary in the language selected right now. */
  private d() {
    return dict(this.lang());
  }

  private checkConnection(state: AppState, now: number) {
    const n = this.d().main.notify;
    if (state.connection === 'error') {
      this.errorSince ??= now;
      if (!this.connLost && now - this.errorSince >= CONNECTION_LOST_MS) {
        this.connLost = true;
        if (this.on('connection')) this.send(n.connectionLost, state.error ?? n.connectionLostFallback);
      }
    } else if (state.connection === 'ok') {
      if (this.connLost && this.on('connection')) this.send(n.connectionBack, n.connectionBackBody);
      this.connLost = false;
      this.errorSince = null;
    }
  }

  /** Records a state change after CONFIRM confirmations; the first observation is silent. */
  private observe(key: string, next: boolean, rise?: () => void, fall?: () => void) {
    const c = this.conds.get(key);
    if (!c) {
      this.conds.set(key, { value: next, pending: next, n: 0 });
      return;
    }
    if (next === c.value) {
      c.pending = next;
      c.n = 0;
      return;
    }
    if (next === c.pending) c.n++;
    else {
      c.pending = next;
      c.n = 1;
    }
    if (c.n >= CONFIRM) {
      c.value = next;
      c.n = 0;
      (next ? rise : fall)?.();
    }
  }

  private current(key: string) {
    return this.conds.get(key)?.value ?? false;
  }

  private checkSnapshot(snap: Snapshot) {
    const s = this.settings();
    const cap = snap.battery.capacity;

    // Grid. If the voltage did not arrive, claim nothing.
    if (snap.grid.voltage !== null) {
      this.observe(
        'gridDown',
        snap.grid.voltage <= GRID_MIN_V,
        () => {
          const n = this.d().main.notify;
          if (this.on('grid')) this.send(n.gridLost, n.gridLostBody(cap !== null ? Math.round(cap) : null));
        },
        () => {
          const n = this.d().main.notify;
          if (this.on('grid')) this.send(n.gridBack, n.gridBackBody(Math.round(snap.grid.voltage ?? 0)));
        },
      );
    }

    // Low battery, with hysteresis.
    if (cap !== null) {
      const th = s.batteryLowPct;
      const low = this.current('batLow') ? cap < th + HYSTERESIS : cap <= th;
      this.observe('batLow', low, () => {
        const n = this.d().main.notify;
        if (this.on('batteryLow')) this.send(n.batteryLow, n.batteryLowBody(Math.round(cap), th));
      });
    }

    // Overload, with hysteresis.
    const pct = snap.load.percent;
    if (pct !== null) {
      const th = s.overloadPct;
      const over = this.current('overload') ? pct >= th - HYSTERESIS : pct >= th;
      this.observe('overload', over, () => {
        const d = this.d();
        if (this.on('overload')) this.send(d.main.notify.overload, d.main.notify.overloadBody(Math.round(pct), formatPower(snap.load.power, d)));
      });
    }

    // Fault.
    const fault = snap.device.status === 2 || /fault/i.test(snap.system.state ?? '');
    this.observe(
      'fault',
      fault,
      () => {
        const n = this.d().main.notify;
        const state = snap.system.state ? translateStatus(this.lang(), snap.system.state) : undefined;
        if (this.on('fault')) this.send(n.fault, n.faultBody(state));
      },
      () => {
        const n = this.d().main.notify;
        if (this.on('fault')) this.send(n.faultCleared, n.faultClearedBody);
      },
    );

    // Inverter offline.
    this.observe(
      'offline',
      snap.device.status === 1,
      () => {
        const n = this.d().main.notify;
        if (this.on('offline')) this.send(n.offline, n.offlineBody);
      },
      () => {
        const n = this.d().main.notify;
        if (this.on('offline')) this.send(n.online, n.onlineBody);
      },
    );
  }
}
