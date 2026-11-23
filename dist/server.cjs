"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target2) => (target2 = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target2, "default", { value: mod, enumerable: true }) : target2,
  mod
));

// src/config.ts
var import_node_crypto = require("node:crypto");

// src/shared/types.ts
var LANGS = ["en", "uk"];
var DEFAULT_LANG = "en";
var DEFAULT_NOTIFY = {
  enabled: true,
  grid: true,
  batteryLow: true,
  batteryLowPct: 30,
  overload: true,
  overloadPct: 90,
  fault: true,
  offline: true,
  connection: true
};
var DEFAULT_USABLE_PCT = { lifepo4: 90, liion: 80, lead: 50 };
var DEFAULT_BATTERY = {
  chemistry: "lifepo4",
  usablePct: DEFAULT_USABLE_PCT.lifepo4,
  batteries: []
};

// src/config.ts
var MIN_POLL_SEC = 30;
var MIN_DIRECT_SEC = 10;
function bool(v, fallback) {
  if (v === void 0 || v.trim() === "") return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}
function int(v, fallback, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) && v?.trim() ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
}
function loadConfig(env = process.env) {
  const missing = [];
  const need = (name) => {
    const v = env[name]?.trim();
    if (!v) missing.push(name);
    return v ?? "";
  };
  const username = need("DESS_USERNAME");
  const botToken = need("TELEGRAM_BOT_TOKEN");
  const joinCode = need("JOIN_CODE");
  const sha12 = env.DESS_PASSWORD_SHA1?.trim().toLowerCase();
  const plain = env.DESS_PASSWORD;
  let passwordSha1 = "";
  if (sha12 && /^[0-9a-f]{40}$/.test(sha12)) passwordSha1 = sha12;
  else if (plain) passwordSha1 = (0, import_node_crypto.createHash)("sha1").update(plain).digest("hex");
  else missing.push("DESS_PASSWORD or DESS_PASSWORD_SHA1");
  if (missing.length) throw new Error(`Missing or invalid settings: ${missing.join(", ")}`);
  const lang = env.LANGUAGE?.trim();
  return {
    username,
    passwordSha1,
    botToken,
    joinCode,
    language: LANGS.includes(lang ?? "") ? lang : "uk",
    pollSec: int(env.POLL_SEC, 60, MIN_POLL_SEC, 600),
    directSec: env.DIRECT_SEC?.trim() === "0" ? 0 : int(env.DIRECT_SEC, 10, MIN_DIRECT_SEC, 600),
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
      connection: bool(env.NOTIFY_CONNECTION, DEFAULT_NOTIFY.connection)
    },
    dataDir: env.DATA_DIR?.trim() || "./data",
    announceStart: bool(env.ANNOUNCE_START, false)
  };
}

// src/telegram.ts
var TelegramError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
  code;
};
var Telegram = class {
  constructor(token) {
    this.token = token;
  }
  token;
  async call(method, body, timeoutMs = 2e4) {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) throw new TelegramError(data?.description ?? `HTTP ${res.status}`, data?.error_code ?? res.status);
    return data.result;
  }
  /** Plain text, no formatting: nothing in a message needs escaping. `replyMarkup` shows or hides the keyboard under the input field. */
  sendMessage(chatId, text, replyMarkup) {
    return this.call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...replyMarkup ? { reply_markup: replyMarkup } : {} });
  }
  /** Long polling: returns as soon as something arrives, or after `waitSec` seconds with an empty list. */
  getUpdates(offset, waitSec = 30) {
    return this.call("getUpdates", { offset, timeout: waitSec, allowed_updates: ["message"] }, (waitSec + 10) * 1e3);
  }
};

// src/texts.ts
var TEXTS = {
  en: {
    welcome: "Hi! Send /start and the access code to receive inverter notifications.",
    needCode: "Send /start followed by the access code, for example: /start 12345",
    wrongCode: "Wrong access code.",
    alreadyIn: "You are already subscribed.",
    subscribed: "Done. You will now receive inverter notifications. The Status button shows the current readings, /stop unsubscribes.",
    unsubscribed: "Unsubscribed. Send /start and the access code to subscribe again.",
    notSubscribed: "You are not subscribed. Send /start and the access code first.",
    started: "The notification service has started.",
    statusButton: "Status",
    noData: "No data from the inverter yet. Try again in a minute.",
    help: "Press Status for the current readings. /stop unsubscribes.",
    status: (s) => `Battery: ${s.battery}
Load: ${s.load}
PV: ${s.pv}
Grid: ${s.grid}
Updated: ${s.updated}`,
    gridOn: (v) => `present, ${v}`,
    gridOff: "none"
  },
  uk: {
    welcome: "\u041F\u0440\u0438\u0432\u0456\u0442! \u041D\u0430\u0434\u0456\u0448\u043B\u0456\u0442\u044C /start \u0456 \u043A\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0443, \u0449\u043E\u0431 \u043E\u0442\u0440\u0438\u043C\u0443\u0432\u0430\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440.",
    needCode: "\u041D\u0430\u0434\u0456\u0448\u043B\u0456\u0442\u044C /start \u0456 \u043A\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0443, \u043D\u0430\u043F\u0440\u0438\u043A\u043B\u0430\u0434: /start 12345",
    wrongCode: "\u041D\u0435\u0432\u0456\u0440\u043D\u0438\u0439 \u043A\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0443.",
    alreadyIn: "\u0412\u0438 \u0432\u0436\u0435 \u043F\u0456\u0434\u043F\u0438\u0441\u0430\u043D\u0456.",
    subscribed: "\u0413\u043E\u0442\u043E\u0432\u043E. \u0422\u0435\u043F\u0435\u0440 \u0432\u0438 \u043E\u0442\u0440\u0438\u043C\u0443\u0432\u0430\u0442\u0438\u043C\u0435\u0442\u0435 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043F\u0440\u043E \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440. \u041A\u043D\u043E\u043F\u043A\u0430 \xAB\u0421\u0442\u0430\u0442\u0443\u0441\xBB \u043F\u043E\u043A\u0430\u0437\u0443\u0454 \u043F\u043E\u0442\u043E\u0447\u043D\u0456 \u0434\u0430\u043D\u0456, /stop \u0441\u043A\u0430\u0441\u043E\u0432\u0443\u0454 \u043F\u0456\u0434\u043F\u0438\u0441\u043A\u0443.",
    unsubscribed: "\u041F\u0456\u0434\u043F\u0438\u0441\u043A\u0443 \u0441\u043A\u0430\u0441\u043E\u0432\u0430\u043D\u043E. \u041D\u0430\u0434\u0456\u0448\u043B\u0456\u0442\u044C /start \u0456 \u043A\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0443, \u0449\u043E\u0431 \u043F\u0456\u0434\u043F\u0438\u0441\u0430\u0442\u0438\u0441\u044F \u0437\u043D\u043E\u0432\u0443.",
    notSubscribed: "\u0412\u0438 \u043D\u0435 \u043F\u0456\u0434\u043F\u0438\u0441\u0430\u043D\u0456. \u0421\u043F\u0435\u0440\u0448\u0443 \u043D\u0430\u0434\u0456\u0448\u043B\u0456\u0442\u044C /start \u0456 \u043A\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0443.",
    started: "\u0421\u0435\u0440\u0432\u0456\u0441 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u044C \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u043E.",
    statusButton: "\u0421\u0442\u0430\u0442\u0443\u0441",
    noData: "\u0414\u0430\u043D\u0438\u0445 \u0432\u0456\u0434 \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440\u0430 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0437\u0430 \u0445\u0432\u0438\u043B\u0438\u043D\u0443.",
    help: "\u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \xAB\u0421\u0442\u0430\u0442\u0443\u0441\xBB, \u0449\u043E\u0431 \u043F\u043E\u0431\u0430\u0447\u0438\u0442\u0438 \u043F\u043E\u0442\u043E\u0447\u043D\u0456 \u0434\u0430\u043D\u0456. /stop \u0441\u043A\u0430\u0441\u043E\u0432\u0443\u0454 \u043F\u0456\u0434\u043F\u0438\u0441\u043A\u0443.",
    status: (s) => `\u0411\u0430\u0442\u0430\u0440\u0435\u044F: ${s.battery}
\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F: ${s.load}
PV: ${s.pv}
\u041C\u0435\u0440\u0435\u0436\u0430: ${s.grid}
\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ${s.updated}`,
    gridOn: (v) => `\u0454, ${v}`,
    gridOff: "\u043D\u0435\u043C\u0430\u0454"
  }
};

// src/bot.ts
var GRID_MIN_V = 80;
var fmtW = (w) => w === null ? "\u2014" : Math.abs(w) >= 1e3 ? `${(w / 1e3).toFixed(2)} kW` : `${Math.round(w)} W`;
var Bot = class {
  constructor(d) {
    this.d = d;
  }
  d;
  offset = 0;
  stopped = false;
  get t() {
    return TEXTS[this.d.language];
  }
  /** Sends a notification to every subscriber; a chat that blocked the bot is removed. */
  async broadcast(title, body) {
    const text = `${title}
${body}`;
    for (const id of this.d.subscribers.list()) {
      try {
        await this.d.tg.sendMessage(id, text);
      } catch (e) {
        if (e instanceof TelegramError && (e.code === 403 || e.code === 400)) {
          this.d.subscribers.remove(id);
          this.d.log(`removed an unreachable chat (${e.code})`);
        } else {
          this.d.log(`could not send a message: ${e instanceof Error ? e.message : "error"}`);
        }
      }
    }
  }
  start() {
    this.stopped = false;
    void this.loop();
  }
  stop() {
    this.stopped = true;
  }
  async loop() {
    while (!this.stopped) {
      try {
        const updates = await this.d.tg.getUpdates(this.offset, 30);
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) => this.d.log(`handler failed: ${e instanceof Error ? e.message : "error"}`));
        }
      } catch (e) {
        this.d.log(`getUpdates failed: ${e instanceof Error ? e.message : "error"}`);
        await new Promise((r) => setTimeout(r, 1e4));
      }
    }
  }
  /**
   * Every reply carries the keyboard state: the Status button for a subscribed chat, nothing for
   * anyone else. So the button appears right after the access code is accepted, vanishes after
   * /stop, and an existing subscriber gets it back with any message they send.
   */
  async reply(chatId, text) {
    const markup = this.d.subscribers.has(chatId) ? { keyboard: [[{ text: this.t.statusButton }]], resize_keyboard: true, is_persistent: true } : { remove_keyboard: true };
    await this.d.tg.sendMessage(chatId, text, markup).catch(() => void 0);
  }
  /** Public so tests can drive it without a network. */
  async handle(u) {
    const m = u.message;
    if (!m?.text || m.chat.type !== "private") return;
    const chatId = m.chat.id;
    const [cmdRaw, ...rest] = m.text.trim().split(/\s+/);
    const cmd = m.text.trim() === this.t.statusButton ? "/status" : cmdRaw.toLowerCase().replace(/@.*$/, "");
    const t = this.t;
    if (cmd === "/start") {
      if (this.d.subscribers.has(chatId)) return this.reply(chatId, t.alreadyIn);
      if (rest.length === 0) return this.reply(chatId, t.needCode);
      if (rest[0] !== this.d.joinCode) return this.reply(chatId, t.wrongCode);
      this.d.subscribers.add(chatId);
      this.d.log("a chat subscribed");
      return this.reply(chatId, t.subscribed);
    }
    if (cmd === "/stop") {
      return this.reply(chatId, this.d.subscribers.remove(chatId) ? t.unsubscribed : t.notSubscribed);
    }
    if (cmd === "/status") {
      if (!this.d.subscribers.has(chatId)) return this.reply(chatId, t.notSubscribed);
      return this.reply(chatId, this.statusText());
    }
    return this.reply(chatId, this.d.subscribers.has(chatId) ? t.help : t.welcome);
  }
  statusText(now = Date.now()) {
    const s = this.d.latest();
    const t = this.t;
    if (!s) return t.noData;
    const ageMin = Math.max(0, Math.round((now - s.fetchedAt) / 6e4));
    const gridOn = s.grid.voltage !== null ? s.grid.voltage > GRID_MIN_V : s.grid.present;
    return t.status({
      battery: s.battery.capacity === null ? "\u2014" : `${Math.round(s.battery.capacity)}%`,
      load: fmtW(s.load.power),
      pv: fmtW(s.pv.power),
      grid: gridOn ? t.gridOn(s.grid.voltage === null ? "\u2014" : `${Math.round(s.grid.voltage)} V`) : t.gridOff,
      updated: ageMin === 0 ? new Date(s.fetchedAt).toLocaleTimeString(this.d.language === "uk" ? "uk-UA" : "en-GB") : `${ageMin} min`
    });
  }
};

// src/shared/i18n/en.ts
var en = {
  lang: {
    /** Locale used for number and date formatting. */
    locale: "en-GB"
  },
  appName: "Forse Monitoring",
  units: {
    w: "W",
    kw: "kW",
    v: "V",
    a: "A",
    hz: "Hz",
    va: "VA",
    kwh: "kWh",
    ah: "Ah",
    pct: "%",
    sec: "s",
    min: "min",
    hour: "h",
    day: "d"
  },
  /** Relative-time wording. */
  time: {
    ago: "ago",
    over: "over",
    underMinute: "under a minute"
  },
  login: {
    title: "Sign in",
    hint: "Use your dessmonitor.com username and password. The password is not stored: only its encrypted hash is kept.",
    username: "Username",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in\u2026",
    empty: "Enter your username and password",
    failed: "Sign-in failed"
  },
  header: {
    refresh: "Refresh",
    refreshing: "Requesting\u2026",
    refreshed: "Received",
    refreshFailed: "No response",
    logout: "Sign out",
    interval: "Refresh every",
    updated: "Updated",
    deviceTime: "Device data"
  },
  connection: {
    idle: "Not connected",
    connecting: "Connecting\u2026",
    ok: "Online",
    live: "Live",
    error: "No connection"
  },
  deviceStatus: ["Normal", "Offline", "Fault", "Standby", "Warning"],
  cards: {
    battery: "Battery",
    pv: "PV",
    grid: "Grid",
    load: "Load"
  },
  fields: {
    voltage: "Voltage",
    chargeCurrent: "Charge current",
    dischargeCurrent: "Discharge current",
    power: "Power",
    status: "Status",
    frequency: "Frequency",
    percent: "Load",
    apparent: "Apparent power"
  },
  flow: {
    pv: "PV",
    grid: "Grid",
    inverter: "Inverter",
    battery: "Battery",
    load: "Load",
    charging: "charging",
    discharging: "discharging",
    aria: "Energy flow diagram",
    details: (label) => `${label}: details`
  },
  params: {
    title: "All parameters",
    show: "Show all parameters",
    search: "Search\u2026",
    name: "Parameter",
    value: "Value"
  },
  settings: {
    title: "Settings",
    open: "Settings",
    close: "Close",
    tabs: { notify: "Notifications", battery: "Battery", time: "Data time", general: "General" },
    general: {
      source: {
        title: "Data source",
        cloud: "Cloud (DessMonitor)",
        local: "Local (datalogger on this network)",
        cloudHint: "Readings come from the DessMonitor cloud, as before.",
        localHint: "Readings come straight from the datalogger on your network, without the cloud. The datalogger connects to this computer, so Windows may ask to allow incoming connections on port 8899: allow it for private networks. Turn off other programs that use the datalogger locally (for example Home Assistant), since it serves one at a time.",
        logger: "Datalogger",
        notChosen: "not chosen yet",
        find: "Find datalogger",
        finding: "Searching\u2026 about 10 seconds",
        none: "No datalogger answered. Check that it is powered and on the same network.",
        status: { off: "Off", no_logger: "Find and choose the datalogger", searching: "Searching\u2026", connecting: "Connecting\u2026", live: "Receiving live data", error: "No data from the datalogger" },
        lastData: "Last data"
      },
      direct: {
        title: "Direct requests",
        testHint: "Sends up to three read-only queries to the inverter, a few seconds apart, and changes nothing. Use it to check the connection if the status shows an error.",
        live: {
          label: "Use direct requests for live data",
          hint: "Reads the inverter at the update interval chosen on the main screen (10 s or more) instead of waiting for the datalogger upload, about once a minute. The regular update then runs at most every 30 s.",
          status: { off: "Off", connecting: "Connecting\u2026", live: "Receiving live data", error: "Cannot read the inverter" },
          lastData: "Last data",
          fallback: "The app keeps using regular updates meanwhile, so nothing stops working."
        },
        run: "Check connection",
        running: "Checking\u2026 up to 20 seconds",
        verdict: {
          works: "The inverter answered. Direct requests work.",
          no_reply: "No usable answer from the inverter. Direct requests do not seem to work for this device.",
          cloud_error: "The cloud refused the request.",
          not_ready: "Sign in and wait for the first data first.",
          busy: "A test is already running.",
          cooldown: "Tested a moment ago. Wait half a minute."
        },
        outcome: { ok: "answer received", no_reply: "no answer", bad_reply: "unusable answer", cloud_error: "refused by the cloud" },
        step: "Query",
        values: {
          gridVoltage: "Grid voltage, V",
          outputVoltage: "Output voltage, V",
          outputPower: "Output power, W",
          batteryVoltage: "Battery voltage, V",
          batteryCurrent: "Battery current, A",
          pvPower: "PV power, W",
          loadPercent: "Load, %"
        },
        axpert: "Reply"
      },
      language: "Interface language",
      hint: "The windows reload to apply the new language.",
      /** Language names are always shown in their own language. */
      names: { en: "English", uk: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430" }
    },
    battery: {
      chemistry: "Battery type",
      chemistries: { lifepo4: "LiFePO\u2084 (lithium iron phosphate)", liion: "Li-ion", lead: "Lead-acid (AGM / GEL)" },
      usable: "Usable capacity",
      usableHint: "The forecast does not plan to discharge below the remaining reserve: usually down to 10% for LiFePO\u2084 and not below 50% for lead-acid.",
      list: "Batteries",
      empty: "Add your batteries to get a runtime forecast.",
      name: "Name",
      namePlaceholder: "Battery",
      add: "+ Add battery",
      remove: "Remove",
      total: "Total",
      usableNow: "usable",
      note: "Batteries are summed by energy (Ah \xD7 V), so the wiring layout does not matter. The forecast uses the average power over 5 minutes and assumes it stays constant."
    },
    notify: {
      enabled: "Show notifications",
      grid: "Grid",
      gridHint: "lost or restored",
      batteryLow: "Low battery",
      batteryLowHint: "threshold",
      overload: "High load",
      overloadHint: "load above",
      fault: "Inverter fault",
      faultHint: "a fault and its recovery",
      offline: "Inverter offline",
      offlineHint: "the datalogger stopped responding",
      connection: "No cloud connection",
      connectionHint: "if lost for more than a minute",
      test: "Send test notification",
      note: "The app keeps running in the tray after the window is closed."
    },
    shift: "Data time correction",
    shiftNone: "No correction",
    auto: "Detect automatically",
    shiftHint: "The cloud reports data time in its own time zone. If it is off by a few hours, set the correction manually or click \u201CDetect automatically\u201D (while the data is definitely fresh). In the preview, \u201Cago\u201D should read seconds or minutes.",
    preview: "Device data right now",
    raw: "From the cloud",
    future: "time is in the future: reduce the correction",
    noData: "No data yet"
  },
  tabs: { flow: "Diagram", history: "History" },
  widget: {
    toggle: "Mini widget",
    title: "Monitoring",
    fade: "Make more transparent",
    unfade: "Make opaque again",
    openApp: "Open the app",
    close: "Close widget",
    waiting: "Waiting for data\u2026",
    noLink: "no link",
    sun: "PV",
    load: "Load",
    grid: "Grid",
    battery: "Battery"
  },
  forecast: {
    lasts: "lasts",
    toFull: "to 100%:",
    until: "to",
    atLimit: "charge at the lower limit",
    unconfigured: "set the capacity in settings",
    unknown: "no data",
    idle: "battery is barely working",
    label: "Forecast",
    usableNow: "Available above the limit"
  },
  history: {
    periods: { hour: "Hour", day: "Day", week: "Week", month: "Month" },
    chartView: "Chart",
    tableView: "Table",
    export: "Export CSV",
    exported: "Saved",
    exportFailed: "Not saved",
    loading: "Loading history\u2026",
    emptyTitle: "No history yet",
    emptyHint: "Data accumulates while the app is running (it keeps running in the tray). The first points appear after a few polls.",
    powerTitle: "Power",
    batteryTitle: "Battery charge",
    energyTitle: "Energy for the period",
    byDay: "By day",
    measurements: "Samples",
    pv: "PV",
    load: "Load",
    grid: "Grid",
    battery: "Charge",
    batV: "Battery voltage",
    pvEnergy: "Generated",
    loadEnergy: "Consumed",
    gridEnergy: "From grid",
    batIn: "Into battery",
    batOut: "From battery",
    date: "Date",
    time: "Time"
  },
  hint: "Click an element of the diagram to see details",
  waiting: "Waiting for the first data\u2026",
  gridOff: "no grid",
  /**
   * Translations of status texts that come from the cloud in English, keyed by the
   * lower-cased original. Empty for English: the cloud text is shown as is.
   */
  status: {},
  /** Strings used by the main process. */
  main: {
    notify: {
      gridLost: "Grid power lost",
      gridLostBody: (cap) => cap !== null ? `The inverter is running on battery. Charge: ${cap}%.` : "Grid voltage is absent.",
      gridBack: "Grid power restored",
      gridBackBody: (volts) => `Voltage ${volts} V.`,
      batteryLow: "Low battery",
      batteryLowBody: (cap, threshold) => `${cap}% left: at or below the ${threshold}% threshold.`,
      overload: "High load",
      overloadBody: (pct, power) => `Inverter load is ${pct}% (${power}).`,
      fault: "Inverter fault",
      faultBody: (state) => state ? `State: ${state}.` : "The inverter reports a fault.",
      faultCleared: "Fault cleared",
      faultClearedBody: "The inverter is operating normally again.",
      offline: "Inverter offline",
      offlineBody: "The datalogger has stopped reporting to the cloud.",
      online: "Inverter back online",
      onlineBody: "Data is arriving again.",
      connectionLost: "No connection to the cloud",
      connectionLostFallback: "Unable to retrieve data.",
      connectionBack: "Connection restored",
      connectionBackBody: "Data is arriving again.",
      test: "Test notification: everything works."
    },
    tray: {
      open: "Open",
      widget: "Mini widget",
      quit: "Quit",
      noData: "No data",
      tooltip: (battery, solar, load) => `Battery: ${battery}  \xB7  PV: ${solar}
Load: ${load}`
    },
    dialog: {
      exportTitle: "Export history"
    },
    csv: {
      delimiter: ",",
      decimal: ".",
      headers: [
        "Time",
        "PV, W",
        "Load, W",
        "Grid, W",
        "Battery, W (+charge / \u2212discharge)",
        "Battery charge, %",
        "Battery voltage, V",
        "Grid voltage, V"
      ]
    },
    /** The parameters read straight from the datalogger (the local source). */
    localParams: {
      groups: { grid: "Grid", output: "Output", battery: "Battery", pv: "PV", temperature: "Temperature" },
      names: {
        gridVoltage: "Grid voltage",
        gridFrequency: "Grid frequency",
        outputVoltage: "Output voltage",
        outputFrequency: "Output frequency",
        outputPower: "Output active power",
        outputApparentPower: "Output apparent power",
        loadPercent: "Load",
        batteryVoltage: "Battery voltage",
        batteryCurrent: "Battery current",
        batteryPower: "Battery power",
        batterySoc: "Battery charge",
        pvVoltage: "PV voltage",
        pvCurrent: "PV current",
        pvPower: "PV power",
        dcdcTemperature: "DC-DC temperature",
        heatSinkTemperature: "Heat sink temperature"
      }
    },
    errors: {
      noCredentials: "No saved credentials to sign in with",
      noDevices: "No devices found in this account",
      timeout: "The server is not responding (timeout)",
      noConnection: "Cannot reach the server",
      localPortBusy: "The port for the datalogger is already in use",
      localNoConnection: "The datalogger does not connect to this computer",
      unknown: "Unknown error"
    }
  }
};

// src/shared/i18n/uk.ts
var uk = {
  lang: {
    locale: "uk-UA"
  },
  appName: "Forse Monitoring",
  units: {
    w: "\u0412\u0442",
    kw: "\u043A\u0412\u0442",
    v: "\u0412",
    a: "\u0410",
    hz: "\u0413\u0446",
    va: "\u0412\u0410",
    kwh: "\u043A\u0412\u0442\xB7\u0433\u043E\u0434",
    ah: "\u0410\xB7\u0433\u043E\u0434",
    pct: "%",
    sec: "\u0441",
    min: "\u0445\u0432",
    hour: "\u0433\u043E\u0434",
    day: "\u0434"
  },
  time: {
    ago: "\u0442\u043E\u043C\u0443",
    over: "\u043F\u043E\u043D\u0430\u0434",
    underMinute: "\u043C\u0435\u043D\u0448\u0435 \u0445\u0432\u0438\u043B\u0438\u043D\u0438"
  },
  login: {
    title: "\u0412\u0445\u0456\u0434 \u0432 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441",
    hint: "\u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435 \u043B\u043E\u0433\u0456\u043D \u0456 \u043F\u0430\u0440\u043E\u043B\u044C \u0432\u0456\u0434 dessmonitor.com. \u041F\u0430\u0440\u043E\u043B\u044C \u043D\u0435 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0454\u0442\u044C\u0441\u044F: \u043B\u0438\u0448\u0430\u0454\u0442\u044C\u0441\u044F \u0442\u0456\u043B\u044C\u043A\u0438 \u0439\u043E\u0433\u043E \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u0438\u0439 \u0445\u0435\u0448.",
    username: "\u041B\u043E\u0433\u0456\u043D",
    password: "\u041F\u0430\u0440\u043E\u043B\u044C",
    submit: "\u0423\u0432\u0456\u0439\u0442\u0438",
    submitting: "\u0412\u0445\u043E\u0434\u0438\u043C\u043E\u2026",
    empty: "\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u043B\u043E\u0433\u0456\u043D \u0456 \u043F\u0430\u0440\u043E\u043B\u044C",
    failed: "\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0443\u0432\u0456\u0439\u0442\u0438"
  },
  header: {
    refresh: "\u041E\u043D\u043E\u0432\u0438\u0442\u0438",
    refreshing: "\u0417\u0430\u043F\u0438\u0442\u2026",
    refreshed: "\u041E\u0442\u0440\u0438\u043C\u0430\u043D\u043E",
    refreshFailed: "\u041D\u0435\u043C\u0430\u0454 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0456",
    logout: "\u0412\u0438\u0439\u0442\u0438",
    interval: "\u041E\u043D\u043E\u0432\u043B\u044E\u0432\u0430\u0442\u0438 \u043A\u043E\u0436\u043D\u0456",
    updated: "\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
    deviceTime: "\u0414\u0430\u043D\u0456 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E"
  },
  connection: {
    idle: "\u041D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    connecting: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F\u2026",
    ok: "\u041D\u0430 \u0437\u0432\u2019\u044F\u0437\u043A\u0443",
    live: "\u041D\u0430\u0436\u0438\u0432\u043E",
    error: "\u041D\u0435\u043C\u0430\u0454 \u0437\u0432\u2019\u044F\u0437\u043A\u0443"
  },
  deviceStatus: ["\u041D\u043E\u0440\u043C\u0430", "\u041D\u0435 \u0432 \u043C\u0435\u0440\u0435\u0436\u0456", "\u0410\u0432\u0430\u0440\u0456\u044F", "\u041E\u0447\u0456\u043A\u0443\u0432\u0430\u043D\u043D\u044F", "\u041F\u043E\u043F\u0435\u0440\u0435\u0434\u0436\u0435\u043D\u043D\u044F"],
  cards: {
    battery: "\u0411\u0430\u0442\u0430\u0440\u0435\u044F",
    pv: "\u0421\u043E\u043D\u044F\u0447\u043D\u0456 \u043F\u0430\u043D\u0435\u043B\u0456",
    grid: "\u041C\u0435\u0440\u0435\u0436\u0430",
    load: "\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F"
  },
  fields: {
    voltage: "\u041D\u0430\u043F\u0440\u0443\u0433\u0430",
    chargeCurrent: "\u0421\u0442\u0440\u0443\u043C \u0437\u0430\u0440\u044F\u0434\u0443",
    dischargeCurrent: "\u0421\u0442\u0440\u0443\u043C \u0440\u043E\u0437\u0440\u044F\u0434\u0443",
    power: "\u041F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C",
    status: "\u0421\u0442\u0430\u043D",
    frequency: "\u0427\u0430\u0441\u0442\u043E\u0442\u0430",
    percent: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F",
    apparent: "\u041F\u043E\u0432\u043D\u0430 \u043F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C"
  },
  flow: {
    pv: "PV",
    grid: "\u041C\u0435\u0440\u0435\u0436\u0430",
    inverter: "\u0406\u043D\u0432\u0435\u0440\u0442\u043E\u0440",
    battery: "\u0411\u0430\u0442\u0430\u0440\u0435\u044F",
    load: "\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F",
    charging: "\u0437\u0430\u0440\u044F\u0434",
    discharging: "\u0440\u043E\u0437\u0440\u044F\u0434",
    aria: "\u0421\u0445\u0435\u043C\u0430 \u043F\u043E\u0442\u043E\u043A\u0456\u0432 \u0435\u043D\u0435\u0440\u0433\u0456\u0457",
    details: (label) => `${label}: \u0434\u043E\u043A\u043B\u0430\u0434\u043D\u0456\u0448\u0435`
  },
  params: {
    title: "\u0423\u0441\u0456 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0438",
    show: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0438",
    search: "\u041F\u043E\u0448\u0443\u043A\u2026",
    name: "\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440",
    value: "\u0417\u043D\u0430\u0447\u0435\u043D\u043D\u044F"
  },
  settings: {
    title: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F",
    open: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F",
    close: "\u0417\u0430\u043A\u0440\u0438\u0442\u0438",
    tabs: { notify: "\u0421\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F", battery: "\u0411\u0430\u0442\u0430\u0440\u0435\u044F", time: "\u0427\u0430\u0441 \u0434\u0430\u043D\u0438\u0445", general: "\u0417\u0430\u0433\u0430\u043B\u044C\u043D\u0456" },
    general: {
      source: {
        title: "\u0414\u0436\u0435\u0440\u0435\u043B\u043E \u0434\u0430\u043D\u0438\u0445",
        cloud: "\u0425\u043C\u0430\u0440\u0430 (DessMonitor)",
        local: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u043E (\u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440 \u0443 \u0446\u0456\u0439 \u043C\u0435\u0440\u0435\u0436\u0456)",
        cloudHint: "\u0414\u0430\u043D\u0456 \u043D\u0430\u0434\u0445\u043E\u0434\u044F\u0442\u044C \u0456\u0437 \u0445\u043C\u0430\u0440\u0438 DessMonitor, \u044F\u043A \u0456 \u0440\u0430\u043D\u0456\u0448\u0435.",
        localHint: "\u0414\u0430\u043D\u0456 \u043D\u0430\u0434\u0445\u043E\u0434\u044F\u0442\u044C \u043D\u0430\u043F\u0440\u044F\u043C\u0443 \u0437 \u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440\u0430 \u0443 \u0432\u0430\u0448\u0456\u0439 \u043C\u0435\u0440\u0435\u0436\u0456, \u0431\u0435\u0437 \u0445\u043C\u0430\u0440\u0438. \u0414\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0430\u0454\u0442\u044C\u0441\u044F \u0434\u043E \u0446\u044C\u043E\u0433\u043E \u043A\u043E\u043C\u043F\u2019\u044E\u0442\u0435\u0440\u0430, \u0442\u043E\u043C\u0443 Windows \u043C\u043E\u0436\u0435 \u0437\u0430\u043F\u0438\u0442\u0430\u0442\u0438 \u0434\u043E\u0437\u0432\u0456\u043B \u043D\u0430 \u0432\u0445\u0456\u0434\u043D\u0456 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u043D\u0430 \u043F\u043E\u0440\u0442\u0443 8899: \u0434\u043E\u0437\u0432\u043E\u043B\u044C\u0442\u0435 \u0434\u043B\u044F \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u0438\u0445 \u043C\u0435\u0440\u0435\u0436. \u0412\u0438\u043C\u043A\u043D\u0456\u0442\u044C \u0456\u043D\u0448\u0456 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u0438, \u0449\u043E \u043F\u0440\u0430\u0446\u044E\u044E\u0442\u044C \u0437 \u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440\u043E\u043C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E (\u043D\u0430\u043F\u0440\u0438\u043A\u043B\u0430\u0434 Home Assistant), \u0431\u043E \u0432\u0456\u043D \u043E\u0431\u0441\u043B\u0443\u0433\u043E\u0432\u0443\u0454 \u043B\u0438\u0448\u0435 \u043E\u0434\u043D\u0443.",
        logger: "\u0414\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440",
        notChosen: "\u0449\u0435 \u043D\u0435 \u043E\u0431\u0440\u0430\u043D\u043E",
        find: "\u0417\u043D\u0430\u0439\u0442\u0438 \u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440",
        finding: "\u041F\u043E\u0448\u0443\u043A\u2026 \u0431\u043B\u0438\u0437\u044C\u043A\u043E 10 \u0441\u0435\u043A\u0443\u043D\u0434",
        none: "\u0416\u043E\u0434\u0435\u043D \u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440 \u043D\u0435 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0432. \u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435, \u0449\u043E \u0432\u0456\u043D \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u0438\u0439 \u0456 \u0432 \u0442\u0456\u0439 \u0441\u0430\u043C\u0456\u0439 \u043C\u0435\u0440\u0435\u0436\u0456.",
        status: { off: "\u0412\u0438\u043C\u043A\u043D\u0435\u043D\u043E", no_logger: "\u0417\u043D\u0430\u0439\u0434\u0456\u0442\u044C \u0456 \u043E\u0431\u0435\u0440\u0456\u0442\u044C \u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440", searching: "\u041F\u043E\u0448\u0443\u043A\u2026", connecting: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F\u2026", live: "\u041E\u0442\u0440\u0438\u043C\u0443\u0454\u043C\u043E \u0434\u0430\u043D\u0456 \u043D\u0430\u0436\u0438\u0432\u043E", error: "\u041D\u0435\u043C\u0430\u0454 \u0434\u0430\u043D\u0438\u0445 \u0432\u0456\u0434 \u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440\u0430" },
        lastData: "\u041E\u0441\u0442\u0430\u043D\u043D\u0456 \u0434\u0430\u043D\u0456"
      },
      direct: {
        title: "\u041F\u0440\u044F\u043C\u0456 \u0437\u0430\u043F\u0438\u0442\u0438",
        testHint: "\u041D\u0430\u0434\u0441\u0438\u043B\u0430\u0454 \u0434\u043E \u0442\u0440\u044C\u043E\u0445 \u0437\u0430\u043F\u0438\u0442\u0456\u0432 \u0434\u043E \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440\u0430 \u043B\u0438\u0448\u0435 \u043D\u0430 \u0447\u0438\u0442\u0430\u043D\u043D\u044F, \u0437 \u043F\u0430\u0443\u0437\u043E\u044E \u0432 \u043A\u0456\u043B\u044C\u043A\u0430 \u0441\u0435\u043A\u0443\u043D\u0434, \u0456 \u043D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043C\u0456\u043D\u044E\u0454. \u0421\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u0439\u0442\u0435\u0441\u044F, \u0449\u043E\u0431 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438 \u0437\u2019\u0454\u0434\u043D\u0430\u043D\u043D\u044F, \u044F\u043A\u0449\u043E \u0441\u0442\u0430\u0442\u0443\u0441 \u043F\u043E\u043A\u0430\u0437\u0443\u0454 \u043F\u043E\u043C\u0438\u043B\u043A\u0443.",
        live: {
          label: "\u0412\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0432\u0430\u0442\u0438 \u043F\u0440\u044F\u043C\u0456 \u0437\u0430\u043F\u0438\u0442\u0438 \u0434\u043B\u044F \u0436\u0438\u0432\u0438\u0445 \u0434\u0430\u043D\u0438\u0445",
          hint: "\u041E\u043F\u0438\u0442\u0443\u0454 \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440 \u0437 \u0456\u043D\u0442\u0435\u0440\u0432\u0430\u043B\u043E\u043C, \u043E\u0431\u0440\u0430\u043D\u0438\u043C \u043D\u0430 \u0433\u043E\u043B\u043E\u0432\u043D\u043E\u043C\u0443 \u0435\u043A\u0440\u0430\u043D\u0456 (10 \u0441 \u0456 \u0431\u0456\u043B\u044C\u0448\u0435), \u0430 \u043D\u0435 \u0447\u0435\u043A\u0430\u0454 \u043D\u0430 \u0432\u0438\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440\u0430, \u043F\u0440\u0438\u0431\u043B\u0438\u0437\u043D\u043E \u0440\u0430\u0437 \u043D\u0430 \u0445\u0432\u0438\u043B\u0438\u043D\u0443. \u0417\u0432\u0438\u0447\u0430\u0439\u043D\u0435 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u0442\u043E\u0434\u0456 \u0439\u0434\u0435 \u043D\u0435 \u0447\u0430\u0441\u0442\u0456\u0448\u0435 \u043D\u0456\u0436 \u0440\u0430\u0437 \u043D\u0430 30 \u0441.",
          status: { off: "\u0412\u0438\u043C\u043A\u043D\u0435\u043D\u043E", connecting: "\u041F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F\u2026", live: "\u041E\u0442\u0440\u0438\u043C\u0443\u0454\u043C\u043E \u0434\u0430\u043D\u0456 \u043D\u0430\u0436\u0438\u0432\u043E", error: "\u041D\u0435 \u0432\u0434\u0430\u0454\u0442\u044C\u0441\u044F \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u0438 \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440" },
          lastData: "\u041E\u0441\u0442\u0430\u043D\u043D\u0456 \u0434\u0430\u043D\u0456",
          fallback: "\u0422\u0438\u043C \u0447\u0430\u0441\u043E\u043C \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043E\u043A \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0454\u0442\u044C\u0441\u044F \u0437\u0432\u0438\u0447\u0430\u0439\u043D\u0438\u043C\u0438 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F\u043C\u0438, \u0442\u043E\u0436 \u043D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u0454 \u043F\u0440\u0430\u0446\u044E\u0432\u0430\u0442\u0438."
        },
        run: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438 \u0437\u2019\u0454\u0434\u043D\u0430\u043D\u043D\u044F",
        running: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430\u2026 \u0434\u043E 20 \u0441\u0435\u043A\u0443\u043D\u0434",
        verdict: {
          works: "\u0406\u043D\u0432\u0435\u0440\u0442\u043E\u0440 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0432. \u041F\u0440\u044F\u043C\u0456 \u0437\u0430\u043F\u0438\u0442\u0438 \u043F\u0440\u0430\u0446\u044E\u044E\u0442\u044C.",
          no_reply: "\u041F\u0440\u0438\u0434\u0430\u0442\u043D\u043E\u0457 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0456 \u0432\u0456\u0434 \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440\u0430 \u043D\u0435\u043C\u0430\u0454. \u0421\u0445\u043E\u0436\u0435, \u043F\u0440\u044F\u043C\u0456 \u0437\u0430\u043F\u0438\u0442\u0438 \u0434\u043B\u044F \u0446\u044C\u043E\u0433\u043E \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E \u043D\u0435 \u043F\u0440\u0430\u0446\u044E\u044E\u0442\u044C.",
          cloud_error: "\u0425\u043C\u0430\u0440\u0430 \u0432\u0456\u0434\u0445\u0438\u043B\u0438\u043B\u0430 \u0437\u0430\u043F\u0438\u0442.",
          not_ready: "\u0421\u043F\u0435\u0440\u0448\u0443 \u0443\u0432\u0456\u0439\u0434\u0456\u0442\u044C \u0456 \u0434\u043E\u0447\u0435\u043A\u0430\u0439\u0442\u0435\u0441\u044F \u043F\u0435\u0440\u0448\u0438\u0445 \u0434\u0430\u043D\u0438\u0445.",
          busy: "\u0422\u0435\u0441\u0442 \u0443\u0436\u0435 \u0432\u0438\u043A\u043E\u043D\u0443\u0454\u0442\u044C\u0441\u044F.",
          cooldown: "\u0429\u043E\u0439\u043D\u043E \u0442\u0435\u0441\u0442\u0443\u0432\u0430\u043B\u0438. \u0417\u0430\u0447\u0435\u043A\u0430\u0439\u0442\u0435 \u043F\u0456\u0432 \u0445\u0432\u0438\u043B\u0438\u043D\u0438."
        },
        outcome: { ok: "\u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u044C \u043E\u0442\u0440\u0438\u043C\u0430\u043D\u043E", no_reply: "\u043D\u0435\u043C\u0430\u0454 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0456", bad_reply: "\u043D\u0435\u043F\u0440\u0438\u0434\u0430\u0442\u043D\u0430 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u044C", cloud_error: "\u0432\u0456\u0434\u0445\u0438\u043B\u0435\u043D\u043E \u0445\u043C\u0430\u0440\u043E\u044E" },
        step: "\u0417\u0430\u043F\u0438\u0442",
        values: {
          gridVoltage: "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 \u043C\u0435\u0440\u0435\u0436\u0456, \u0412",
          outputVoltage: "\u0412\u0438\u0445\u0456\u0434\u043D\u0430 \u043D\u0430\u043F\u0440\u0443\u0433\u0430, \u0412",
          outputPower: "\u0412\u0438\u0445\u0456\u0434\u043D\u0430 \u043F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C, \u0412\u0442",
          batteryVoltage: "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 \u0431\u0430\u0442\u0430\u0440\u0435\u0457, \u0412",
          batteryCurrent: "\u0421\u0442\u0440\u0443\u043C \u0431\u0430\u0442\u0430\u0440\u0435\u0457, \u0410",
          pvPower: "\u041F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C PV, \u0412\u0442",
          loadPercent: "\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F, %"
        },
        axpert: "\u0412\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u044C"
      },
      language: "\u041C\u043E\u0432\u0430 \u0456\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0443",
      hint: "\u0429\u043E\u0431 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u0432\u0430\u0442\u0438 \u043D\u043E\u0432\u0443 \u043C\u043E\u0432\u0443, \u0432\u0456\u043A\u043D\u0430 \u043F\u0435\u0440\u0435\u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0430\u0442\u044C\u0441\u044F.",
      names: { en: "English", uk: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430" }
    },
    battery: {
      chemistry: "\u0422\u0438\u043F \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
      chemistries: { lifepo4: "LiFePO\u2084 (\u043B\u0456\u0442\u0456\u0439-\u0437\u0430\u043B\u0456\u0437\u043E-\u0444\u043E\u0441\u0444\u0430\u0442)", liion: "Li-ion", lead: "\u0421\u0432\u0438\u043D\u0446\u0435\u0432\u043E-\u043A\u0438\u0441\u043B\u043E\u0442\u043D\u0430 (AGM / GEL)" },
      usable: "\u041A\u043E\u0440\u0438\u0441\u043D\u0430 \u0454\u043C\u043D\u0456\u0441\u0442\u044C",
      usableHint: "\u041D\u0438\u0436\u0447\u0435 \u0446\u044C\u043E\u0433\u043E \u0437\u0430\u043F\u0430\u0441\u0443 \u0440\u043E\u0437\u0440\u044F\u0434 \u0443 \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0456 \u043D\u0435 \u0432\u0440\u0430\u0445\u043E\u0432\u0443\u0454\u0442\u044C\u0441\u044F: \u0434\u043B\u044F LiFePO\u2084 \u0437\u0430\u0437\u0432\u0438\u0447\u0430\u0439 \u0434\u043E 10% \u0437\u0430\u043B\u0438\u0448\u043A\u0443, \u0434\u043B\u044F \u0441\u0432\u0438\u043D\u0446\u0435\u0432\u0438\u0445 \u043D\u0435 \u043D\u0438\u0436\u0447\u0435 50%.",
      list: "\u0411\u0430\u0442\u0430\u0440\u0435\u0457",
      empty: "\u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u0431\u0430\u0442\u0430\u0440\u0435\u0457, \u0449\u043E\u0431 \u0437\u2019\u044F\u0432\u0438\u0432\u0441\u044F \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u0447\u0430\u0441\u0443 \u0440\u043E\u0431\u043E\u0442\u0438.",
      name: "\u041D\u0430\u0437\u0432\u0430",
      namePlaceholder: "\u0411\u0430\u0442\u0430\u0440\u0435\u044F",
      add: "+ \u0414\u043E\u0434\u0430\u0442\u0438 \u0431\u0430\u0442\u0430\u0440\u0435\u044E",
      remove: "\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438",
      total: "\u0420\u0430\u0437\u043E\u043C",
      usableNow: "\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E",
      note: "\u0411\u0430\u0442\u0430\u0440\u0435\u0457 \u0434\u043E\u0434\u0430\u044E\u0442\u044C\u0441\u044F \u0437\u0430 \u0435\u043D\u0435\u0440\u0433\u0456\u0454\u044E (\u0410\xB7\u0433\u043E\u0434 \xD7 \u0412), \u0441\u0445\u0435\u043C\u0430 \u0437\u2019\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u043D\u0435 \u0432\u0430\u0436\u043B\u0438\u0432\u0430. \u041F\u0440\u043E\u0433\u043D\u043E\u0437 \u0440\u0430\u0445\u0443\u0454\u0442\u044C\u0441\u044F \u0437\u0430 \u0441\u0435\u0440\u0435\u0434\u043D\u044C\u043E\u044E \u043F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044E \u0437\u0430 5 \u0445\u0432\u0438\u043B\u0438\u043D \u0456 \u043F\u0440\u0438\u043F\u0443\u0441\u043A\u0430\u0454, \u0449\u043E \u0432\u043E\u043D\u0430 \u043D\u0435 \u0437\u043C\u0456\u043D\u0438\u0442\u044C\u0441\u044F."
    },
    notify: {
      enabled: "\u041F\u043E\u043A\u0430\u0437\u0443\u0432\u0430\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F",
      grid: "\u041C\u0435\u0440\u0435\u0436\u0430",
      gridHint: "\u0437\u043D\u0438\u043A\u043B\u0430 \u0430\u0431\u043E \u0437\u2019\u044F\u0432\u0438\u043B\u0430\u0441\u044C",
      batteryLow: "\u041D\u0438\u0437\u044C\u043A\u0438\u0439 \u0437\u0430\u0440\u044F\u0434 \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
      batteryLowHint: "\u043F\u043E\u0440\u0456\u0433",
      overload: "\u0412\u0438\u0441\u043E\u043A\u0435 \u043D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F",
      overloadHint: "\u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0432\u0456\u0434",
      fault: "\u041D\u0435\u0441\u043F\u0440\u0430\u0432\u043D\u0456\u0441\u0442\u044C \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440\u0430",
      faultHint: "\u0430\u0432\u0430\u0440\u0456\u044F \u0442\u0430 \u0457\u0457 \u0443\u0441\u0443\u043D\u0435\u043D\u043D\u044F",
      offline: "\u0406\u043D\u0432\u0435\u0440\u0442\u043E\u0440 \u043D\u0435 \u0432 \u043C\u0435\u0440\u0435\u0436\u0456",
      offlineHint: "\u043B\u043E\u0433\u0435\u0440 \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u0432 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0442\u0438",
      connection: "\u041D\u0435\u043C\u0430\u0454 \u0437\u0432\u2019\u044F\u0437\u043A\u0443 \u0437 \u0445\u043C\u0430\u0440\u043E\u044E",
      connectionHint: "\u044F\u043A\u0449\u043E \u0437\u043D\u0438\u043A\u043D\u0443\u0432 \u0431\u0456\u043B\u044C\u0448 \u043D\u0456\u0436 \u043D\u0430 \u0445\u0432\u0438\u043B\u0438\u043D\u0443",
      test: "\u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F",
      note: "\u0417\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043E\u043A \u043F\u0440\u0430\u0446\u044E\u0454 \u0432 \u0442\u0440\u0435\u0457 \u0439 \u043F\u0456\u0441\u043B\u044F \u0437\u0430\u043A\u0440\u0438\u0442\u0442\u044F \u0432\u0456\u043A\u043D\u0430."
    },
    shift: "\u041F\u043E\u043F\u0440\u0430\u0432\u043A\u0430 \u0447\u0430\u0441\u0443 \u0434\u0430\u043D\u0438\u0445",
    shiftNone: "\u0411\u0435\u0437 \u043F\u043E\u043F\u0440\u0430\u0432\u043A\u0438",
    auto: "\u041F\u0456\u0434\u0456\u0431\u0440\u0430\u0442\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E",
    shiftHint: "\u0425\u043C\u0430\u0440\u0430 \u043D\u0430\u0434\u0441\u0438\u043B\u0430\u0454 \u0447\u0430\u0441 \u0434\u0430\u043D\u0438\u0445 \u0443 \u0441\u0432\u043E\u0454\u043C\u0443 \u0447\u0430\u0441\u043E\u0432\u043E\u043C\u0443 \u043F\u043E\u044F\u0441\u0456. \u042F\u043A\u0449\u043E \u0432\u0456\u043D \u0432\u0456\u0434\u0441\u0442\u0430\u0454 \u0430\u0431\u043E \u043F\u043E\u0441\u043F\u0456\u0448\u0430\u0454 \u043D\u0430 \u043A\u0456\u043B\u044C\u043A\u0430 \u0433\u043E\u0434\u0438\u043D, \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u043F\u043E\u043F\u0440\u0430\u0432\u043A\u0443 \u0432\u0440\u0443\u0447\u043D\u0443 \u0430\u0431\u043E \u043D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \xAB\u041F\u0456\u0434\u0456\u0431\u0440\u0430\u0442\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E\xBB (\u043A\u043E\u043B\u0438 \u0434\u0430\u043D\u0456 \u0442\u043E\u0447\u043D\u043E \u0441\u0432\u0456\u0436\u0456). \u0423 \u043F\u043E\u043F\u0435\u0440\u0435\u0434\u043D\u044C\u043E\u043C\u0443 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0456 \xAB\u0442\u043E\u043C\u0443\xBB \u043C\u0430\u0454 \u043F\u043E\u043A\u0430\u0437\u0443\u0432\u0430\u0442\u0438 \u0441\u0435\u043A\u0443\u043D\u0434\u0438 \u0430\u0431\u043E \u0445\u0432\u0438\u043B\u0438\u043D\u0438.",
    preview: "\u0414\u0430\u043D\u0456 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E \u0437\u0430\u0440\u0430\u0437",
    raw: "\u0417 \u0445\u043C\u0430\u0440\u0438",
    future: "\u0447\u0430\u0441 \u0456\u0437 \u043C\u0430\u0439\u0431\u0443\u0442\u043D\u044C\u043E\u0433\u043E: \u0437\u043C\u0435\u043D\u0448\u0442\u0435 \u043F\u043E\u043F\u0440\u0430\u0432\u043A\u0443",
    noData: "\u0414\u0430\u043D\u0438\u0445 \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454"
  },
  tabs: { flow: "\u0421\u0445\u0435\u043C\u0430", history: "\u0406\u0441\u0442\u043E\u0440\u0456\u044F" },
  widget: {
    toggle: "\u041C\u0456\u043D\u0456-\u0432\u0456\u0434\u0436\u0435\u0442",
    title: "\u041C\u043E\u043D\u0456\u0442\u043E\u0440\u0438\u043D\u0433",
    fade: "\u0417\u0440\u043E\u0431\u0438\u0442\u0438 \u043F\u0440\u043E\u0437\u043E\u0440\u0456\u0448\u0438\u043C",
    unfade: "\u041F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u0438 \u043D\u0435\u043F\u0440\u043E\u0437\u043E\u0440\u0456\u0441\u0442\u044C",
    openApp: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043E\u043A",
    close: "\u0417\u0430\u043A\u0440\u0438\u0442\u0438 \u0432\u0456\u0434\u0436\u0435\u0442",
    waiting: "\u041E\u0447\u0456\u043A\u0443\u0454\u043C\u043E \u0434\u0430\u043D\u0456\u2026",
    noLink: "\u043D\u0435\u043C\u0430\u0454 \u0437\u0432\u2019\u044F\u0437\u043A\u0443",
    sun: "PV",
    load: "\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F",
    grid: "\u041C\u0435\u0440\u0435\u0436\u0430",
    battery: "\u0411\u0430\u0442\u0430\u0440\u0435\u044F"
  },
  forecast: {
    lasts: "\u0432\u0438\u0441\u0442\u0430\u0447\u0438\u0442\u044C \u043D\u0430",
    toFull: "\u0434\u043E 100%:",
    until: "\u0434\u043E",
    atLimit: "\u0437\u0430\u0440\u044F\u0434 \u043D\u0430 \u043D\u0438\u0436\u043D\u0456\u0439 \u043C\u0435\u0436\u0456",
    unconfigured: "\u0432\u043A\u0430\u0436\u0456\u0442\u044C \u0454\u043C\u043D\u0456\u0441\u0442\u044C \u0443 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u0445",
    unknown: "\u043D\u0435\u043C\u0430\u0454 \u0434\u0430\u043D\u0438\u0445",
    idle: "\u0431\u0430\u0442\u0430\u0440\u0435\u044F \u043C\u0430\u0439\u0436\u0435 \u043D\u0435 \u043F\u0440\u0430\u0446\u044E\u0454",
    label: "\u041F\u0440\u043E\u0433\u043D\u043E\u0437",
    usableNow: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0434\u043E \u043C\u0435\u0436\u0456"
  },
  history: {
    periods: { hour: "\u0413\u043E\u0434\u0438\u043D\u0430", day: "\u0414\u043E\u0431\u0430", week: "\u0422\u0438\u0436\u0434\u0435\u043D\u044C", month: "\u041C\u0456\u0441\u044F\u0446\u044C" },
    chartView: "\u0413\u0440\u0430\u0444\u0456\u043A",
    tableView: "\u0422\u0430\u0431\u043B\u0438\u0446\u044F",
    export: "\u0415\u043A\u0441\u043F\u043E\u0440\u0442 CSV",
    exported: "\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E",
    exportFailed: "\u041D\u0435 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E",
    loading: "\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0456\u0441\u0442\u043E\u0440\u0456\u0457\u2026",
    emptyTitle: "\u0406\u0441\u0442\u043E\u0440\u0456\u0457 \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454",
    emptyHint: "\u0414\u0430\u043D\u0456 \u043D\u0430\u043A\u043E\u043F\u0438\u0447\u0443\u044E\u0442\u044C\u0441\u044F, \u043F\u043E\u043A\u0438 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043E\u043A \u0437\u0430\u043F\u0443\u0449\u0435\u043D\u0438\u0439 (\u0432\u0456\u043D \u043F\u0440\u0430\u0446\u044E\u0454 \u0456 \u0432 \u0442\u0440\u0435\u0457). \u041F\u0435\u0440\u0448\u0456 \u0442\u043E\u0447\u043A\u0438 \u0437\u2019\u044F\u0432\u043B\u044F\u0442\u044C\u0441\u044F \u043F\u0456\u0441\u043B\u044F \u043A\u0456\u043B\u044C\u043A\u043E\u0445 \u043E\u043F\u0438\u0442\u0443\u0432\u0430\u043D\u044C.",
    powerTitle: "\u041F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C",
    batteryTitle: "\u0417\u0430\u0440\u044F\u0434 \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
    energyTitle: "\u0415\u043D\u0435\u0440\u0433\u0456\u044F \u0437\u0430 \u043F\u0435\u0440\u0456\u043E\u0434",
    byDay: "\u0417\u0430 \u0434\u043D\u044F\u043C\u0438",
    measurements: "\u0412\u0438\u043C\u0456\u0440\u0438",
    pv: "PV",
    load: "\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F",
    grid: "\u041C\u0435\u0440\u0435\u0436\u0430",
    battery: "\u0417\u0430\u0440\u044F\u0434",
    batV: "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 \u0410\u041A\u0411",
    pvEnergy: "\u0412\u0438\u0440\u043E\u0431\u043B\u0435\u043D\u043E",
    loadEnergy: "\u0421\u043F\u043E\u0436\u0438\u0442\u043E",
    gridEnergy: "\u0417 \u043C\u0435\u0440\u0435\u0436\u0456",
    batIn: "\u0423 \u0431\u0430\u0442\u0430\u0440\u0435\u044E",
    batOut: "\u0417 \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
    date: "\u0414\u0430\u0442\u0430",
    time: "\u0427\u0430\u0441"
  },
  hint: "\u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u043D\u0430 \u0435\u043B\u0435\u043C\u0435\u043D\u0442 \u0441\u0445\u0435\u043C\u0438, \u0449\u043E\u0431 \u043F\u043E\u0431\u0430\u0447\u0438\u0442\u0438 \u043F\u043E\u0434\u0440\u043E\u0431\u0438\u0446\u0456",
  waiting: "\u041E\u0447\u0456\u043A\u0443\u0454\u043C\u043E \u043F\u0435\u0440\u0448\u0456 \u0434\u0430\u043D\u0456\u2026",
  gridOff: "\u043D\u0435\u043C\u0430\u0454 \u043C\u0435\u0440\u0435\u0436\u0456",
  /** Cloud status texts (English, lower-cased) mapped to Ukrainian. */
  status: {
    "line mode": "\u0420\u043E\u0431\u043E\u0442\u0430 \u0432\u0456\u0434 \u043C\u0435\u0440\u0435\u0436\u0456",
    "battery mode": "\u0420\u043E\u0431\u043E\u0442\u0430 \u0432\u0456\u0434 \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
    "standby mode": "\u041E\u0447\u0456\u043A\u0443\u0432\u0430\u043D\u043D\u044F",
    "fault mode": "\u0410\u0432\u0430\u0440\u0456\u044F",
    "power on mode": "\u0423\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u043D\u044F",
    "power saving mode": "\u0415\u043D\u0435\u0440\u0433\u043E\u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043D\u044F",
    "charging batteries": "\u0422\u0440\u0438\u0432\u0430\u0454 \u0437\u0430\u0440\u044F\u0434",
    "battery discharging": "\u0420\u043E\u0437\u0440\u044F\u0434",
    "battery is full": "\u0417\u0430\u0440\u044F\u0434\u0436\u0435\u043D\u0430",
    "not charging": "\u041D\u0435 \u0437\u0430\u0440\u044F\u0434\u0436\u0430\u0454\u0442\u044C\u0441\u044F",
    idle: "\u041F\u0440\u043E\u0441\u0442\u0456\u0439",
    "utility first": "\u041C\u0435\u0440\u0435\u0436\u0430",
    utility: "\u041C\u0435\u0440\u0435\u0436\u0430",
    solar: "PV",
    "solar first": "PV",
    sbu: "PV \u2192 \u0411\u0430\u0442\u0430\u0440\u0435\u044F \u2192 \u041C\u0435\u0440\u0435\u0436\u0430",
    "solar and mains": "PV \u0456 \u043C\u0435\u0440\u0435\u0436\u0430",
    "solar only": "\u041B\u0438\u0448\u0435 PV",
    "solar priority": "\u041F\u0440\u0456\u043E\u0440\u0438\u0442\u0435\u0442 PV",
    "pv undervoltage": "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 PV \u0437\u0430\u043D\u0438\u0436\u0435\u043D\u0430",
    "mains discharge": "\u041C\u0435\u0440\u0435\u0436\u0430 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430",
    "load on (normal)": "\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u0435"
  },
  main: {
    notify: {
      gridLost: "\u0417\u043D\u0438\u043A\u043B\u0430 \u043C\u0435\u0440\u0435\u0436\u0430",
      gridLostBody: (cap) => cap !== null ? `\u0406\u043D\u0432\u0435\u0440\u0442\u043E\u0440 \u043F\u0440\u0430\u0446\u044E\u0454 \u0432\u0456\u0434 \u0431\u0430\u0442\u0430\u0440\u0435\u0457. \u0417\u0430\u0440\u044F\u0434: ${cap}%.` : "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 \u043C\u0435\u0440\u0435\u0436\u0456 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u044F.",
      gridBack: "\u0417\u2019\u044F\u0432\u0438\u043B\u0430\u0441\u044C \u043C\u0435\u0440\u0435\u0436\u0430",
      gridBackBody: (volts) => `\u041D\u0430\u043F\u0440\u0443\u0433\u0430 ${volts} \u0412.`,
      batteryLow: "\u041D\u0438\u0437\u044C\u043A\u0438\u0439 \u0437\u0430\u0440\u044F\u0434 \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
      batteryLowBody: (cap, threshold) => `\u041B\u0438\u0448\u0438\u043B\u043E\u0441\u044C ${cap}%: \u043D\u0435 \u0432\u0438\u0449\u0435 \u043F\u043E\u0440\u043E\u0433\u0430 ${threshold}%.`,
      overload: "\u0412\u0438\u0441\u043E\u043A\u0435 \u043D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F",
      overloadBody: (pct, power) => `\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440\u0430 ${pct}% (${power}).`,
      fault: "\u041D\u0435\u0441\u043F\u0440\u0430\u0432\u043D\u0456\u0441\u0442\u044C \u0456\u043D\u0432\u0435\u0440\u0442\u043E\u0440\u0430",
      faultBody: (state) => state ? `\u0421\u0442\u0430\u043D: ${state}.` : "\u0406\u043D\u0432\u0435\u0440\u0442\u043E\u0440 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u044F\u0454 \u043F\u0440\u043E \u0430\u0432\u0430\u0440\u0456\u044E.",
      faultCleared: "\u041D\u0435\u0441\u043F\u0440\u0430\u0432\u043D\u0456\u0441\u0442\u044C \u0443\u0441\u0443\u043D\u0435\u043D\u043E",
      faultClearedBody: "\u0406\u043D\u0432\u0435\u0440\u0442\u043E\u0440 \u0437\u043D\u043E\u0432\u0443 \u043F\u0440\u0430\u0446\u044E\u0454 \u0448\u0442\u0430\u0442\u043D\u043E.",
      offline: "\u0406\u043D\u0432\u0435\u0440\u0442\u043E\u0440 \u043D\u0435 \u0432 \u043C\u0435\u0440\u0435\u0436\u0456",
      offlineBody: "\u041B\u043E\u0433\u0435\u0440 \u043D\u0435 \u0432\u0438\u0445\u043E\u0434\u0438\u0442\u044C \u043D\u0430 \u0437\u0432\u2019\u044F\u0437\u043E\u043A \u0456\u0437 \u0445\u043C\u0430\u0440\u043E\u044E.",
      online: "\u0406\u043D\u0432\u0435\u0440\u0442\u043E\u0440 \u0437\u043D\u043E\u0432\u0443 \u0432 \u043C\u0435\u0440\u0435\u0436\u0456",
      onlineBody: "\u0414\u0430\u043D\u0456 \u043D\u0430\u0434\u0445\u043E\u0434\u044F\u0442\u044C.",
      connectionLost: "\u041D\u0435\u043C\u0430\u0454 \u0437\u0432\u2019\u044F\u0437\u043A\u0443 \u0437 \u0445\u043C\u0430\u0440\u043E\u044E",
      connectionLostFallback: "\u041D\u0435 \u0432\u0434\u0430\u0454\u0442\u044C\u0441\u044F \u043E\u0442\u0440\u0438\u043C\u0430\u0442\u0438 \u0434\u0430\u043D\u0456.",
      connectionBack: "\u0417\u0432\u2019\u044F\u0437\u043E\u043A \u0432\u0456\u0434\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
      connectionBackBody: "\u0414\u0430\u043D\u0456 \u0437\u043D\u043E\u0432\u0443 \u043D\u0430\u0434\u0445\u043E\u0434\u044F\u0442\u044C.",
      test: "\u0422\u0435\u0441\u0442\u043E\u0432\u0435 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F: \u0443\u0441\u0435 \u043F\u0440\u0430\u0446\u044E\u0454."
    },
    tray: {
      open: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438",
      widget: "\u041C\u0456\u043D\u0456-\u0432\u0456\u0434\u0436\u0435\u0442",
      quit: "\u0412\u0438\u0439\u0442\u0438",
      noData: "\u041D\u0435\u043C\u0430\u0454 \u0434\u0430\u043D\u0438\u0445",
      tooltip: (battery, solar, load) => `\u0411\u0430\u0442\u0430\u0440\u0435\u044F: ${battery}  \xB7  PV: ${solar}
\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F: ${load}`
    },
    dialog: {
      exportTitle: "\u0415\u043A\u0441\u043F\u043E\u0440\u0442 \u0456\u0441\u0442\u043E\u0440\u0456\u0457"
    },
    csv: {
      delimiter: ";",
      decimal: ",",
      headers: [
        "\u0427\u0430\u0441",
        "PV, \u0412\u0442",
        "\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F, \u0412\u0442",
        "\u041C\u0435\u0440\u0435\u0436\u0430, \u0412\u0442",
        "\u0411\u0430\u0442\u0430\u0440\u0435\u044F, \u0412\u0442 (+\u0437\u0430\u0440\u044F\u0434 / \u2212\u0440\u043E\u0437\u0440\u044F\u0434)",
        "\u0417\u0430\u0440\u044F\u0434 \u0431\u0430\u0442\u0430\u0440\u0435\u0457, %",
        "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 \u0431\u0430\u0442\u0430\u0440\u0435\u0457, \u0412",
        "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 \u043C\u0435\u0440\u0435\u0436\u0456, \u0412"
      ]
    },
    /** Параметри, що читаються напряму з даталогера (локальне джерело). */
    localParams: {
      groups: { grid: "\u041C\u0435\u0440\u0435\u0436\u0430", output: "\u0412\u0438\u0445\u0456\u0434", battery: "\u0411\u0430\u0442\u0430\u0440\u0435\u044F", pv: "PV", temperature: "\u0422\u0435\u043C\u043F\u0435\u0440\u0430\u0442\u0443\u0440\u0430" },
      names: {
        gridVoltage: "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 \u043C\u0435\u0440\u0435\u0436\u0456",
        gridFrequency: "\u0427\u0430\u0441\u0442\u043E\u0442\u0430 \u043C\u0435\u0440\u0435\u0436\u0456",
        outputVoltage: "\u0412\u0438\u0445\u0456\u0434\u043D\u0430 \u043D\u0430\u043F\u0440\u0443\u0433\u0430",
        outputFrequency: "\u0412\u0438\u0445\u0456\u0434\u043D\u0430 \u0447\u0430\u0441\u0442\u043E\u0442\u0430",
        outputPower: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430 \u0432\u0438\u0445\u0456\u0434\u043D\u0430 \u043F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C",
        outputApparentPower: "\u041F\u043E\u0432\u043D\u0430 \u0432\u0438\u0445\u0456\u0434\u043D\u0430 \u043F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C",
        loadPercent: "\u041D\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F",
        batteryVoltage: "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
        batteryCurrent: "\u0421\u0442\u0440\u0443\u043C \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
        batteryPower: "\u041F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
        batterySoc: "\u0417\u0430\u0440\u044F\u0434 \u0431\u0430\u0442\u0430\u0440\u0435\u0457",
        pvVoltage: "\u041D\u0430\u043F\u0440\u0443\u0433\u0430 PV",
        pvCurrent: "\u0421\u0442\u0440\u0443\u043C PV",
        pvPower: "\u041F\u043E\u0442\u0443\u0436\u043D\u0456\u0441\u0442\u044C PV",
        dcdcTemperature: "\u0422\u0435\u043C\u043F\u0435\u0440\u0430\u0442\u0443\u0440\u0430 DC-DC",
        heatSinkTemperature: "\u0422\u0435\u043C\u043F\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u0440\u0430\u0434\u0456\u0430\u0442\u043E\u0440\u0430"
      }
    },
    errors: {
      noCredentials: "\u041D\u0435\u043C\u0430\u0454 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445 \u0434\u0430\u043D\u0438\u0445 \u0434\u043B\u044F \u0432\u0445\u043E\u0434\u0443",
      noDevices: "\u0412 \u043E\u0431\u043B\u0456\u043A\u043E\u0432\u043E\u043C\u0443 \u0437\u0430\u043F\u0438\u0441\u0456 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0436\u043E\u0434\u043D\u043E\u0433\u043E \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E",
      timeout: "\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0454 (\u0442\u0430\u0439\u043C-\u0430\u0443\u0442)",
      localPortBusy: "\u041F\u043E\u0440\u0442 \u0434\u043B\u044F \u0434\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440\u0430 \u0432\u0436\u0435 \u0437\u0430\u0439\u043D\u044F\u0442\u0438\u0439",
      localNoConnection: "\u0414\u0430\u0442\u0430\u043B\u043E\u0433\u0435\u0440 \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0430\u0454\u0442\u044C\u0441\u044F \u0434\u043E \u0446\u044C\u043E\u0433\u043E \u043A\u043E\u043C\u043F\u2019\u044E\u0442\u0435\u0440\u0430",
      noConnection: "\u041D\u0435\u043C\u0430\u0454 \u0437\u2019\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u0456\u0437 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u043C",
      unknown: "\u041D\u0435\u0432\u0456\u0434\u043E\u043C\u0430 \u043F\u043E\u043C\u0438\u043B\u043A\u0430"
    }
  }
};

// src/shared/i18n/index.ts
var dictionaries = { en, uk };
var dict = (lang) => dictionaries[LANGS.includes(lang) ? lang : DEFAULT_LANG];
var translateStatus = (lang, text) => dict(lang).status[text.trim().toLowerCase()] ?? text;

// src/main/dess/client.ts
var import_node_crypto2 = __toESM(require("node:crypto"));
var import_node_querystring = __toESM(require("node:querystring"));
var BASE_URL = "https://web.dessmonitor.com";
var COMPANY_KEY = "bnrl_frRFjEz8Mkn";
var RENEW_BEFORE_MS = 60 * 60 * 1e3;
var DessApiError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
  code;
};
var sha1 = (s) => import_node_crypto2.default.createHash("sha1").update(s).digest("hex");
function toUriStr(params) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== void 0 && v !== null)
  );
  return import_node_querystring.default.stringify(clean).replace(/%20/g, "+").replace(/%2B/g, "+").replace(/%3A/g, ":").replace(/%2C/g, ",").replace(/%40/g, "@").replace(/%24/g, "$").replace(/%26/g, "&").replace(/%3D/g, "=").replace(/%28/g, "(").replace(/%29/g, ")");
}
async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(2e4) });
  if (!res.ok) throw new DessApiError(`HTTP ${res.status}`);
  return res.json();
}
async function authenticate(username, passwordSha1) {
  const salt = Date.now().toString();
  const params = {
    action: "authSource",
    usr: username,
    source: "1",
    "company-key": COMPANY_KEY
  };
  const uri = toUriStr(params);
  const sign = sha1(`${salt}${passwordSha1}&${uri}`);
  const data = await getJson(`${BASE_URL}/public/?sign=${sign}&salt=${salt}&${uri}`);
  if (data.err !== 0 || !data.dat) {
    throw new DessApiError(data.desc || "Authentication failed", data.err);
  }
  return { ...data.dat, issuedAt: Date.now() };
}
function isAuthFresh(auth) {
  if (!auth) return false;
  return auth.issuedAt + auth.expire * 1e3 - Date.now() > RENEW_BEFORE_MS;
}
async function publicRequest(auth, params) {
  const salt = Date.now().toString();
  const uri = toUriStr(params);
  const sign = sha1(`${salt}${auth.secret}${auth.token}&${uri}`);
  const url = `${BASE_URL}/public/?sign=${sign}&salt=${salt}&token=${auth.token}&${uri}`;
  const data = await getJson(url);
  if (data.err !== 0) {
    throw new DessApiError(data.desc || `API error (${data.err})`, data.err);
  }
  return data.dat;
}
async function queryDeviceList(auth) {
  const dat = await publicRequest(auth, {
    action: "webQueryDeviceEs",
    i18n: "en_US",
    source: "1",
    page: "0",
    pagesize: "15"
  });
  return dat.device ?? [];
}
var target = (t) => ({ ...t, source: "1" });
function queryLastData(auth, t) {
  return publicRequest(auth, {
    action: "querySPDeviceLastData",
    i18n: "en_US",
    ...target(t)
  });
}
function queryEnergyFlow(auth, t) {
  return publicRequest(auth, {
    action: "webQueryDeviceEnergyFlowEs",
    ...target(t)
  });
}
async function sendDirectCommand(auth, t, hexFrame) {
  const dat = await publicRequest(auth, {
    action: "sendCmdToDevice",
    ...target(t),
    cmd: hexFrame
  });
  if (typeof dat === "string") return dat;
  if (dat && typeof dat === "object") {
    const inner = dat.dat;
    if (typeof inner === "string") return inner;
  }
  return "";
}

// src/main/dess/flow-cache.ts
var BLOCKS = ["bc_status", "gd_status", "pv_status", "bt_status"];
var FLOW_STALE_MS = 3 * 6e4;
var hasFlowData = (flow) => !!flow && typeof flow === "object" && BLOCKS.some((k) => Array.isArray(flow[k]) && flow[k].length > 0);
var FlowCache = class {
  last = null;
  resolve(raw, now = Date.now()) {
    if (hasFlowData(raw)) {
      this.last = { data: raw, at: now };
      return raw;
    }
    if (this.last && now - this.last.at <= FLOW_STALE_MS) return this.last.data;
    return {};
  }
  clear() {
    this.last = null;
  }
};

// src/main/dess/mapper.ts
var num = (v) => {
  if (v === void 0 || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function finder(pars) {
  const all = Object.values(pars).flat();
  const byId = new Map(all.map((p) => [p.id, p]));
  const str = (...ids) => {
    for (const id of ids) {
      const p = byId.get(id);
      if (p && p.val !== void 0 && p.val !== "") return p.val;
    }
    return void 0;
  };
  const n = (...ids) => num(str(...ids));
  const fuzzy = (include, exclude, group = "bt_") => {
    const p = (pars[group] ?? []).find(
      (i) => include.test(i.id) && !(exclude && exclude.test(i.id)) && num(i.val) !== null
    );
    return p ? num(p.val) : null;
  };
  const fuzzyStr = (include) => (pars["bt_"] ?? []).find((i) => include.test(i.id) && i.val !== "")?.val;
  return { str, n, fuzzy, fuzzyStr };
}
function flowPowerW(flow, block, par) {
  const item = flow?.[block]?.find((i) => i.par === par);
  const v = num(item?.val);
  if (v === null) return null;
  const unit = String(item?.unit ?? "kW").toLowerCase();
  return unit === "w" ? v : v * 1e3;
}
function derivedBatteryStatus(power) {
  if (power === null) return void 0;
  if (power > 10) return "Charging Batteries";
  if (power < -10) return "Battery Discharging";
  return "Idle";
}
function buildSnapshot(device, last, flow) {
  const { str, n, fuzzy, fuzzyStr } = finder(last.pars ?? {});
  const batVoltage = n("bt_battery_voltage");
  const chargeI = n("bt_battery_charging_current", "bt_charging_current") ?? fuzzy(/charg.*curr|curr.*charg/, /discharg|total|max|utility/);
  const dischargeI = n("bt_battery_discharge_current", "bt_discharge_current") ?? fuzzy(/discharg.*curr|curr.*discharg/);
  const pvPower = n("pv_output_power") ?? flowPowerW(flow, "pv_status", "pv_output_power");
  const loadPower = flowPowerW(flow, "bc_status", "load_active_power") ?? n("bc_output_active_power", "output_power");
  const gridVoltage = n("gd_ac_input_voltage", "gd_grid_voltage") ?? fuzzy(/volt/, /range|nominal|rated/, "gd_");
  const gridFlowItem = flow?.gd_status?.find((i) => i.par === "grid_active_power");
  const workState = str("sy_status") ?? "";
  const flowGridW = flowPowerW(flow, "gd_status", "grid_active_power");
  const gridPresent = gridVoltage !== null ? gridVoltage > 80 : /battery/i.test(workState) ? false : /line|mains|utility|bypass|grid/i.test(workState) ? true : gridFlowItem?.status === 1 || (flowGridW ?? 0) > 10;
  let batPower = null;
  if (batVoltage !== null && (chargeI !== null || dischargeI !== null)) {
    batPower = batVoltage * ((chargeI ?? 0) - (dischargeI ?? 0));
  }
  if (batPower === null || batPower === 0 && !gridPresent && (loadPower ?? 0) > 20) {
    const flowBat = flowPowerW(flow, "bt_status", "battery_active_power");
    if (flowBat !== null && flowBat !== 0) batPower = flowBat;
    else if (!gridPresent && loadPower !== null) batPower = (pvPower ?? 0) - loadPower;
  }
  const dischargeShown = dischargeI ?? (batPower !== null && batVoltage ? Math.max(0, -batPower) / batVoltage : null);
  const chargeShown = chargeI ?? (batPower !== null && batVoltage ? Math.max(0, batPower) / batVoltage : null);
  let gridPower = flowGridW;
  if (gridPower === null && loadPower !== null) {
    gridPower = gridPresent ? Math.max(0, loadPower + Math.max(0, batPower ?? 0) - (pvPower ?? 0)) : 0;
  }
  const params = Object.entries(last.pars ?? {}).flatMap(
    ([group, list]) => list.map((p) => ({
      group,
      id: p.id,
      name: p.par,
      value: p.val,
      unit: p.unit
    }))
  );
  for (const [block, list] of Object.entries(flow ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const i of list) {
      params.push({
        group: `flow:${block}`,
        id: `flow.${i.par}`,
        name: `${i.par} (status ${i.status})`,
        value: String(i.val),
        unit: i.unit
      });
    }
  }
  return {
    fetchedAt: Date.now(),
    deviceTime: last.gts,
    device,
    battery: {
      voltage: batVoltage,
      capacity: n("bt_battery_capacity"),
      chargeCurrent: chargeShown,
      dischargeCurrent: dischargeShown,
      power: batPower,
      status: str("bt_battery_status") ?? fuzzyStr(/status|state/) ?? derivedBatteryStatus(batPower)
    },
    pv: {
      voltage: n("pv_input_voltage", "pv_voltage"),
      power: pvPower,
      status: str("pv_status")
    },
    grid: {
      voltage: gridVoltage,
      frequency: n("gd_ac_input_frequency", "gd_grid_frequency") ?? fuzzy(/freq/, void 0, "gd_"),
      power: gridPower,
      present: gridPresent,
      status: str("gd_mains_status")
    },
    load: {
      power: loadPower,
      apparentPower: n("bc_output_apparent_power"),
      percent: n("bc_load_percent", "bc_battery_capacity"),
      voltage: n("bc_output_voltage"),
      frequency: n("bc_output_frequency"),
      status: str("bc_load_status")
    },
    system: {
      state: str("sy_status"),
      outputPriority: str("bc_output_source_priority"),
      chargerPriority: str("bt_charger_source_priority")
    },
    params
  };
}

// src/main/direct-feed.ts
var import_node_events = require("node:events");

// src/main/dess/direct.ts
var toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
function fromHex(text) {
  const t = text.trim();
  if (t === "" || t === "null") return null;
  const out = [];
  for (const tok of t.split(/\s+/)) {
    if (!/^[0-9a-fA-F]{1,2}$/.test(tok)) return null;
    out.push(parseInt(tok, 16));
  }
  return out;
}
function crc16Modbus(bytes) {
  let crc = 65535;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? crc >> 1 ^ 40961 : crc >> 1;
  }
  return crc & 65535;
}
var FUNC_READ_HOLDING = 3;
var MODBUS_BLOCKS = {
  /** Live values: grid, output, battery, PV, load, temperatures. */
  live: { start: 201, count: 31 }
};
function buildModbusRead(unit, block) {
  const { start, count } = MODBUS_BLOCKS[block];
  const body = [unit & 255, FUNC_READ_HOLDING, start >> 8 & 255, start & 255, count >> 8 & 255, count & 255];
  const crc = crc16Modbus(body);
  return [...body, crc & 255, crc >> 8 & 255];
}
function parseModbusRead(reply, unit, count) {
  if (!reply || reply.length === 0) return { ok: false, reason: "empty" };
  if (reply.length < 5) return { ok: false, reason: "short" };
  if (reply[0] !== (unit & 255)) return { ok: false, reason: "wrong_unit", detail: `got unit ${reply[0]}` };
  if (reply[1] & 128) return { ok: false, reason: "exception", detail: `exception code ${reply[2]}` };
  if (reply[1] !== FUNC_READ_HOLDING) return { ok: false, reason: "wrong_function", detail: `function ${reply[1]}` };
  const byteCount = reply[2];
  if (byteCount !== count * 2 || reply.length !== 3 + byteCount + 2) return { ok: false, reason: "bad_length" };
  const crc = crc16Modbus(reply.slice(0, reply.length - 2));
  const got = reply[reply.length - 2] | reply[reply.length - 1] << 8;
  if (crc !== got) return { ok: false, reason: "bad_crc" };
  const registers = [];
  for (let i = 0; i < count; i++) registers.push(reply[3 + i * 2] << 8 | reply[4 + i * 2]);
  return { ok: true, registers };
}
var i16 = (v) => v >= 32768 ? v - 65536 : v;
function decodeModbusLive(registers) {
  const r = (reg) => registers[reg - MODBUS_BLOCKS.live.start];
  return {
    gridVoltage: r(202) / 10,
    gridFrequency: r(203) / 100,
    outputVoltage: r(210) / 10,
    outputFrequency: r(212) / 100,
    outputPower: Math.abs(i16(r(213))),
    outputApparentPower: Math.abs(i16(r(214))),
    batteryVoltage: r(215) / 10,
    batteryCurrent: i16(r(216)) / 10,
    batteryPower: i16(r(217)),
    batterySoc: r(229),
    pvVoltage: r(219) / 10,
    pvCurrent: r(220) / 10,
    pvPower: Math.abs(i16(r(223))),
    loadPercent: r(225),
    dcdcTemperature: r(226),
    heatSinkTemperature: r(227)
  };
}

// src/main/dess/direct-probe.ts
async function readLiveOnce(unit, send) {
  let replyHex;
  try {
    replyHex = await send(toHex(buildModbusRead(unit, "live")));
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "error" };
  }
  const reply = fromHex(replyHex);
  if (reply === null) return { ok: false, detail: "no reply" };
  const p = parseModbusRead(reply, unit, MODBUS_BLOCKS.live.count);
  if (!p.ok) return { ok: false, detail: p.detail ? `${p.reason}: ${p.detail}` : p.reason };
  return { ok: true, live: decodeModbusLive(p.registers) };
}

// src/main/direct-feed.ts
var MIN_WINDOW_MS = 45e3;
var ERROR_AFTER_FAILS = 3;
var PAUSE_AFTER_FAILS = 5;
var PAUSE_MS = 5 * 6e4;
var sameMagnitude = (a, b) => {
  const r = Math.abs(a) / Math.abs(b);
  return r >= 1 / 3 && r <= 3;
};
var usable = (v) => v !== null && v !== void 0 && Math.abs(v) >= 100;
var DirectFeed = class extends import_node_events.EventEmitter {
  constructor(deps, enabled, unit, trusted = false) {
    super();
    this.deps = deps;
    this.enabled = enabled;
    this.unit = unit;
    this.trusted = trusted;
    if (trusted) this.trust();
    this.lastState = JSON.stringify(this.state());
  }
  deps;
  enabled;
  unit;
  trusted;
  timer = null;
  /** Re-evaluates the status so that "live" can expire even when no request completes. */
  statusTimer = null;
  attached = false;
  /** The read in progress, if any. */
  current = null;
  fails = 0;
  pausedUntil = 0;
  latest = null;
  notice;
  intervalSec = 10;
  lastState = "";
  verified = { pv: false, load: false, soc: false };
  /** Direction of the battery power register: 1 if positive means charging, -1 if the opposite; null until learned. */
  batSign = null;
  batVote = null;
  /** The meanings confirmed on this inverter model: SOC in register 229, battery power signed with charging positive. */
  trust() {
    this.verified = { pv: true, load: true, soc: true };
    this.batSign = 1;
  }
  now() {
    return this.deps.now ? this.deps.now() : Date.now();
  }
  get windowMs() {
    return Math.max(MIN_WINDOW_MS, this.intervalSec * 3e3);
  }
  state(now = this.now()) {
    if (!this.enabled) return { enabled: false, status: "off" };
    const fresh = this.latest !== null && now - this.latest.at <= this.windowMs;
    let status;
    if (fresh) status = "live";
    else if (this.fails >= ERROR_AFTER_FAILS) status = "error";
    else status = "connecting";
    return {
      enabled: true,
      status,
      lastAt: this.latest?.at,
      notice: status === "error" ? this.notice : void 0
    };
  }
  refresh() {
    const next = JSON.stringify(this.state());
    if (next !== this.lastState) {
      this.lastState = next;
      this.emit("state", this.state());
    }
  }
  setEnabled(enabled) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.forget();
    this.reschedule();
    this.refresh();
  }
  setUnit(unit) {
    if (unit === this.unit) return;
    this.unit = unit;
    this.forget();
    this.reschedule();
    this.refresh();
  }
  setIntervalSec(sec) {
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
  forget() {
    this.latest = null;
    this.fails = 0;
    this.pausedUntil = 0;
    this.notice = void 0;
  }
  /** (Re)starts the timer according to the current settings. */
  reschedule() {
    if (this.timer) clearInterval(this.timer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.timer = null;
    this.statusTimer = null;
    if (!this.enabled || !this.attached) return;
    this.timer = setInterval(() => void this.tick(), this.intervalSec * 1e3);
    this.statusTimer = setInterval(() => this.refresh(), 5e3);
    void this.tick();
  }
  /**
   * One read; resolves to whether a fresh reading was obtained. While a read is already running,
   * this joins it instead of starting another. Skipped (false) while paused after repeated
   * failures, unless `force` is set (the user pressed Refresh).
   */
  tick(force = false) {
    if (this.current) return this.current;
    if (!this.enabled || !this.attached) return Promise.resolve(false);
    if (force) this.pausedUntil = 0;
    if (this.now() < this.pausedUntil) return Promise.resolve(false);
    this.current = this.readOnce().finally(() => {
      this.current = null;
    });
    return this.current;
  }
  async readOnce() {
    {
      const res = await this.deps.serial(() => readLiveOnce(this.unit, (f) => this.deps.send(f)));
      if (!this.enabled || !this.attached) return false;
      if (res.ok) {
        this.fails = 0;
        this.notice = void 0;
        this.latest = { at: this.now(), live: res.live };
        this.calibrate(res.live);
        this.emit("update");
      } else {
        this.fails++;
        this.notice = res.detail;
        if (this.fails >= PAUSE_AFTER_FAILS) {
          this.pausedUntil = this.now() + PAUSE_MS;
          this.fails = PAUSE_AFTER_FAILS - 1;
        }
      }
      this.refresh();
      return res.ok;
    }
  }
  /** Compares a reading with the regular poll to learn whether powers and battery sign can be trusted. */
  calibrate(live) {
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
        const vote = Math.sign(w) === Math.sign(ref.battery.power) ? 1 : -1;
        if (this.batVote === vote) this.batSign = vote;
        this.batVote = vote;
      } else {
        this.batVote = null;
      }
    }
  }
  /** The latest reading while it is fresh, else null (for listing every value). */
  liveReading(now = this.now()) {
    return this.enabled && this.latest && now - this.latest.at <= this.windowMs ? this.latest.live : null;
  }
  /** Lays a fresh reading over a snapshot; a stale or missing reading leaves it untouched. */
  overlay(snap, now = this.now()) {
    if (!this.enabled || !this.latest || now - this.latest.at > this.windowMs) return snap;
    const { at, live } = this.latest;
    const out = {
      ...snap,
      liveAt: at,
      pv: { ...snap.pv, voltage: live.pvVoltage },
      load: { ...snap.load, voltage: live.outputVoltage, frequency: live.outputFrequency, percent: live.loadPercent },
      grid: { ...snap.grid, voltage: live.gridVoltage, frequency: live.gridFrequency, present: live.gridVoltage >= 90 },
      battery: { ...snap.battery, voltage: live.batteryVoltage }
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
    if (this.verified.pv && this.verified.load && this.batSign !== null) {
      out.grid.power = out.grid.present ? Math.max(0, out.load.power + out.battery.power - out.pv.power) : 0;
    }
    return out;
  }
};

// src/main/notifier.ts
var CONFIRM = 2;
var CONNECTION_LOST_MS = 6e4;
var HYSTERESIS = 5;
var GRID_MIN_V2 = 80;
function formatPower(w, d) {
  if (w === null) return "\u2014";
  if (Math.abs(w) >= 1e3) {
    const kw = new Intl.NumberFormat(d.lang.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(w / 1e3);
    return `${kw} ${d.units.kw}`;
  }
  return `${Math.round(w)} ${d.units.w}`;
}
var Notifier = class {
  constructor(send, settings, lang) {
    this.send = send;
    this.settings = settings;
    this.lang = lang;
  }
  send;
  settings;
  lang;
  conds = /* @__PURE__ */ new Map();
  lastFetched = 0;
  errorSince = null;
  connLost = false;
  reset() {
    this.conds.clear();
    this.lastFetched = 0;
    this.errorSince = null;
    this.connLost = false;
  }
  handle(state, now = Date.now()) {
    if (!state.loggedIn) {
      this.reset();
      return;
    }
    this.checkConnection(state, now);
    const snap = state.snapshot;
    if (!snap || snap.fetchedAt === this.lastFetched) return;
    this.lastFetched = snap.fetchedAt;
    this.checkSnapshot(snap);
  }
  on(key) {
    const s = this.settings();
    return s.enabled && s[key] === true;
  }
  /** Dictionary in the language selected right now. */
  d() {
    return dict(this.lang());
  }
  checkConnection(state, now) {
    const n = this.d().main.notify;
    if (state.connection === "error") {
      this.errorSince ??= now;
      if (!this.connLost && now - this.errorSince >= CONNECTION_LOST_MS) {
        this.connLost = true;
        if (this.on("connection")) this.send(n.connectionLost, state.error ?? n.connectionLostFallback);
      }
    } else if (state.connection === "ok") {
      if (this.connLost && this.on("connection")) this.send(n.connectionBack, n.connectionBackBody);
      this.connLost = false;
      this.errorSince = null;
    }
  }
  /** Records a state change after CONFIRM confirmations; the first observation is silent. */
  observe(key, next, rise, fall) {
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
  current(key) {
    return this.conds.get(key)?.value ?? false;
  }
  checkSnapshot(snap) {
    const s = this.settings();
    const cap = snap.battery.capacity;
    if (snap.grid.voltage !== null) {
      this.observe(
        "gridDown",
        snap.grid.voltage <= GRID_MIN_V2,
        () => {
          const n = this.d().main.notify;
          if (this.on("grid")) this.send(n.gridLost, n.gridLostBody(cap !== null ? Math.round(cap) : null));
        },
        () => {
          const n = this.d().main.notify;
          if (this.on("grid")) this.send(n.gridBack, n.gridBackBody(Math.round(snap.grid.voltage ?? 0)));
        }
      );
    }
    if (cap !== null) {
      const th = s.batteryLowPct;
      const low = this.current("batLow") ? cap < th + HYSTERESIS : cap <= th;
      this.observe("batLow", low, () => {
        const n = this.d().main.notify;
        if (this.on("batteryLow")) this.send(n.batteryLow, n.batteryLowBody(Math.round(cap), th));
      });
    }
    const pct = snap.load.percent;
    if (pct !== null) {
      const th = s.overloadPct;
      const over = this.current("overload") ? pct >= th - HYSTERESIS : pct >= th;
      this.observe("overload", over, () => {
        const d = this.d();
        if (this.on("overload")) this.send(d.main.notify.overload, d.main.notify.overloadBody(Math.round(pct), formatPower(snap.load.power, d)));
      });
    }
    const fault = snap.device.status === 2 || /fault/i.test(snap.system.state ?? "");
    this.observe(
      "fault",
      fault,
      () => {
        const n = this.d().main.notify;
        const state = snap.system.state ? translateStatus(this.lang(), snap.system.state) : void 0;
        if (this.on("fault")) this.send(n.fault, n.faultBody(state));
      },
      () => {
        const n = this.d().main.notify;
        if (this.on("fault")) this.send(n.faultCleared, n.faultClearedBody);
      }
    );
    this.observe(
      "offline",
      snap.device.status === 1,
      () => {
        const n = this.d().main.notify;
        if (this.on("offline")) this.send(n.offline, n.offlineBody);
      },
      () => {
        const n = this.d().main.notify;
        if (this.on("offline")) this.send(n.online, n.onlineBody);
      }
    );
  }
};

// src/poller.ts
var ERROR_AFTER_FAILED_POLLS = 2;
var Poller = class {
  constructor(opts) {
    this.opts = opts;
    this.notifier = new Notifier(opts.send, () => opts.notify, () => opts.language);
    if (opts.directSec > 0) {
      this.direct = new DirectFeed(
        {
          send: async (frame) => {
            await this.ensureAuth();
            return sendDirectCommand(this.auth, this.device.target, frame);
          },
          serial: (fn) => this.serial(fn),
          reference: () => this.last ?? void 0
        },
        true,
        opts.directUnit
      );
      this.direct.setIntervalSec(opts.directSec);
      this.direct.on("update", () => this.onDirect());
    }
  }
  opts;
  auth = null;
  device = null;
  flowCache = new FlowCache();
  notifier;
  direct = null;
  directAttached = false;
  timer = null;
  stopped = false;
  failStreak = 0;
  /** Tail of the request queue: cloud requests never overlap (the cloud drops simultaneous connections). */
  lane = Promise.resolve();
  /** The latest regular-poll snapshot, without any fast reading on it. */
  last = null;
  /** What the fast reads were last combined into (the freshest picture, for /status). */
  view = null;
  /** The latest picture of the inverter (for the /status command). */
  latest() {
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
  serial(fn) {
    const run = this.lane.then(fn, fn);
    this.lane = run.catch(() => void 0);
    return run;
  }
  async ensureAuth() {
    if (!isAuthFresh(this.auth)) this.auth = await authenticate(this.opts.username, this.opts.passwordSha1);
  }
  /** One poll after another: the next starts only after the previous has finished. */
  async loop() {
    if (this.stopped) return;
    await this.serial(() => this.pollOnce());
    if (!this.stopped) this.timer = setTimeout(() => void this.loop(), this.opts.pollSec * 1e3);
  }
  describe(e) {
    const m = dict(this.opts.language).main.errors;
    if (e instanceof DessApiError) return e.message;
    if (e instanceof Error) {
      if (e.name === "TimeoutError") return m.timeout;
      if (e.message.includes("fetch failed")) return m.noConnection;
      return e.message;
    }
    return m.unknown;
  }
  async pollOnce() {
    try {
      await this.ensureAuth();
      if (!this.device) {
        const d = (await queryDeviceList(this.auth))[0];
        if (!d) throw new Error(dict(this.opts.language).main.errors.noDevices);
        this.device = {
          info: { alias: d.devalias, sn: d.sn, pn: d.pn, status: d.status },
          target: { pn: d.pn, sn: d.sn, devcode: String(d.devcode), devaddr: String(d.devaddr) }
        };
      }
      const { info, target: target2 } = this.device;
      const last = await queryLastData(this.auth, target2);
      const flowRaw = await queryEnergyFlow(this.auth, target2).catch(() => null);
      const snapshot = buildSnapshot(info, last, this.flowCache.resolve(flowRaw));
      this.last = snapshot;
      this.failStreak = 0;
      const merged = this.direct ? this.direct.overlay(snapshot) : snapshot;
      this.view = merged;
      this.feed({ connection: "ok", snapshot: merged });
      if (this.direct && !this.directAttached) {
        this.directAttached = true;
        this.direct.attach();
      }
    } catch (e) {
      if (e instanceof DessApiError) this.auth = null;
      this.failStreak++;
      this.opts.log?.(`poll failed (${this.failStreak}): ${this.describe(e)}`);
      if (this.failStreak >= ERROR_AFTER_FAILED_POLLS && this.direct?.state().status !== "live") {
        this.feed({ connection: "error", error: this.describe(e), snapshot: this.last ?? void 0 });
      }
    }
  }
  /** A fast reading arrived: combine it with the latest regular snapshot and check the rules. */
  onDirect() {
    if (!this.last || !this.direct) return;
    const merged = this.direct.overlay({ ...this.last, fetchedAt: Date.now() });
    this.view = merged;
    this.feed({ connection: "ok", snapshot: merged });
  }
  feed(part) {
    this.notifier.handle({ loggedIn: true, ...part });
  }
};

// src/subscribers.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var Subscribers = class {
  ids = /* @__PURE__ */ new Set();
  file;
  constructor(dataDir) {
    import_node_fs.default.mkdirSync(dataDir, { recursive: true });
    this.file = import_node_path.default.join(dataDir, "subscribers.json");
    try {
      const raw = JSON.parse(import_node_fs.default.readFileSync(this.file, "utf8"));
      for (const id of Array.isArray(raw.ids) ? raw.ids : []) if (typeof id === "number" && Number.isFinite(id)) this.ids.add(id);
    } catch {
    }
  }
  list() {
    return [...this.ids];
  }
  has(id) {
    return this.ids.has(id);
  }
  /** Returns true if the chat was not subscribed before. */
  add(id) {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    this.save();
    return true;
  }
  remove(id) {
    const had = this.ids.delete(id);
    if (had) this.save();
    return had;
  }
  /** Written to a temporary file first, so a crash can never leave a half-written list. */
  save() {
    const tmp = this.file + ".tmp";
    import_node_fs.default.writeFileSync(tmp, JSON.stringify({ ids: this.list() }));
    import_node_fs.default.renameSync(tmp, this.file);
  }
};

// src/index.ts
var log = (message) => console.log(`${(/* @__PURE__ */ new Date()).toISOString()} ${message}`);
function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  const subscribers = new Subscribers(config.dataDir);
  const tg = new Telegram(config.botToken);
  let bot;
  const poller = new Poller({
    username: config.username,
    passwordSha1: config.passwordSha1,
    pollSec: config.pollSec,
    directSec: config.directSec,
    directUnit: config.directUnit,
    language: config.language,
    notify: config.notify,
    send: (title, body) => void bot.broadcast(title, body),
    log
  });
  bot = new Bot({ tg, subscribers, joinCode: config.joinCode, language: config.language, latest: () => poller.latest(), log });
  bot.start();
  poller.start();
  log(`started: regular poll every ${config.pollSec} s, direct reads ${config.directSec ? `every ${config.directSec} s` : "off"}, ${subscribers.list().length} subscriber(s)`);
  if (config.announceStart) void bot.broadcast("\u2705", TEXTS[config.language].started);
  const shutdown = () => {
    log("stopping");
    poller.stop();
    bot.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main();
