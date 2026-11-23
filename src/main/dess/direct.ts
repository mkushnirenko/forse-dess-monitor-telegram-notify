/**
 * Read-only queries sent to the inverter through the cloud ("direct requests").
 *
 * SAFETY: this module can only BUILD frames that read data. Modbus frames are always function
 * 0x03 (read holding registers) from a fixed list of register blocks; Axpert frames are always
 * one of a fixed list of query commands. There is deliberately no function that accepts a
 * caller-supplied command or function code, and nothing here can write to the inverter.
 * The tests assert this.
 */

import type { DirectLive } from '../../shared/types';

// ---------- hex helpers (the cloud carries frames as upper-case, space-separated hex) ----------

export const toHex = (bytes: ArrayLike<number>): string =>
  Array.from(bytes as ArrayLike<number>, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/** Parses "01 03 AF" into bytes; returns null for anything that is not clean hex. */
export function fromHex(text: string): number[] | null {
  const t = text.trim();
  if (t === '' || t === 'null') return null;
  const out: number[] = [];
  for (const tok of t.split(/\s+/)) {
    if (!/^[0-9a-fA-F]{1,2}$/.test(tok)) return null;
    out.push(parseInt(tok, 16));
  }
  return out;
}

// ---------- Modbus RTU (SMG-II style inverters) ----------

/** CRC-16/MODBUS (polynomial 0xA001, reflected, initial value 0xFFFF). */
export function crc16Modbus(bytes: ArrayLike<number>): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc & 0xffff;
}

/** The only Modbus function this module can produce: read holding registers. */
const FUNC_READ_HOLDING = 0x03;

/** Register blocks that may be read. Fixed on purpose. */
export const MODBUS_BLOCKS = {
  /** Live values: grid, output, battery, PV, load, temperatures. */
  live: { start: 201, count: 31 },
} as const;

export type ModbusBlockName = keyof typeof MODBUS_BLOCKS;

/** Builds "read holding registers" for a named block. The unit id is the inverter's bus address. */
export function buildModbusRead(unit: number, block: ModbusBlockName): number[] {
  const { start, count } = MODBUS_BLOCKS[block];
  const body = [unit & 0xff, FUNC_READ_HOLDING, (start >> 8) & 0xff, start & 0xff, (count >> 8) & 0xff, count & 0xff];
  const crc = crc16Modbus(body);
  return [...body, crc & 0xff, (crc >> 8) & 0xff]; // CRC low byte first
}

export type ParseFailure = 'empty' | 'short' | 'wrong_unit' | 'exception' | 'wrong_function' | 'bad_length' | 'bad_crc';

/** Validates a read reply and returns its 16-bit big-endian registers. */
export function parseModbusRead(
  reply: number[] | null,
  unit: number,
  count: number,
): { ok: true; registers: number[] } | { ok: false; reason: ParseFailure; detail?: string } {
  if (!reply || reply.length === 0) return { ok: false, reason: 'empty' };
  if (reply.length < 5) return { ok: false, reason: 'short' };
  if (reply[0] !== (unit & 0xff)) return { ok: false, reason: 'wrong_unit', detail: `got unit ${reply[0]}` };
  if (reply[1] & 0x80) return { ok: false, reason: 'exception', detail: `exception code ${reply[2]}` };
  if (reply[1] !== FUNC_READ_HOLDING) return { ok: false, reason: 'wrong_function', detail: `function ${reply[1]}` };
  const byteCount = reply[2];
  if (byteCount !== count * 2 || reply.length !== 3 + byteCount + 2) return { ok: false, reason: 'bad_length' };
  const crc = crc16Modbus(reply.slice(0, reply.length - 2));
  const got = reply[reply.length - 2] | (reply[reply.length - 1] << 8);
  if (crc !== got) return { ok: false, reason: 'bad_crc' };
  const registers: number[] = [];
  for (let i = 0; i < count; i++) registers.push((reply[3 + i * 2] << 8) | reply[4 + i * 2]);
  return { ok: true, registers };
}

const i16 = (v: number) => (v >= 0x8000 ? v - 0x10000 : v);

/** Decodes the live block. `registers[0]` is register 201. */
export function decodeModbusLive(registers: number[]): DirectLive {
  const r = (reg: number) => registers[reg - MODBUS_BLOCKS.live.start];
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
    heatSinkTemperature: r(227),
  };
}

// ---------- Axpert / Voltronic ASCII queries ----------

/** The only Axpert commands that can be built. All of them are queries; none changes a setting. */
export const AXPERT_QUERIES = ['QPI', 'QPIGS', 'QMOD', 'QPIRI'] as const;
export type AxpertQuery = (typeof AXPERT_QUERIES)[number];

/** CRC-16/XMODEM (polynomial 0x1021, initial value 0). */
export function crc16Xmodem(bytes: ArrayLike<number>): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** Voltronic quirk: a CRC byte that equals one of the framing characters is bumped by one. */
const axpertCrcByte = (b: number) => (b === 0x28 || b === 0x0d || b === 0x0a ? b + 1 : b);

/** Builds "<command><crc hi><crc lo><CR>" for one of the fixed queries. */
export function buildAxpertQuery(query: AxpertQuery): number[] {
  if (!(AXPERT_QUERIES as readonly string[]).includes(query)) throw new Error(`not an allowed query: ${query}`);
  const text = Array.from(query, (c) => c.charCodeAt(0));
  const crc = crc16Xmodem(text);
  return [...text, axpertCrcByte((crc >> 8) & 0xff), axpertCrcByte(crc & 0xff), 0x0d];
}

/** Checks an Axpert reply "(....<crc><CR>" and returns its text, or a failure reason. */
export function parseAxpertReply(reply: number[] | null): { ok: true; text: string } | { ok: false; reason: string } {
  if (!reply || reply.length === 0) return { ok: false, reason: 'empty' };
  if (reply.length < 4 || reply[0] !== 0x28 || reply[reply.length - 1] !== 0x0d) return { ok: false, reason: 'not_axpert' };
  const body = reply.slice(0, reply.length - 3);
  const crc = crc16Xmodem(body);
  const hi = axpertCrcByte((crc >> 8) & 0xff);
  const lo = axpertCrcByte(crc & 0xff);
  if (hi !== reply[reply.length - 3] || lo !== reply[reply.length - 2]) return { ok: false, reason: 'bad_crc' };
  const text = String.fromCharCode(...body.slice(1));
  if (text.startsWith('NAK')) return { ok: false, reason: 'nak' };
  return { ok: true, text };
}
