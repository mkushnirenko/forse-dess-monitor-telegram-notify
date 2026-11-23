import crypto from 'node:crypto';
import qs from 'node:querystring';

const BASE_URL = 'https://web.dessmonitor.com';
const COMPANY_KEY = 'bnrl_frRFjEz8Mkn';
/** Renew the token ahead of time, an hour before it expires. */
const RENEW_BEFORE_MS = 60 * 60 * 1000;

export interface DessAuth {
  token: string;
  secret: string;
  /** Token lifetime in seconds (as the API reports it). */
  expire: number;
  issuedAt: number;
  uid: number;
  usr: string;
}

export interface DeviceTarget {
  pn: string;
  sn: string;
  devcode: string;
  devaddr: string;
}

export class DessApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
  }
}

export const sha1 = (s: string) =>
  crypto.createHash('sha1').update(s).digest('hex');

/** Serialises parameters the way the DessMonitor signature expects. */
function toUriStr(params: Record<string, string | undefined>): string {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null),
  ) as Record<string, string>;
  return qs
    .stringify(clean)
    .replace(/%20/g, '+')
    .replace(/%2B/g, '+')
    .replace(/%3A/g, ':')
    .replace(/%2C/g, ',')
    .replace(/%40/g, '@')
    .replace(/%24/g, '$')
    .replace(/%26/g, '&')
    .replace(/%3D/g, '=')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new DessApiError(`HTTP ${res.status}`);
  return res.json();
}

/** Sign-in. Takes the SHA-1 of the password: the plain password is never stored. */
export async function authenticate(
  username: string,
  passwordSha1: string,
): Promise<DessAuth> {
  const salt = Date.now().toString();
  const params = {
    action: 'authSource',
    usr: username,
    source: '1',
    'company-key': COMPANY_KEY,
  };
  const uri = toUriStr(params);
  const sign = sha1(`${salt}${passwordSha1}&${uri}`);
  const data = await getJson(`${BASE_URL}/public/?sign=${sign}&salt=${salt}&${uri}`);
  if (data.err !== 0 || !data.dat) {
    throw new DessApiError(data.desc || 'Authentication failed', data.err);
  }
  return { ...data.dat, issuedAt: Date.now() };
}

export function isAuthFresh(auth: DessAuth | null): auth is DessAuth {
  if (!auth) return false;
  return auth.issuedAt + auth.expire * 1000 - Date.now() > RENEW_BEFORE_MS;
}

/** Request to the protected /public/ endpoint. Read-only. */
export async function publicRequest<T = any>(
  auth: DessAuth,
  params: Record<string, string | undefined>,
): Promise<T> {
  const salt = Date.now().toString();
  const uri = toUriStr(params);
  const sign = sha1(`${salt}${auth.secret}${auth.token}&${uri}`);
  const url = `${BASE_URL}/public/?sign=${sign}&salt=${salt}&token=${auth.token}&${uri}`;
  const data = await getJson(url);
  if (data.err !== 0) {
    throw new DessApiError(data.desc || `API error (${data.err})`, data.err);
  }
  return data.dat as T;
}

// ---- Endpoints (read-only) ----

export interface RawDevice {
  sn: string;
  pn: string;
  devcode: number;
  devaddr: number;
  devalias: string;
  status: number;
}

export async function queryDeviceList(auth: DessAuth): Promise<RawDevice[]> {
  const dat = await publicRequest<{ device: RawDevice[] }>(auth, {
    action: 'webQueryDeviceEs',
    i18n: 'en_US',
    source: '1',
    page: '0',
    pagesize: '15',
  });
  return dat.device ?? [];
}

const target = (t: DeviceTarget) => ({ ...t, source: '1' });

export function queryLastData(auth: DessAuth, t: DeviceTarget) {
  return publicRequest<{ gts: string; pars: Record<string, any[]> }>(auth, {
    action: 'querySPDeviceLastData',
    i18n: 'en_US',
    ...target(t),
  });
}

/** The device parameter list (used for diagnostics: it may refresh at a different pace). */
export function queryParsEs(auth: DessAuth, t: DeviceTarget) {
  return publicRequest<{ parameter?: { par: string; name: string; val: string; unit?: string }[] } & Record<string, unknown>>(auth, {
    action: 'queryDeviceParsEs',
    i18n: 'en_US',
    ...target(t),
  });
}

export function queryEnergyFlow(auth: DessAuth, t: DeviceTarget) {
  return publicRequest<Record<string, any>>(auth, {
    action: 'webQueryDeviceEnergyFlowEs',
    ...target(t),
  });
}

/**
 * Sends one frame to the inverter through the cloud and returns its reply as hex ("" when there
 * is none). Callers must build the frame with direct.ts, which can only produce read queries.
 */
export async function sendDirectCommand(auth: DessAuth, t: DeviceTarget, hexFrame: string): Promise<string> {
  const dat = await publicRequest<unknown>(auth, {
    action: 'sendCmdToDevice',
    ...target(t),
    cmd: hexFrame,
  });
  if (typeof dat === 'string') return dat;
  if (dat && typeof dat === 'object') {
    const inner = (dat as { dat?: unknown }).dat;
    if (typeof inner === 'string') return inner;
  }
  return '';
}
