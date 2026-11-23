import { loadConfig } from './config';
import { Bot } from './bot';
import { Poller } from './poller';
import { Subscribers } from './subscribers';
import { Telegram } from './telegram';
import { TEXTS } from './texts';

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);

/**
 * Standalone notification service. It signs in to the cloud itself and checks the inverter on its
 * own schedule: the desktop app does not have to be running, and nothing here depends on it.
 */
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
  // poller and bot refer to each other, so they are created in two steps
  let bot: Bot;
  const poller = new Poller({
    username: config.username,
    passwordSha1: config.passwordSha1,
    pollSec: config.pollSec,
    directSec: config.directSec,
    directUnit: config.directUnit,
    language: config.language,
    notify: config.notify,
    send: (title, body) => void bot.broadcast(title, body),
    log,
  });
  bot = new Bot({ tg, subscribers, joinCode: config.joinCode, language: config.language, latest: () => poller.latest(), log });

  bot.start();
  poller.start();
  log(`started: regular poll every ${config.pollSec} s, direct reads ${config.directSec ? `every ${config.directSec} s` : 'off'}, ${subscribers.list().length} subscriber(s)`);
  if (config.announceStart) void bot.broadcast('✅', TEXTS[config.language].started);

  const shutdown = () => {
    log('stopping');
    poller.stop();
    bot.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
