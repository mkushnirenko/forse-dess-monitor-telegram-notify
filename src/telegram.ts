/** A minimal Telegram Bot API client: sending messages and long-polling for new ones. */

export interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number; type: string }; text?: string; from?: { first_name?: string } };
}

/** A keyboard of text buttons (pressing one sends its text as a message), or a request to remove it. */
export type ReplyMarkup =
  | { keyboard: { text: string }[][]; resize_keyboard: boolean; is_persistent: boolean }
  | { remove_keyboard: true };

export class TelegramError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
  }
}

export class Telegram {
  constructor(private token: string) {}

  private async call<T>(method: string, body: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null;
    if (!data?.ok) throw new TelegramError(data?.description ?? `HTTP ${res.status}`, data?.error_code ?? res.status);
    return data.result as T;
  }

  /** Plain text, no formatting: nothing in a message needs escaping. `replyMarkup` shows or hides the keyboard under the input field. */
  sendMessage(chatId: number, text: string, replyMarkup?: ReplyMarkup) {
    return this.call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
  }

  /** Long polling: returns as soon as something arrives, or after `waitSec` seconds with an empty list. */
  getUpdates(offset: number, waitSec = 30) {
    return this.call<TgUpdate[]>('getUpdates', { offset, timeout: waitSec, allowed_updates: ['message'] }, (waitSec + 10) * 1000);
  }
}
