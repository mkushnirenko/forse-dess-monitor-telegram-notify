import type { DirectLive, DirectProbeResult, ProbeStep } from '../../shared/types';
import {
  buildAxpertQuery,
  buildModbusRead,
  decodeModbusLive,
  fromHex,
  MODBUS_BLOCKS,
  parseAxpertReply,
  parseModbusRead,
  toHex,
} from './direct';

/** Pause between two requests: the test must never look like a flood to the cloud. */
export const PROBE_GAP_MS = 6000;

export interface ProbeDeps {
  /** Sends one hex frame through the cloud and returns the reply hex ("null" or empty = no reply). */
  send(hexFrame: string): Promise<string>;
  sleep(ms: number): Promise<void>;
  /** Receives one log entry per step (decoded values only, never identifiers). */
  log(entry: Record<string, unknown>): void;
}

type Plan = { protocol: 'modbus'; unit: number } | { protocol: 'axpert' };

/** Queries to try, in order: the device's own bus address, address 1, then the Axpert text protocol. */
export function planProbe(devaddr: number): Plan[] {
  const own = Number.isInteger(devaddr) && devaddr >= 0 && devaddr <= 255 ? devaddr : 1;
  const plan: Plan[] = [{ protocol: 'modbus', unit: own }];
  if (own !== 1) plan.push({ protocol: 'modbus', unit: 1 });
  plan.push({ protocol: 'axpert' });
  return plan;
}

/** Runs the queries one at a time and stops at the first valid reply or the first cloud refusal. */
export async function runProbe(devaddr: number, deps: ProbeDeps): Promise<DirectProbeResult> {
  const steps: ProbeStep[] = [];
  const result: DirectProbeResult = { verdict: 'no_reply', steps };
  const plan = planProbe(devaddr);

  for (let i = 0; i < plan.length; i++) {
    if (i > 0) await deps.sleep(PROBE_GAP_MS);
    const item = plan[i];
    const step: ProbeStep =
      item.protocol === 'modbus'
        ? { protocol: 'modbus', unit: item.unit, query: 'live', outcome: 'no_reply' }
        : { protocol: 'axpert', query: 'QPIGS', outcome: 'no_reply' };
    steps.push(step);

    const frame = item.protocol === 'modbus' ? buildModbusRead(item.unit, 'live') : buildAxpertQuery('QPIGS');
    let replyHex: string;
    try {
      replyHex = await deps.send(toHex(frame));
    } catch (e) {
      step.outcome = 'cloud_error';
      step.detail = e instanceof Error ? e.message : 'error';
      deps.log({ ...step });
      result.verdict = 'cloud_error';
      return result; // the cloud refused: more attempts would only repeat the refusal
    }

    const reply = fromHex(replyHex);
    if (reply === null) {
      step.detail = 'empty';
    } else if (item.protocol === 'modbus') {
      const p = parseModbusRead(reply, item.unit, MODBUS_BLOCKS.live.count);
      if (p.ok) {
        step.outcome = 'ok';
        result.live = decodeModbusLive(p.registers);
      } else {
        step.outcome = 'bad_reply';
        step.detail = p.detail ? `${p.reason}: ${p.detail}` : p.reason;
      }
    } else {
      const p = parseAxpertReply(reply);
      if (p.ok) {
        step.outcome = 'ok';
        result.axpertText = p.text;
      } else {
        step.outcome = 'bad_reply';
        step.detail = p.reason;
      }
    }

    deps.log({ ...step, ...(step.outcome === 'ok' ? { live: result.live, axpert: result.axpertText } : {}) });
    if (step.outcome === 'ok') {
      result.verdict = 'works';
      return result;
    }
  }
  return result;
}

export type LiveRead = { ok: true; live: DirectLive } | { ok: false; detail: string };

/** One read of the live register block (used by regular direct polling). Never throws. */
export async function readLiveOnce(unit: number, send: (hexFrame: string) => Promise<string>): Promise<LiveRead> {
  let replyHex: string;
  try {
    replyHex = await send(toHex(buildModbusRead(unit, 'live')));
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'error' };
  }
  const reply = fromHex(replyHex);
  if (reply === null) return { ok: false, detail: 'no reply' };
  const p = parseModbusRead(reply, unit, MODBUS_BLOCKS.live.count);
  if (!p.ok) return { ok: false, detail: p.detail ? `${p.reason}: ${p.detail}` : p.reason };
  return { ok: true, live: decodeModbusLive(p.registers) };
}
