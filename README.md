# Forse notification service

A standalone Node.js service that sends Telegram notifications about the inverter: low battery,
grid lost / restored, overload, fault, inverter offline and loss of connection to the cloud.

**It does not depend on the desktop app.** This service signs in to the cloud on its own, polls it on its own schedule and decides on its own
when to notify. It only reads data; nothing is ever written to the inverter or the account.

A change must be seen in
two polls in a row, thresholds have hysteresis, and the first reading after a start reports nothing.

It checks the inverter every 10 seconds with read-only direct requests, and once a minute with the regular cloud poll for statuses and faults. If the
direct reads do not work, the regular poll alone keeps the notifications going, only more slowly.

## Build (on your computer)

```
npm install
npm run build
```

This produces `dist/server.cjs`, one self-contained file with no dependencies to install.

## Deploy (on the server, Node.js 20.6+ and pm2)

1. Create a folder, for example `~/forse-notify`, and copy into it:
   - `dist/server.cjs`
   - `ecosystem.config.cjs`
   - `.env.example`, renamed to `.env` and filled in
2. `chmod 600 .env` (it holds the account password / hash and the bot token).
3. `pm2 start ecosystem.config.cjs`, then `pm2 save` (and once per server: `pm2 startup`).
4. Check with `pm2 logs forse-notify`: you should see "started: regular poll every 60 s, direct reads every 10 s".

## Telegram

1. In Telegram, talk to **@BotFather**, send `/newbot` and follow the steps; it gives the token.
2. Put the token into `TELEGRAM_BOT_TOKEN` and choose a `JOIN_CODE`.
3. Every family member opens the bot, sends `/start <JOIN_CODE>` and is subscribed.
   Once the code is accepted, a **Status** button appears under the input field (it shows the current
   readings); `/stop` unsubscribes and removes it. Strangers never see the button, and pressing a
   button with the same text does nothing for a chat that has not subscribed.

Subscribers are kept in `data/subscribers.json` next to the service and survive restarts.

## Notes

- After a restart the first reading is silent (as in the app), so a grid outage that began while
  the service was down is not announced.
- A chat that blocks the bot is removed from the list automatically.
- To update: build again, copy `server.cjs`, run `pm2 restart forse-notify`.
