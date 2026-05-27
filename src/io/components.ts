import type { IndexedPolyhedron } from './common';

export type ComponentBox = {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
  faceCount: number;
};

/**
 * Splits a polyhedron mesh into connected components by walking face-vertex adjacency
 * with union-find, then computes an axis-aligned bounding box per component.
 *
 * Skips degenerate components (fewer than 4 faces).
 */
export function computeConnectedComponents(off: IndexedPolyhedron): ComponentBox[] {
  const n = off.vertices.length;
  const parent = new Int32Array(n);
  const rank = new Uint8Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    // path compression
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };

  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra]++; }
  };

  for (const f of off.faces) {
    const v0 = f.vertices[0];
    union(v0, f.vertices[1]);
    union(v0, f.vertices[2]);
  }

  const facesPerRoot = new Map<number, number>();
  for (const f of off.faces) {
    const r = find(f.vertices[0]);
    facesPerRoot.set(r, (facesPerRoot.get(r) ?? 0) + 1);
  }

  const boxByRoot = new Map<number, {
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
  }>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const { x, y, z } = off.vertices[i];
    let b = boxByRoot.get(r);
    if (!b) {
      b = { minX: x, minY: y, minZ: z, maxX: x, maxY: y, maxZ: z };
      boxByRoot.set(r, b);
    } else {
      if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
      if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
    }
  }

  const out: ComponentBox[] = [];
  for (const [root, b] of boxByRoot) {
    const faceCount = facesPerRoot.get(root) ?? 0;
    if (faceCount < 4) continue;
    out.push({
      min: [b.minX, b.minY, b.minZ],
      max: [b.maxX, b.maxY, b.maxZ],
      center: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2],
      size: [b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ],
      faceCount,
    });
  }
  // Sort largest-volume first (so labels for big objects render under small ones)
  out.sort((a, b) => (b.size[0] * b.size[1] * b.size[2]) - (a.size[0] * a.size[1] * a.size[2]));
  return out;
}

/**
 * Projects a world-space point onto the model-viewer's 2D viewport pixel coords.
 * model-viewer coordinate convention: Y is up; theta is azimuth around +Y;
 * phi is polar measured from +Y.
 *
 * Returns [u, v, viewDepth] with u/v in pixels relative to the viewport's top-left.
 * viewDepth is positive when the point is in front of the camera, negative behind.
 */
export function projectToViewport(
  p: readonly [number, number, number],
  cameraTarget: readonly [number, number, number],
  theta: number,
  phi: number,
  radius: number,
  fovDeg: number,
  width: number,
  height: number,
): [number, number, number] {
  // Camera position
  const cx = cameraTarget[0] + radius * Math.sin(phi) * Math.sin(theta);
  const cy = cameraTarget[1] + radius * Math.cos(phi);
  const cz = cameraTarget[2] + radius * Math.sin(phi) * Math.cos(theta);

  // Forward = from camera to target, normalized.
  let fx = cameraTarget[0] - cx;
  let fy = cameraTarget[1] - cy;
  let fz = cameraTarget[2] - cz;
  const flen = Math.hypot(fx, fy, fz) || 1;
  fx /= flen; fy /= flen; fz /= flen;

  // Right = normalize(forward × worldUp) where worldUp = (0, 1, 0)
  // cross(f, (0,1,0)) = (f.y*0 - f.z*1, f.z*0 - f.x*0, f.x*1 - f.y*0) = (-f.z, 0, f.x)
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen; ry /= rlen; rz /= rlen;

  // Up = right × forward
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  // Point relative to camera
  const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;

  // View-space coords (right-handed, looking down +forward axis)
  const vx = dx * rx + dy * ry + dz * rz;
  const vy = dx * ux + dy * uy + dz * uz;
  const vz = dx * fx + dy * fy + dz * fz;

  const tanHalfFov = Math.tan(fovDeg * Math.PI / 360);
  const aspect = width / height;
  const ndcX = vx / (vz * tanHalfFov * aspect);
  const ndcY = vy / (vz * tanHalfFov);

  const u = (ndcX + 1) * width / 2;
  const v = (1 - ndcY) * height / 2;
  return [u, v, vz];
}
