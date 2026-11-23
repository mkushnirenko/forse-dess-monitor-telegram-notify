import fs from 'node:fs';
import path from 'node:path';

/** The chats that receive notifications, kept in a small JSON file so they survive restarts. */
export class Subscribers {
  private ids = new Set<number>();
  private file: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'subscribers.json');
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { ids?: unknown };
      for (const id of Array.isArray(raw.ids) ? raw.ids : []) if (typeof id === 'number' && Number.isFinite(id)) this.ids.add(id);
    } catch {
      /* first run or an unreadable file: start with nobody */
    }
  }

  list(): number[] {
    return [...this.ids];
  }

  has(id: number) {
    return this.ids.has(id);
  }

  /** Returns true if the chat was not subscribed before. */
  add(id: number): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    this.save();
    return true;
  }

  remove(id: number): boolean {
    const had = this.ids.delete(id);
    if (had) this.save();
    return had;
  }

  /** Written to a temporary file first, so a crash can never leave a half-written list. */
  private save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ids: this.list() }));
    fs.renameSync(tmp, this.file);
  }
}
