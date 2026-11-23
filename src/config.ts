import { createHash } from 'node:crypto';
import { DEFAULT_NOTIFY, LANGS, type Lang, type NotifySettings } from './shared/types';

export interface Config {
  username: string;
  passwordSha1: string;
  botToken: string;
  /** Family members send "/start <joinCode>" to the bot to subscribe. */
  joinCode: string;
  language: Lang;
  /** Regular (REST) poll interval: statuses, faults, the reference for the fast reads. */
  pollSec: number;
  /** Fast direct reads of the inverter, seconds; 0 = off. */
  directSec: number;
  /** Modbus address of the inverter. */
  directUnit: number;
  notify: NotifySettings;
  dataDir: string;
  /** Send a "service started" message to subscribers on every start. */
  announceStart: boolean;
}

const MIN_POLL_SEC = 30;
/** Fast reads are never more frequent than this: more would only load the cloud and the datalogger. */
const MIN_DIRECT_SEC = 10;

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v.trim() === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function int(v: string | undefined, fallback: number, lo: number, hi: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v?.trim() ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
}

/** Reads the settings from environment variables; throws a readable error when something required is missing. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing: string[] = [];
  const need = (name: string) => {
    const v = env[name]?.trim();
    if (!v) missing.push(name);
    return v ?? '';
  };

  const username = need('DESS_USERNAME');
  const botToken = need('TELEGRAM_BOT_TOKEN');
  const joinCode = need('JOIN_CODE');

  // Either the plain password (hashed here) or its SHA-1.
  const sha1 = env.DESS_PASSWORD_SHA1?.trim().toLowerCase();
  const plain = env.DESS_PASSWORD;
  let passwordSha1 = '';
  if (sha1 && /^[0-9a-f]{40}$/.test(sha1)) passwordSha1 = sha1;
  else if (plain) passwordSha1 = createHash('sha1').update(plain).digest('hex');
  else missing.push('DESS_PASSWORD or DESS_PASSWORD_SHA1');

  if (missing.length) throw new Error(`Missing or invalid settings: ${missing.join(', ')}`);

  const lang = env.LANGUAGE?.trim();
  return {
    username,
    passwordSha1,
    botToken,
    joinCode,
    language: (LANGS as readonly string[]).includes(lang ?? '') ? (lang as Lang) : 'uk',
    pollSec: int(env.POLL_SEC, 60, MIN_POLL_SEC, 600),
    directSec: env.DIRECT_SEC?.trim() === '0' ? 0 : int(env.DIRECT_SEC, 10, MIN_DIRECT_SEC, 600),
    directUnit: int(env.DIRECT_UNIT, 1, 0, 255),
    notify: {
      enabled: true,
      grid: bool(env.NOTIFY_GRID, DEFAULT_NOTIFY.grid),
      batteryLow: bool(env.NOTIFY_BATTERY_LOW, DEFAULT_NOTIFY.batteryLow),
      batteryLowPct: int(env.BATTERY_LOW_PCT, 20, 5, 100),
      overload: bool(env.NOTIFY_OVERLOAD, DEFAULT_NOTIFY.overload),
      overloadPct: int(env.OVERLOAD_PCT, 80, 5, 100),
      fault: bool(env.NOTIFY_FAULT, DEFAULT_NOTIFY.fault),
      offline: bool(env.NOTIFY_OFFLINE, DEFAULT_NOTIFY.offline),
      connection: bool(env.NOTIFY_CONNECTION, DEFAULT_NOTIFY.connection),
    },
    dataDir: env.DATA_DIR?.trim() || './data',
    announceStart: bool(env.ANNOUNCE_START, false),
  };
}
