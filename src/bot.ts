import type { Lang, Snapshot } from './shared/types';
import type { Subscribers } from './subscribers';
import { Telegram, TelegramError, type ReplyMarkup, type TgUpdate } from './telegram';
import { TEXTS } from './texts';

/** Grid voltage at or below this value counts as no grid (the same threshold the notifier uses). */
const GRID_MIN_V = 80;

const fmtW = (w: number | null) => (w === null ? '—' : Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`);

export interface BotDeps {
  tg: Telegram;
  subscribers: Subscribers;
  joinCode: string;
  language: Lang;
  latest: () => Snapshot | null;
  log: (message: string) => void;
}

/**
 * The Telegram side: family members subscribe with "/start <code>", unsubscribe with /stop and
 * can ask for the current readings with /status. Notifications go to everyone subscribed.
 */
export class Bot {
  private offset = 0;
  private stopped = false;

  constructor(private d: BotDeps) {}

  private get t() {
    return TEXTS[this.d.language];
  }

  /** Sends a notification to every subscriber; a chat that blocked the bot is removed. */
  async broadcast(title: string, body: string) {
    const text = `${title}\n${body}`;
    for (const id of this.d.subscribers.list()) {
      try {
        await this.d.tg.sendMessage(id, text);
      } catch (e) {
        if (e instanceof TelegramError && (e.code === 403 || e.code === 400)) {
          // 403: the user blocked the bot; 400: the chat no longer exists
          this.d.subscribers.remove(id);
          this.d.log(`removed an unreachable chat (${e.code})`);
        } else {
          this.d.log(`could not send a message: ${e instanceof Error ? e.message : 'error'}`);
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

  private async loop() {
    while (!this.stopped) {
      try {
        const updates = await this.d.tg.getUpdates(this.offset, 30);
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) => this.d.log(`handler failed: ${e instanceof Error ? e.message : 'error'}`));
        }
      } catch (e) {
        this.d.log(`getUpdates failed: ${e instanceof Error ? e.message : 'error'}`);
        await new Promise((r) => setTimeout(r, 10_000)); // do not hammer the API while it is unreachable
      }
    }
  }

  /**
   * Every reply carries the keyboard state: the Status button for a subscribed chat, nothing for
   * anyone else. So the button appears right after the access code is accepted, vanishes after
   * /stop, and an existing subscriber gets it back with any message they send.
   */
  private async reply(chatId: number, text: string) {
    const markup: ReplyMarkup = this.d.subscribers.has(chatId)
      ? { keyboard: [[{ text: this.t.statusButton }]], resize_keyboard: true, is_persistent: true }
      : { remove_keyboard: true };
    await this.d.tg.sendMessage(chatId, text, markup).catch(() => undefined);
  }

  /** Public so tests can drive it without a network. */
  async handle(u: TgUpdate) {
    const m = u.message;
    if (!m?.text || m.chat.type !== 'private') return; // only private chats can subscribe
    const chatId = m.chat.id;
    const [cmdRaw, ...rest] = m.text.trim().split(/\s+/);
    // pressing the Status button sends its label as text
    const cmd = m.text.trim() === this.t.statusButton ? '/status' : cmdRaw.toLowerCase().replace(/@.*$/, ''); // "/start@MyBot" in groups
    const t = this.t;

    if (cmd === '/start') {
      if (this.d.subscribers.has(chatId)) return this.reply(chatId, t.alreadyIn);
      if (rest.length === 0) return this.reply(chatId, t.needCode);
      if (rest[0] !== this.d.joinCode) return this.reply(chatId, t.wrongCode);
      this.d.subscribers.add(chatId);
      this.d.log('a chat subscribed');
      return this.reply(chatId, t.subscribed);
    }
    if (cmd === '/stop') {
      return this.reply(chatId, this.d.subscribers.remove(chatId) ? t.unsubscribed : t.notSubscribed);
    }
    if (cmd === '/status') {
      if (!this.d.subscribers.has(chatId)) return this.reply(chatId, t.notSubscribed);
      return this.reply(chatId, this.statusText());
    }
    return this.reply(chatId, this.d.subscribers.has(chatId) ? t.help : t.welcome);
  }

  statusText(now = Date.now()): string {
    const s = this.d.latest();
    const t = this.t;
    if (!s) return t.noData;
    const ageMin = Math.max(0, Math.round((now - s.fetchedAt) / 60_000));
    const gridOn = s.grid.voltage !== null ? s.grid.voltage > GRID_MIN_V : s.grid.present;
    return t.status({
      battery: s.battery.capacity === null ? '—' : `${Math.round(s.battery.capacity)}%`,
      load: fmtW(s.load.power),
      pv: fmtW(s.pv.power),
      grid: gridOn ? t.gridOn(s.grid.voltage === null ? '—' : `${Math.round(s.grid.voltage)} V`) : t.gridOff,
      updated: ageMin === 0 ? new Date(s.fetchedAt).toLocaleTimeString(this.d.language === 'uk' ? 'uk-UA' : 'en-GB') : `${ageMin} min`,
    });
  }
}
