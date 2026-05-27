import { describe, it, expect } from 'vitest';
import { reconcileVarsWithParameterSet, vartype } from './customizer-reconcile';
import type { ParameterSet } from './customizer-types';

const ps = (params: any[]): ParameterSet => ({ parameters: params } as any);

describe('vartype', () => {
  it('detects primitives', () => {
    expect(vartype(1)).toBe('number');
    expect(vartype('a')).toBe('string');
    expect(vartype(true)).toBe('boolean');
    expect(vartype([1, 2])).toBe('array');
    expect(vartype(null)).toBe('unknown');
    expect(vartype(undefined)).toBe('unknown');
  });
});

describe('reconcileVarsWithParameterSet', () => {
  it('keeps type-matching overrides', () => {
    const result = reconcileVarsWithParameterSet(
      { width: 20 },
      ps([{ name: 'width', type: 'number', initial: 10 }]),
      false,
    );
    expect(result.vars).toEqual({ width: 20 });
    expect(result.removed).toEqual([]);
    expect(result.typeChanged).toEqual([]);
  });

  it('drops missing-name overrides', () => {
    const result = reconcileVarsWithParameterSet(
      { width: 20, legacy: 5 },
      ps([{ name: 'width', type: 'number', initial: 10 }]),
      false,
    );
    expect(result.vars).toEqual({ width: 20 });
    expect(result.removed).toEqual(['legacy']);
  });

  it('drops type-mismatched overrides only when external reload', () => {
    const external = reconcileVarsWithParameterSet(
      { width: 'twenty' },
      ps([{ name: 'width', type: 'number', initial: 10 }]),
      true,
    );
    expect(external.vars).toEqual({});
    expect(external.typeChanged).toEqual(['width']);

    const internal = reconcileVarsWithParameterSet(
      { width: 'twenty' },
      ps([{ name: 'width', type: 'number', initial: 10 }]),
      false,
    );
    expect(internal.vars).toEqual({ width: 'twenty' });
    expect(internal.typeChanged).toEqual([]);
  });

  it('handles undefined parameterSet by leaving vars unchanged', () => {
    const result = reconcileVarsWithParameterSet({ a: 1 }, undefined, true);
    expect(result.vars).toEqual({ a: 1 });
  });

  it('handles empty/undefined vars', () => {
    expect(reconcileVarsWithParameterSet(undefined, ps([{ name: 'a', type: 'number', initial: 0 }]), true).vars).toEqual({});
    expect(reconcileVarsWithParameterSet({}, ps([{ name: 'a', type: 'number', initial: 0 }]), true).vars).toEqual({});
  });

  it('treats array overrides as type "array"', () => {
    const result = reconcileVarsWithParameterSet(
      { points: [1, 2] },
      ps([{ name: 'points', type: 'number', initial: [0, 0] }]),
      true,
    );
    expect(result.vars).toEqual({ points: [1, 2] });
  });
});
