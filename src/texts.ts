import type { Lang } from './shared/types';

/** Texts of the bot's own replies (the notifications themselves come from the shared dictionaries). */
export interface Texts {
  welcome: string;
  needCode: string;
  wrongCode: string;
  alreadyIn: string;
  subscribed: string;
  unsubscribed: string;
  notSubscribed: string;
  started: string;
  /** The label of the button under the input field; also what pressing it sends. */
  statusButton: string;
  noData: string;
  help: string;
  status: (s: {
    battery: string;
    load: string;
    pv: string;
    grid: string;
    updated: string;
  }) => string;
  gridOn: (volts: string) => string;
  gridOff: string;
}

export const TEXTS: Record<Lang, Texts> = {
  en: {
    welcome: 'Hi! Send /start and the access code to receive inverter notifications.',
    needCode: 'Send /start followed by the access code, for example: /start 12345',
    wrongCode: 'Wrong access code.',
    alreadyIn: 'You are already subscribed.',
    subscribed: 'Done. You will now receive inverter notifications. The Status button shows the current readings, /stop unsubscribes.',
    unsubscribed: 'Unsubscribed. Send /start and the access code to subscribe again.',
    notSubscribed: 'You are not subscribed. Send /start and the access code first.',
    started: 'The notification service has started.',
    statusButton: 'Status',
    noData: 'No data from the inverter yet. Try again in a minute.',
    help: 'Press Status for the current readings. /stop unsubscribes.',
    status: (s) => `Battery: ${s.battery}\nLoad: ${s.load}\nPV: ${s.pv}\nGrid: ${s.grid}\nUpdated: ${s.updated}`,
    gridOn: (v) => `present, ${v}`,
    gridOff: 'none',
  },
  uk: {
    welcome: 'Привіт! Надішліть /start і код доступу, щоб отримувати сповіщення про інвертор.',
    needCode: 'Надішліть /start і код доступу, наприклад: /start 12345',
    wrongCode: 'Невірний код доступу.',
    alreadyIn: 'Ви вже підписані.',
    subscribed: 'Готово. Тепер ви отримуватимете сповіщення про інвертор. Кнопка «Статус» показує поточні дані, /stop скасовує підписку.',
    unsubscribed: 'Підписку скасовано. Надішліть /start і код доступу, щоб підписатися знову.',
    notSubscribed: 'Ви не підписані. Спершу надішліть /start і код доступу.',
    started: 'Сервіс сповіщень запущено.',
    statusButton: 'Статус',
    noData: 'Даних від інвертора ще немає. Спробуйте за хвилину.',
    help: 'Натисніть «Статус», щоб побачити поточні дані. /stop скасовує підписку.',
    status: (s) => `Батарея: ${s.battery}\nНавантаження: ${s.load}\nPV: ${s.pv}\nМережа: ${s.grid}\nОновлено: ${s.updated}`,
    gridOn: (v) => `є, ${v}`,
    gridOff: 'немає',
  },
};
