import { describe, it, expect } from 'vitest';
import { sphericalBasis, clampPhi, clampRadius } from './CameraController';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const closeVec = (a: number[], b: number[]) => a.every((v, i) => close(v, b[i]));

describe('sphericalBasis', () => {
  it('phi=PI/2, theta=0 (front view)', () => {
    const { right, up } = sphericalBasis(0, Math.PI / 2);
    expect(closeVec(right, [1, 0, 0])).toBe(true);
    expect(closeVec(up, [0, 1, 0])).toBe(true);
  });

  it('phi=PI/2, theta=PI/2 (right view)', () => {
    const { right, up } = sphericalBasis(Math.PI / 2, Math.PI / 2);
    expect(closeVec(right, [0, 0, -1])).toBe(true);
    expect(closeVec(up, [0, 1, 0])).toBe(true);
  });

  it('phi=PI/2, theta=PI/4 (off-axis horizontal)', () => {
    const { right, up } = sphericalBasis(Math.PI / 4, Math.PI / 2);
    const s2 = Math.SQRT2 / 2;
    expect(closeVec(right, [s2, 0, -s2])).toBe(true);
    expect(closeVec(up, [0, 1, 0])).toBe(true);
  });

  it('phi=PI/4, theta=0 (looking down from north)', () => {
    const { right, up } = sphericalBasis(0, Math.PI / 4);
    const s2 = Math.SQRT2 / 2;
    expect(closeVec(right, [1, 0, 0])).toBe(true);
    expect(closeVec(up, [0, s2, -s2])).toBe(true);
  });
});

describe('clampPhi', () => {
  it('clamps to (0.01, PI - 0.01)', () => {
    expect(clampPhi(-1)).toBe(0.01);
    expect(clampPhi(Math.PI)).toBeCloseTo(Math.PI - 0.01);
    expect(clampPhi(1)).toBe(1);
  });
});

describe('clampRadius', () => {
  it('clamps to [0.0001*frame, 10000*frame]', () => {
    expect(clampRadius(0.00001, 10)).toBeCloseTo(0.001);
    expect(clampRadius(9999999, 10)).toBe(100000);
    expect(clampRadius(15, 10)).toBe(15);
  });
});
