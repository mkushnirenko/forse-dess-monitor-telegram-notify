import { EventEmitter } from 'node:events';
import type { DirectLive, DirectState, DirectStatus, Snapshot } from '../shared/types';
import { readLiveOnce } from './dess/direct-probe';

/** A reading counts as fresh for this long at least, whatever the interval. */
const MIN_WINDOW_MS = 45_000;
/** Consecutive failures that turn the status into an error. */
const ERROR_AFTER_FAILS = 3;
/** Consecutive failures after which requests pause, so a refusing cloud is not hammered. */
const PAUSE_AFTER_FAILS = 5;
const PAUSE_MS = 5 * 60_000;

export interface DirectFeedDeps {
  /** Sends one frame through the cloud and returns the reply hex; throws on a cloud error. */
  send(hexFrame: string): Promise<string>;
  /** Runs a request in the app-wide queue, so cloud requests never overlap. */
  serial<T>(fn: () => Promise<T>): Promise<T>;
  /** The latest snapshot from the regular poll, WITHOUT any live overlay: what readings are checked against. */
  reference(): Snapshot | undefined;
  now?: () => number;
}

/** True if `a` is within a factor of three of `b` (both non-zero). */
const sameMagnitude = (a: number, b: number) => {
  const r = Math.abs(a) / Math.abs(b);
  return r >= 1 / 3 && r <= 3;
};
/** A reference value is only good for checking against when it is clearly away from zero. */
const usable = (v: number | null | undefined): v is number => v !== null && v !== undefined && Math.abs(v) >= 100;

/**
 * Keeps the dashboard fresh with direct reads of the inverter (through the cloud) at the chosen
 * interval. It owns the request timer, the status for the UI and an overlay that lays the
 * freshest reading over a snapshot.
 *
 * Power values and the battery current direction are not trusted until they have agreed with the
 * regular poll once, so a wrong unit or sign can never put a nonsensical number on screen.
 *
 * Events: "update" (a new reading is available), "state" (the status changed).
 */
export class DirectFeed extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  /** Re-evaluates the status so that "live" can expire even when no request completes. */
  private statusTimer: NodeJS.Timeout | null = null;
  private attached = false;
  /** The read in progress, if any. */
  private current: Promise<boolean> | null = null;
  private fails = 0;
  private pausedUntil = 0;
  private latest: { at: number; live: DirectLive } | null = null;
  private notice: string | undefined;
  private intervalSec = 10;
  private lastState = '';
  private verified = { pv: false, load: false, soc: false };
  /** Direction of the battery power register: 1 if positive means charging, -1 if the opposite; null until learned. */
  private batSign: 1 | -1 | null = null;
  private batVote: 1 | -1 | null = null;

  constructor(
    private deps: DirectFeedDeps,
    private enabled: boolean,
    private unit: number,
    /** Trust the register meanings without checking them against the cloud (local mode has no cloud to check with). */
    private trusted = false,
  ) {
    super();
    if (trusted) this.trust();
    this.lastState = JSON.stringify(this.state());
  }

  /** The meanings confirmed on this inverter model: SOC in register 229, battery power signed with charging positive. */
  private trust() {
    this.verified = { pv: true, load: true, soc: true };
    this.batSign = 1;
  }

  private now() {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private get windowMs() {
    return Math.max(MIN_WINDOW_MS, this.intervalSec * 3000);
  }

  state(now = this.now()): DirectState {
    if (!this.enabled) return { enabled: false, status: 'off' };
    const fresh = this.latest !== null && now - this.latest.at <= this.windowMs;
    let status: DirectStatus;
    if (fresh) status = 'live';
    else if (this.fails >= ERROR_AFTER_FAILS) status = 'error';
    else status = 'connecting';
    return {
      enabled: true,
      status,
      lastAt: this.latest?.at,
      notice: status === 'error' ? this.notice : undefined,
    };
  }

  private refresh() {
    const next = JSON.stringify(this.state());
    if (next !== this.lastState) {
      this.lastState = next;
      this.emit('state', this.state());
    }
  }

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.forget();
    this.reschedule();
    this.refresh();
  }

  setUnit(unit: number) {
    if (unit === this.unit) return;
    this.unit = unit;
    this.forget();
    this.reschedule();
    this.refresh();
  }

  setIntervalSec(sec: number) {
    this.intervalSec = sec;
    this.reschedule();
  }

  /** The device is known and the cloud session exists: requests may start. */
  attach() {
    this.attached = true;
    this.reschedule();
  }

  /** Signed out: stop and forget everything learned. */
  detach() {
    this.attached = false;
    this.forget();
    this.verified = { pv: false, load: false, soc: false };
    this.batSign = null;
    this.batVote = null;
    if (this.trusted) this.trust();
    this.reschedule();
    this.refresh();
  }

  dispose() {
    this.attached = false;
    this.reschedule();
  }

  private forget() {
    this.latest = null;
    this.fails = 0;
    this.pausedUntil = 0;
    this.notice = undefined;
  }

  /** (Re)starts the timer according to the current settings. */
  private reschedule() {
    if (this.timer) clearInterval(this.timer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.timer = null;
    this.statusTimer = null;
    if (!this.enabled || !this.attached) return;
    this.timer = setInterval(() => void this.tick(), this.intervalSec * 1000);
    this.statusTimer = setInterval(() => this.refresh(), 5000);
    void this.tick();
  }

  /**
   * One read; resolves to whether a fresh reading was obtained. While a read is already running,
   * this joins it instead of starting another. Skipped (false) while paused after repeated
   * failures, unless `force` is set (the user pressed Refresh).
   */
  tick(force = false): Promise<boolean> {
    if (this.current) return this.current;
    if (!this.enabled || !this.attached) return Promise.resolve(false);
    if (force) this.pausedUntil = 0;
    if (this.now() < this.pausedUntil) return Promise.resolve(false);
    this.current = this.readOnce().finally(() => {
      this.current = null;
    });
    return this.current;
  }

  private async readOnce(): Promise<boolean> {
    {
      const res = await this.deps.serial(() => readLiveOnce(this.unit, (f) => this.deps.send(f)));
      if (!this.enabled || !this.attached) return false; // switched off while the request was in flight
      if (res.ok) {
        this.fails = 0;
        this.notice = undefined;
        this.latest = { at: this.now(), live: res.live };
        this.calibrate(res.live);
        this.emit('update');
      } else {
        this.fails++;
        this.notice = res.detail;
        if (this.fails >= PAUSE_AFTER_FAILS) {
          this.pausedUntil = this.now() + PAUSE_MS;
          this.fails = PAUSE_AFTER_FAILS - 1; // after the pause a single failure pauses again
        }
      }
      this.refresh();
      return res.ok;
    }
  }

  /** Compares a reading with the regular poll to learn whether powers and battery sign can be trusted. */
  private calibrate(live: DirectLive) {
    const ref = this.deps.reference();
    if (!ref) return;
    if (!this.verified.pv && usable(ref.pv.power) && live.pvPower >= 100 && sameMagnitude(live.pvPower, ref.pv.power)) {
      this.verified.pv = true;
    }
    if (!this.verified.load && usable(ref.load.power) && live.outputPower >= 100 && sameMagnitude(live.outputPower, ref.load.power)) {
      this.verified.load = true;
    }
    if (!this.verified.soc && ref.battery.capacity !== null && live.batterySoc <= 100 && Math.abs(live.batterySoc - ref.battery.capacity) <= 10) {
      this.verified.soc = true;
    }
    if (this.batSign === null && usable(ref.battery.power)) {
      const w = live.batteryPower;
      if (Math.abs(w) >= 100 && sameMagnitude(w, ref.battery.power)) {
        const vote: 1 | -1 = Math.sign(w) === Math.sign(ref.battery.power) ? 1 : -1;
        // Two agreeing checks in a row: one stale regular poll must not decide for good.
        if (this.batVote === vote) this.batSign = vote;
        this.batVote = vote;
      } else {
        this.batVote = null;
      }
    }
  }

  /** The latest reading while it is fresh, else null (for listing every value). */
  liveReading(now = this.now()): DirectLive | null {
    return this.enabled && this.latest && now - this.latest.at <= this.windowMs ? this.latest.live : null;
  }

  /** Lays a fresh reading over a snapshot; a stale or missing reading leaves it untouched. */
  overlay(snap: Snapshot, now = this.now()): Snapshot {
    if (!this.enabled || !this.latest || now - this.latest.at > this.windowMs) return snap;
    const { at, live } = this.latest;
    const out: Snapshot = {
      ...snap,
      liveAt: at,
      pv: { ...snap.pv, voltage: live.pvVoltage },
      load: { ...snap.load, voltage: live.outputVoltage, frequency: live.outputFrequency, percent: live.loadPercent },
      grid: { ...snap.grid, voltage: live.gridVoltage, frequency: live.gridFrequency, present: live.gridVoltage >= 90 },
      battery: { ...snap.battery, voltage: live.batteryVoltage },
    };
    if (this.verified.pv) out.pv.power = live.pvPower;
    if (this.verified.load) {
      out.load.power = live.outputPower;
      out.load.apparentPower = live.outputApparentPower;
    }
    if (this.verified.soc) out.battery.capacity = live.batterySoc;
    if (this.batSign !== null) {
      const watts = live.batteryPower * this.batSign;
      out.battery.power = watts;
      const v = live.batteryVoltage;
      if (v > 0) {
        out.battery.chargeCurrent = Math.max(0, watts) / v;
        out.battery.dischargeCurrent = Math.max(0, -watts) / v;
      }
    }
    // The grid power is not among the registers read: estimate it from the balance (what the grid
    // supplies is what the load and the battery charge take, minus PV). Needs all three trusted.
    if (this.verified.pv && this.verified.load && this.batSign !== null) {
      out.grid.power = out.grid.present ? Math.max(0, out.load.power! + out.battery.power! - out.pv.power!) : 0;
    }
    return out;
  }
}
