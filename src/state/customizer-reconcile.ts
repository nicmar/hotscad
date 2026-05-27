import type { ParameterSet } from './customizer-types';

export type VarType = 'number' | 'string' | 'boolean' | 'array' | 'unknown';

export function vartype(v: unknown): VarType {
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  return 'unknown';
}

export type ReconcileResult = {
  vars: { [name: string]: any };
  removed: string[];
  typeChanged: string[];
};

export function reconcileVarsWithParameterSet(
  vars: { [name: string]: any } | undefined,
  parameterSet: ParameterSet | undefined,
  isExternalReload: boolean,
): ReconcileResult {
  const out: { [name: string]: any } = {};
  const removed: string[] = [];
  const typeChanged: string[] = [];

  const inputVars = vars ?? {};
  if (!parameterSet) {
    return { vars: { ...inputVars }, removed, typeChanged };
  }

  const byName = new Map<string, any>();
  for (const p of parameterSet.parameters ?? []) {
    byName.set(p.name, p);
  }

  for (const [name, value] of Object.entries(inputVars)) {
    const param = byName.get(name);
    if (!param) {
      removed.push(name);
      continue;
    }
    const vt = vartype(value);
    const paramIsArray = Array.isArray(param.initial);
    const typeOk = vt === param.type || (vt === 'array' && paramIsArray);
    if (!typeOk) {
      if (isExternalReload) {
        typeChanged.push(name);
        continue;
      }
    }
    out[name] = value;
  }

  return { vars: out, removed, typeChanged };
}
