import { dict } from './shared/i18n';
import type { AppState, Lang, NotifySettings, Snapshot } from './shared/types';
import {
  authenticate,
  DessApiError,
  isAuthFresh,
  queryDeviceList,
  queryEnergyFlow,
  queryLastData,
  sendDirectCommand,
  type DessAuth,
  type DeviceTarget,
} from './main/dess/client';
import { FlowCache } from './main/dess/flow-cache';
import { buildSnapshot } from './main/dess/mapper';
import { DirectFeed } from './main/direct-feed';
import { Notifier, type Send } from './main/notifier';

/** How many failed polls in a row it takes to report a connection problem (as in the app). */
const ERROR_AFTER_FAILED_POLLS = 2;

export interface PollerOptions {
  username: string;
  passwordSha1: string;
  /** Interval of the regular (REST) poll: statuses, faults, the reference for the fast reads. */
  pollSec: number;
  /** Interval of the fast direct reads of the inverter; 0 switches them off. */
  directSec: number;
  /** Modbus address of the inverter (1 for this model). */
  directUnit: number;
  language: Lang;
  notify: NotifySettings;
  send: Send;
  log?: (message: string) => void;
}

/**
 * Checks the inverter on its own schedule and feeds every result to the same Notifier the desktop
 * app uses, so the rules (two confirmations in a row, hysteresis, a silent first reading) are
 * identical. Two sources: a regular poll of the cloud's data, and fast direct reads of the
 * inverter through the cloud (read-only). Nothing here depends on the desktop app.
 */
export class Poller {
  private auth: DessAuth | null = null;
  private device: { info: Snapshot['device']; target: DeviceTarget } | null = null;
  private flowCache = new FlowCache();
  private notifier: Notifier;
  private direct: DirectFeed | null = null;
  private directAttached = false;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private failStreak = 0;
  /** Tail of the request queue: cloud requests never overlap (the cloud drops simultaneous connections). */
  private lane: Promise<unknown> = Promise.resolve();
  /** The latest regular-poll snapshot, without any fast reading on it. */
  private last: Snapshot | null = null;
  /** What the fast reads were last combined into (the freshest picture, for /status). */
  private view: Snapshot | null = null;

  constructor(private opts: PollerOptions) {
    this.notifier = new Notifier(opts.send, () => opts.notify, () => opts.language);
    if (opts.directSec > 0) {
      this.direct = new DirectFeed(
        {
          send: async (frame) => {
            await this.ensureAuth();
            return sendDirectCommand(this.auth!, this.device!.target, frame);
          },
          serial: (fn) => this.serial(fn),
          reference: () => this.last ?? undefined,
        },
        true,
        opts.directUnit,
      );
      this.direct.setIntervalSec(opts.directSec);
      this.direct.on('update', () => this.onDirect());
    }
  }

  /** The latest picture of the inverter (for the /status command). */
  latest(): Snapshot | null {
    return this.view ?? this.last;
  }

  start() {
    this.stopped = false;
    void this.loop();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.direct?.dispose();
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lane.then(fn, fn);
    this.lane = run.catch(() => undefined);
    return run;
  }

  private async ensureAuth() {
    if (!isAuthFresh(this.auth)) this.auth = await authenticate(this.opts.username, this.opts.passwordSha1);
  }

  /** One poll after another: the next starts only after the previous has finished. */
  private async loop() {
    if (this.stopped) return;
    await this.serial(() => this.pollOnce());
    if (!this.stopped) this.timer = setTimeout(() => void this.loop(), this.opts.pollSec * 1000);
  }

  private describe(e: unknown): string {
    const m = dict(this.opts.language).main.errors;
    if (e instanceof DessApiError) return e.message;
    if (e instanceof Error) {
      if (e.name === 'TimeoutError') return m.timeout;
      if (e.message.includes('fetch failed')) return m.noConnection;
      return e.message;
    }
    return m.unknown;
  }

  private async pollOnce() {
    try {
      await this.ensureAuth();
      if (!this.device) {
        const d = (await queryDeviceList(this.auth!))[0];
        if (!d) throw new Error(dict(this.opts.language).main.errors.noDevices);
        this.device = {
          info: { alias: d.devalias, sn: d.sn, pn: d.pn, status: d.status },
          target: { pn: d.pn, sn: d.sn, devcode: String(d.devcode), devaddr: String(d.devaddr) },
        };
      }
      const { info, target } = this.device;
      const last = await queryLastData(this.auth!, target);
      const flowRaw = await queryEnergyFlow(this.auth!, target).catch(() => null);
      const snapshot = buildSnapshot(info, last, this.flowCache.resolve(flowRaw));
      this.last = snapshot;
      this.failStreak = 0;
      const merged = this.direct ? this.direct.overlay(snapshot) : snapshot;
      this.view = merged;
      this.feed({ connection: 'ok', snapshot: merged });
      // The fast reads need the device to be known: start them after the first successful poll.
      if (this.direct && !this.directAttached) {
        this.directAttached = true;
        this.direct.attach();
      }
    } catch (e) {
      // The token may have expired early: sign in again on the next attempt.
      if (e instanceof DessApiError) this.auth = null;
      this.failStreak++;
      this.opts.log?.(`poll failed (${this.failStreak}): ${this.describe(e)}`);
      // While the fast reads are arriving, the cloud is clearly reachable: no connection alarm.
      if (this.failStreak >= ERROR_AFTER_FAILED_POLLS && this.direct?.state().status !== 'live') {
        this.feed({ connection: 'error', error: this.describe(e), snapshot: this.last ?? undefined });
      }
    }
  }

  /** A fast reading arrived: combine it with the latest regular snapshot and check the rules. */
  private onDirect() {
    if (!this.last || !this.direct) return;
    // A new fetchedAt makes the notifier examine it as a fresh observation.
    const merged = this.direct.overlay({ ...this.last, fetchedAt: Date.now() });
    this.view = merged;
    this.feed({ connection: 'ok', snapshot: merged });
  }

  private feed(part: Pick<AppState, 'connection'> & Partial<Pick<AppState, 'error' | 'snapshot'>>) {
    // The notifier looks at the connection state and the snapshot only.
    this.notifier.handle({ loggedIn: true, ...part } as AppState);
  }
}
