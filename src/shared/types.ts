/** Types shared between the main process and the UI. */

export type Num = number | null;

/** Interface languages. English is the default. */
export type Lang = 'en' | 'uk';

export const LANGS: Lang[] = ['en', 'uk'];

export const DEFAULT_LANG: Lang = 'en';

export interface ParamRow {
  group: string;
  id: string;
  name: string;
  value: string;
  unit?: string;
}

export interface DeviceInfo {
  alias: string;
  sn: string;
  pn: string;
  /** 0 normal, 1 offline, 2 fault, 3 standby, 4 warning */
  status: number;
}

export interface Snapshot {
  /** When the app received the data (ms). */
  fetchedAt: number;
  /** Raw data timestamp from the cloud, as is (for debugging). */
  deviceTime?: string;
  /** Data time in local time (Unix ms), with the cloud time shift applied. */
  deviceTimeMs?: number;
  /** When the direct reading that supplied the values shown here arrived (ms); absent if none did. */
  liveAt?: number;
  device: DeviceInfo;
  battery: {
    voltage: Num;
    /** State of charge, % (as reported by the inverter). */
    capacity: Num;
    chargeCurrent: Num;
    dischargeCurrent: Num;
    /** W: positive while charging, negative while discharging. */
    power: Num;
    status?: string;
  };
  pv: {
    voltage: Num;
    power: Num;
    status?: string;
  };
  grid: {
    voltage: Num;
    frequency: Num;
    power: Num;
    /** Whether grid voltage is present at the input. */
    present: boolean;
    status?: string;
  };
  load: {
    power: Num;
    apparentPower: Num;
    percent: Num;
    voltage: Num;
    frequency: Num;
    status?: string;
  };
  system: {
    state?: string;
    outputPriority?: string;
    chargerPriority?: string;
  };
  params: ParamRow[];
}

export type ConnectionState = 'idle' | 'connecting' | 'ok' | 'error';

export interface AppState {
  loggedIn: boolean;
  username?: string;
  connection: ConnectionState;
  /** Polling interval, seconds. */
  pollIntervalSec: number;
  /** Correction applied to the cloud data timestamp, minutes. */
  timeShiftMin: number;
  language: Lang;
  direct: DirectState;
  source: DataSource;
  local: LocalState;
  notify: NotifySettings;
  battery: BatterySettings;
  forecast: Forecast;
  /** Whether the mini widget is open. */
  widgetOpen: boolean;
  error?: string;
  snapshot?: Snapshot;
}

/** Poll intervals offered in the UI. Below 10 s makes no sense: the cloud data itself only changes about once a minute. */
export const POLL_OPTIONS_SEC = [10, 15, 30, 60] as const;
/** The same choices as for the cloud, plus 5 s: not lower, since the datalogger also serves its own cloud traffic on the same inverter bus. */
export const LOCAL_POLL_OPTIONS_SEC = [5, 10, 15, 30, 60] as const;

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export interface ForseApi {
  getState(): Promise<AppState>;
  login(username: string, password: string): Promise<LoginResult>;
  logout(): Promise<void>;
  refresh(): Promise<boolean>;
  setPollInterval(sec: number): Promise<void>;
  setTimeShift(min: number): Promise<void>;
  /** Pick the time correction from the current data. */
  autoTimeShift(): Promise<void>;
  /** Chooses where the readings come from. */
  setSource(source: DataSource): Promise<void>;
  /** Searches the local networks for dataloggers (about ten seconds). */
  findLogger(): Promise<FoundLoggerInfo[]>;
  /** Uses this datalogger for the local source. */
  chooseLogger(ip: string): Promise<void>;
  /** Turns regular direct reads of the inverter (through the cloud) on or off. */
  setDirect(enabled: boolean): Promise<void>;
  /** Runs the one-off direct-request test (read-only queries to the inverter via the cloud). */
  probeDirect(): Promise<DirectProbeResult>;
  /** Changes the interface language; the windows reload to apply it. */
  setLanguage(lang: Lang): Promise<void>;
  setNotify(patch: Partial<NotifySettings>): Promise<void>;
  setBattery(b: BatterySettings): Promise<void>;
  /** Open or close the mini widget. */
  setWidget(open: boolean): Promise<void>;
  /** Fit the widget window height to its content. */
  resizeWidget(height: number): Promise<void>;
  /** Show the main window (for example, from the widget). */
  showMainWindow(): Promise<void>;
  /** Show a test notification. */
  testNotification(): Promise<void>;
  queryHistory(period: Period): Promise<HistoryResult>;
  /** Saves a CSV via a dialog; ok=false if the user cancelled. */
  exportHistory(period: Period): Promise<{ ok: boolean; path?: string }>;
  onState(cb: (state: AppState) => void): () => void;
}

// ---- History ----

export type Period = 'hour' | 'day' | 'week' | 'month';

export const PERIODS: Period[] = ['hour', 'day', 'week', 'month'];

/** Averaged chart point. Powers in W; null means there was no data in this interval. */
export interface HistoryPoint {
  t: number;
  pv: Num;
  load: Num;
  grid: Num;
  /** W: positive is charging, negative is discharging. */
  batW: Num;
  batPct: Num;
  batV: Num;
}

/** Energy, kWh. */
export interface EnergyTotals {
  pv: number;
  load: number;
  grid: number;
  batCharge: number;
  batDischarge: number;
}

export interface DayEnergy extends EnergyTotals {
  /** Local date, YYYY-MM-DD. */
  day: string;
}

export interface HistoryResult {
  period: Period;
  from: number;
  to: number;
  bucketMs: number;
  points: HistoryPoint[];
  totals: EnergyTotals;
  days: DayEnergy[];
  /** How many raw samples fall into the period. */
  samples: number;
}

// ---- Notifications ----

export interface NotifySettings {
  /** Master switch. */
  enabled: boolean;
  /** Grid lost / restored. */
  grid: boolean;
  batteryLow: boolean;
  /** Low battery threshold, %. */
  batteryLowPct: number;
  overload: boolean;
  /** Inverter load threshold, %. */
  overloadPct: number;
  /** Inverter fault. */
  fault: boolean;
  /** Inverter offline (the datalogger stopped reporting). */
  offline: boolean;
  /** No connection to the dessmonitor cloud. */
  connection: boolean;
}

export const DEFAULT_NOTIFY: NotifySettings = {
  enabled: true,
  grid: true,
  batteryLow: true,
  batteryLowPct: 30,
  overload: true,
  overloadPct: 90,
  fault: true,
  offline: true,
  connection: true,
};

export const BATTERY_LOW_OPTIONS = [10, 15, 20, 25, 30, 40, 50] as const;
export const OVERLOAD_OPTIONS = [60, 70, 80, 90, 95, 100] as const;

// ---- Battery and forecast ----

export type Chemistry = 'lifepo4' | 'liion' | 'lead';

/** Reasonable usable share of capacity for each chemistry, by default. */
export const DEFAULT_USABLE_PCT: Record<Chemistry, number> = { lifepo4: 90, liion: 80, lead: 50 };

export interface Battery {
  id: string;
  name: string;
  /** Capacity, Ah. */
  capacityAh: number;
  /** Nominal voltage, V. */
  voltage: number;
}

export interface BatterySettings {
  chemistry: Chemistry;
  /** Usable share of capacity, %. The forecast never plans to discharge below (100 − value). */
  usablePct: number;
  batteries: Battery[];
}

export const DEFAULT_BATTERY: BatterySettings = {
  chemistry: 'lifepo4',
  usablePct: DEFAULT_USABLE_PCT.lifepo4,
  batteries: [],
};

export interface Forecast {
  /**
   * unconfigured: no capacity set; unknown: no state-of-charge data;
   * discharging / charging: a forecast is available; idle: the battery is barely working.
   */
  mode: 'unconfigured' | 'unknown' | 'discharging' | 'charging' | 'idle';
  /** Hours until the lower limit (discharging) or until full (charging). */
  hours: number | null;
  /** Average battery power over the averaging window, W (negative is discharging). */
  avgPowerW: number | null;
  /** Target level: the lower limit when discharging, 100 when charging. */
  targetPct: number | null;
  /** Total bank capacity, kWh. */
  totalKwh: number;
  /** Energy currently available above the lower limit, kWh. */
  usableNowKwh: number | null;
}

// ---- Direct request test ----

/** Live readings decoded from a direct Modbus reply, in the app's units. */
export interface DirectLive {
  gridVoltage: number;
  gridFrequency: number;
  outputVoltage: number;
  outputFrequency: number;
  /** W, as the inverter reports it (absolute value). */
  outputPower: number;
  /** VA. */
  outputApparentPower: number;
  batteryVoltage: number;
  /** A, signed; the direction is learned by comparison with the regular poll. */
  batteryCurrent: number;
  /** W, signed; the direction is learned by comparison with the regular poll. */
  batteryPower: number;
  /** State of charge, %. */
  batterySoc: number;
  pvVoltage: number;
  pvCurrent: number;
  pvPower: number;
  loadPercent: number;
  dcdcTemperature: number;
  heatSinkTemperature: number;
}

export type ProbeOutcome = 'ok' | 'no_reply' | 'bad_reply' | 'cloud_error';

/** One query of the test and how it went. */
export interface ProbeStep {
  protocol: 'modbus' | 'axpert';
  /** Bus address used in a Modbus frame. */
  unit?: number;
  /** Name of the query, for example "QPIGS" or "live". */
  query: string;
  outcome: ProbeOutcome;
  /** Technical detail (why a reply was rejected, the cloud's message...). */
  detail?: string;
}

export interface DirectProbeResult {
  /**
   * works: the inverter answered with a valid reply; no_reply: nothing usable came back;
   * cloud_error: the cloud refused the request; not_ready: not signed in or no device yet;
   * busy: a test is already running; cooldown: tested too recently.
   */
  verdict: 'works' | 'no_reply' | 'cloud_error' | 'not_ready' | 'busy' | 'cooldown';
  steps: ProbeStep[];
  /** Decoded readings, when a Modbus query worked. */
  live?: DirectLive;
  /** The text of an Axpert reply, when that query worked. */
  axpertText?: string;
}

export type DirectStatus = 'off' | 'connecting' | 'live' | 'error';

/** State of regular direct reads, for the settings screen. */
export interface DirectState {
  enabled: boolean;
  status: DirectStatus;
  /** When the last reading arrived (ms). */
  lastAt?: number;
  /** Why the latest reads fail, while the status is "error". */
  notice?: string;
}


// ---- Data source ----

/** Where the readings come from: the DessMonitor cloud (as before) or the datalogger on the local network. */
export type DataSource = 'cloud' | 'local';

export type LocalStatus = 'off' | 'no_logger' | 'searching' | 'connecting' | 'live' | 'error';

/** State of the local source, for the settings screen. */
export interface LocalState {
  status: LocalStatus;
  /** The chosen datalogger. */
  loggerIp?: string;
  /** Its part number, once it has introduced itself. */
  pn?: string;
  /** When the last reading arrived (ms). */
  lastAt?: number;
  /** Why it is not working, while the status is "error". */
  notice?: string;
}

/** A datalogger found on the network. */
export interface FoundLoggerInfo {
  ip: string;
  pn: string;
  /** It opened a connection to this computer, which proves it is a datalogger. */
  connected: boolean;
}
