import type { DeviceInfo, Num, ParamRow, Snapshot } from '../../shared/types';

type RawPar = { id: string; par: string; val: string; unit?: string };

const num = (v: unknown): Num => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Different inverter protocols name the same parameters differently,
 * so each field is looked up by a list of possible ids.
 */
function finder(pars: Record<string, RawPar[]>) {
  const all = Object.values(pars).flat();
  const byId = new Map(all.map((p) => [p.id, p]));
  const str = (...ids: string[]) => {
    for (const id of ids) {
      const p = byId.get(id);
      if (p && p.val !== undefined && p.val !== '') return p.val;
    }
    return undefined;
  };
  const n = (...ids: string[]) => num(str(...ids));
  /** Fallback lookup by an id pattern inside a parameter group (bt_* by default). */
  const fuzzy = (include: RegExp, exclude?: RegExp, group = 'bt_') => {
    const p = (pars[group] ?? []).find(
      (i) => include.test(i.id) && !(exclude && exclude.test(i.id)) && num(i.val) !== null,
    );
    return p ? num(p.val) : null;
  };
  /** Same, but returns the string (for text statuses). */
  const fuzzyStr = (include: RegExp) =>
    (pars['bt_'] ?? []).find((i) => include.test(i.id) && i.val !== '')?.val;
  return { str, n, fuzzy, fuzzyStr };
}

/** Power from an energy-flow block: if no unit is given, kW is assumed. */
function flowPowerW(flow: Record<string, any>, block: string, par: string): Num {
  const item = (flow?.[block] as any[] | undefined)?.find((i) => i.par === par);
  const v = num(item?.val);
  if (v === null) return null;
  const unit = String(item?.unit ?? 'kW').toLowerCase();
  return unit === 'w' ? v : v * 1000;
}

/**
 * Status derived from the current direction when the inverter does not report one.
 * The texts mirror the cloud's own English phrases; the UI translates them like any other status.
 */
function derivedBatteryStatus(power: Num): string | undefined {
  if (power === null) return undefined;
  if (power > 10) return 'Charging Batteries';
  if (power < -10) return 'Battery Discharging';
  return 'Idle';
}

export function buildSnapshot(
  device: DeviceInfo,
  last: { gts: string; pars: Record<string, RawPar[]> },
  flow: Record<string, any>,
): Snapshot {
  const { str, n, fuzzy, fuzzyStr } = finder(last.pars ?? {});

  const batVoltage = n('bt_battery_voltage');
  const chargeI =
    n('bt_battery_charging_current', 'bt_charging_current') ??
    fuzzy(/charg.*curr|curr.*charg/, /discharg|total|max|utility/);
  const dischargeI =
    n('bt_battery_discharge_current', 'bt_discharge_current') ??
    fuzzy(/discharg.*curr|curr.*discharg/);

  const pvPower = n('pv_output_power') ?? flowPowerW(flow, 'pv_status', 'pv_output_power');
  const loadPower =
    flowPowerW(flow, 'bc_status', 'load_active_power') ??
    n('bc_output_active_power', 'output_power');

  const gridVoltage =
    n('gd_ac_input_voltage', 'gd_grid_voltage') ?? fuzzy(/volt/, /range|nominal|rated/, 'gd_');
  const gridFlowItem = (flow?.gd_status as any[] | undefined)?.find((i) => i.par === 'grid_active_power');

  // Is the grid present? Sources, most reliable first: 1) input voltage,
  // 2) the inverter's working mode (line / battery), 3) grid status in energy-flow,
  // 4) power drawn from the grid. A missing voltage must never be read as "no grid".
  const workState = str('sy_status') ?? '';
  const flowGridW = flowPowerW(flow, 'gd_status', 'grid_active_power');
  const gridPresent =
    gridVoltage !== null
      ? gridVoltage > 80
      : /battery/i.test(workState)
        ? false
        : /line|mains|utility|bypass|grid/i.test(workState)
          ? true
          : gridFlowItem?.status === 1 || (flowGridW ?? 0) > 10;

  // Battery power (W, + charging / − discharging). Sources, most accurate first:
  // 1) charge/discharge currents, 2) battery_active_power from energy-flow,
  // 3) a balance estimate when there is no grid: solar − load.
  let batPower: Num = null;
  if (batVoltage !== null && (chargeI !== null || dischargeI !== null)) {
    batPower = batVoltage * ((chargeI ?? 0) - (dischargeI ?? 0));
  }
  if (batPower === null || (batPower === 0 && !gridPresent && (loadPower ?? 0) > 20)) {
    const flowBat = flowPowerW(flow, 'bt_status', 'battery_active_power');
    if (flowBat !== null && flowBat !== 0) batPower = flowBat;
    else if (!gridPresent && loadPower !== null) batPower = (pvPower ?? 0) - loadPower;
  }
  // Current derived from power, when the cloud did not report the current itself.
  const dischargeShown =
    dischargeI ?? (batPower !== null && batVoltage ? Math.max(0, -batPower) / batVoltage : null);
  const chargeShown =
    chargeI ?? (batPower !== null && batVoltage ? Math.max(0, batPower) / batVoltage : null);

  let gridPower = flowGridW;
  if (gridPower === null && loadPower !== null) {
    // Balance estimate, when the cloud did not report grid power.
    gridPower = gridPresent
      ? Math.max(0, loadPower + Math.max(0, batPower ?? 0) - (pvPower ?? 0))
      : 0;
  }

  const params: ParamRow[] = Object.entries(last.pars ?? {}).flatMap(
    ([group, list]) =>
      list.map((p) => ({
        group,
        id: p.id,
        name: p.par,
        value: p.val,
        unit: p.unit,
      })),
  );
  // Raw energy-flow values: they help to see what exactly the cloud returns.
  for (const [block, list] of Object.entries(flow ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const i of list) {
      params.push({
        group: `flow:${block}`,
        id: `flow.${i.par}`,
        name: `${i.par} (status ${i.status})`,
        value: String(i.val),
        unit: i.unit,
      });
    }
  }

  return {
    fetchedAt: Date.now(),
    deviceTime: last.gts,
    device,
    battery: {
      voltage: batVoltage,
      capacity: n('bt_battery_capacity'),
      chargeCurrent: chargeShown,
      dischargeCurrent: dischargeShown,
      power: batPower,
      status: str('bt_battery_status') ?? fuzzyStr(/status|state/) ?? derivedBatteryStatus(batPower),
    },
    pv: {
      voltage: n('pv_input_voltage', 'pv_voltage'),
      power: pvPower,
      status: str('pv_status'),
    },
    grid: {
      voltage: gridVoltage,
      frequency: n('gd_ac_input_frequency', 'gd_grid_frequency') ?? fuzzy(/freq/, undefined, 'gd_'),
      power: gridPower,
      present: gridPresent,
      status: str('gd_mains_status'),
    },
    load: {
      power: loadPower,
      apparentPower: n('bc_output_apparent_power'),
      percent: n('bc_load_percent', 'bc_battery_capacity'),
      voltage: n('bc_output_voltage'),
      frequency: n('bc_output_frequency'),
      status: str('bc_load_status'),
    },
    system: {
      state: str('sy_status'),
      outputPriority: str('bc_output_source_priority'),
      chargerPriority: str('bt_charger_source_priority'),
    },
    params,
  };
}
