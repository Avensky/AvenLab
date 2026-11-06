import { parseLayout, partTransform, type LayoutObject, type LayoutPart, type V3, type WorldLayout } from '../document/layoutDocument.ts';

export type RouteKind = 'road' | 'tunnel' | 'underpass' | 'canal' | 'canal-tunnel';
export type RouteOptions = {
  kind: RouteKind; points: V3[]; width: number; height: number; depth: number;
  shoulder?: number; resolution: number; rails: boolean; waterfall: boolean;
};
export const SEGMENT_PRESETS = { small: 12, standard: 24, long: 48, extended: 96 } as const;
export const isExcavatable = (o: LayoutObject) => o.piece.startsWith('mountain-') && !o.piece.includes('waterfall');
const radians = Math.PI / 180;
export function colliderBox(id: string, piece: string, position: V3, size: V3, color = '#71777b', yaw = 0, solid = true): LayoutObject {
  return { id, name: id, piece, position, size, yaw, color, locked: false, solid,
    parts: [{ shape: 'box', position: [0, .5, 0], size: [1, 1, 1], solid }] };
}
/** Presets use arc length, not the chord length. Entry points face local +Z. */
export function presetPath(length: number, bend: number, origin: V3, yaw = 0, grade = 0): V3[] {
  if (!Number.isFinite(length) || length < 6 || length > 384 || !Number.isFinite(bend) || Math.abs(bend) > 180)
    throw Error('Use a path length of 6–384 m and a turn of at most 180°');
  if (!Number.isFinite(grade) || Math.abs(grade)>30) throw Error('Grade must be between -30% and 30%');
  const turn = bend * radians, count = Math.max(1, Math.ceil(length / 4), Math.ceil(Math.abs(bend) / 6));
  const a = yaw * radians, c = Math.cos(a), s = Math.sin(a);
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, x = turn ? length / turn * (1 - Math.cos(turn * t)) : 0,
      z = turn ? length / turn * Math.sin(turn * t) : length * t;
    return [origin[0] + c * x + s * z, origin[1] + length * t * grade / 100, origin[2] - s * x + c * z];
  });
}
/** Custom points are explicit centreline samples; no hidden spline overshoot. */
export function validateRoute(o: RouteOptions) {
  for (const [name, value, min, max] of [
    ['width', o.width, 4, 48], ['clearance', o.height, 3, 24],
    ['depth', o.depth, 1, 16], ['cut resolution', o.resolution, .5, 4],
  ] as const) if (!Number.isFinite(value) || value < min || value > max) throw Error(`Use ${name} from ${min} to ${max} m`);
  if (o.points.length < 2 || o.points.length > 129 || o.points.some(p => p.length !== 3 || p.some(n => !Number.isFinite(n) || Math.abs(n) > 99000)))
    throw Error('Use 2–129 finite route points');
  if (!Number.isFinite(o.shoulder ?? 0) || (o.shoulder ?? 0)<0 || (o.shoulder ?? 0)>6) throw Error('Shoulders must be 0–6 m per side');
  if (o.kind.startsWith('canal') && o.points.some(p => Math.abs(p[1] - o.points[0][1]) > .001)) throw Error('Canal water surfaces must remain level; use separate reaches for elevation changes');
  let length = 0;
  for (let i = 1; i < o.points.length; i++) {
    const a = o.points[i - 1], b = o.points[i], d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (d < .25) throw Error('Route points must be at least 0.25 m apart');
    if (Math.abs(b[1]-a[1])/d > .30001) throw Error('Road grade exceeds 30%');
    length += d;
    if (i > 1) {
      const p = o.points[i - 2], dx = a[0] - p[0], dz = a[2] - p[2];
      const angle = Math.acos(Math.max(-1, Math.min(1, (dx * (b[0] - a[0]) + dz * (b[2] - a[2])) / Math.hypot(dx, dz) / d)));
      if (angle > Math.PI / 6 + .001) throw Error('Round sharp corners with intermediate points (maximum 30° per join)');
      if (angle > .001 && (Math.hypot(dx, dz) + d) / (2 * angle) < o.width + 2*(o.shoulder ?? 0))
        throw Error('Curve is too tight for this width. Increase path length or reduce the turn/width.');
    }
  }
  if (length > 384) throw Error('One operation supports up to 384 m; extend it with another segment');
  return length;
}
type Rect = { x: number; z: number; w: number; d: number };
type Cut = { a: V3; b: V3; radius: number; bottom: number; top: number };
/** Coalesce adjacent retained cells before exporting physical shapes. This
 * keeps large flat floors and roofs cheap without filling any removed volume. */
function mergeBoxes(input: LayoutPart[]) {
  let parts = input;
  const key = (n: number) => n.toFixed(6);
  for (let pass = 0; pass < 3; pass++) {
    const before = parts.length;
    for (const axis of [0, 2, 1]) {
      const groups = new Map<string, LayoutPart[]>(), other = [0, 1, 2].filter(a => a !== axis);
      const kept: LayoutPart[] = [];
      for (const p of parts) {
        if (p.shape !== 'box' || p.rise) { kept.push(p); continue; }
        const k = JSON.stringify([p.color, p.solid, ...other.flatMap(a => [key(p.position[a]), key(p.size[a])])]);
        const group = groups.get(k) ?? []; group.push(p); groups.set(k, group);
      }
      for (const group of groups.values()) {
        group.sort((a, b) => a.position[axis] - b.position[axis]);
        let last: LayoutPart | undefined;
        for (const p of group) {
          const min = p.position[axis] - p.size[axis] / 2;
          if (last && Math.abs(last.position[axis] + last.size[axis] / 2 - min) < 1e-7) {
            const low = last.position[axis] - last.size[axis] / 2, high = p.position[axis] + p.size[axis] / 2;
            last.position[axis] = (low + high) / 2; last.size[axis] = high - low;
          } else { last = { ...p, position: [...p.position], size: [...p.size] }; kept.push(last); }
        }
      }
      parts = kept;
    }
    if (parts.length === before) break;
  }
  return parts;
}
function distance(x: number, z: number, a: V3, b: V3) {
  const dx = b[0] - a[0], dz = b[2] - a[2], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz);
}
/** Separating-axis test for yawed collision boxes. Sloped/convex parts use their
 * conservative height range and are reported for inspection, never cut away. */
export function passageObstructions(objects: LayoutObject[], guides: LayoutObject[]) {
  const hits = new Set<string>();
  for (const o of objects) {
    if (!o.solid) continue;
    for (const part of o.parts) {
      if (part.solid === false) continue;
      const p = partTransform(o, part), c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const axes = [[c, -s], [s, c]], half = [p.size[0] / 2, p.size[2] / 2];
      const vertical = p.size[1] / 2 + Math.abs(part.rise ?? 0) * o.size[1] / 2;
      for (const guide of guides) {
        const low = guide.position[1] + .05, high = guide.position[1] + guide.size[1] - .05;
        if (p.position[1] + vertical <= low || p.position[1] - vertical >= high) continue;
        const a = guide.yaw * radians, gc = Math.cos(a), gs = Math.sin(a), gAxes = [[gc, -gs], [gs, gc]], gh = [guide.size[0] / 2 - .05, guide.size[2] / 2];
        const dx = p.position[0] - guide.position[0], dz = p.position[2] - guide.position[2];
        const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
        const separated = [...axes, ...gAxes].some(axis => Math.abs(dx * axis[0] + dz * axis[1]) >=
          Math.abs(dot(axis, axes[0])) * half[0] + Math.abs(dot(axis, axes[1])) * half[1] +
          Math.abs(dot(axis, gAxes[0])) * gh[0] + Math.abs(dot(axis, gAxes[1])) * gh[1] - 1e-6);
        if (!separated) { hits.add(o.name); break; }
      }
      if (hits.has(o.name)) break;
    }
  }
  return [...hits];
}
/** Conservative subtraction in each mountain's local frame. Boundary cells are
 * removed if they might intersect the requested bore; never leave a hidden
 * rock collider inside it. Y slices remain exact, preserving floors/ceilings.
 * The same retained boxes are exported to Rapier and drawn by the editor. */
function carveMountain(item: LayoutObject, cuts: Cut[], resolution: number): LayoutObject | null {
  const angle = item.yaw * radians, c = Math.cos(angle), s = Math.sin(angle);
  const local = (p: V3): V3 => {
    const x = p[0] - item.position[0], z = p[2] - item.position[2];
    return [c * x - s * z, p[1] - item.position[1], s * x + c * z];
  };
  const cut = cuts.map(k => ({ ...k, a: local(k.a), b: local(k.b), bottom: k.bottom - item.position[1], top: k.top - item.position[1] }));
  const parts: LayoutPart[] = [];
  let excavated = false;
  const emit = (r: Rect, low: number, high: number, source: LayoutPart) => {
    if (high - low < item.size[1] * .001 || r.w < item.size[0] * .001 || r.d < item.size[2] * .001) return;
    parts.push({ ...source, position: [r.x / item.size[0], (low + high) / 2 / item.size[1], r.z / item.size[2]],
      size: [r.w / item.size[0], (high - low) / item.size[1], r.d / item.size[2]] });
    if (parts.length > 12000) throw Error('Cut is too complex. Use a coarser cut or smaller mountain segments.');
  };
  for (const part of item.parts) {
    if (part.shape !== 'box' || part.rise || part.solid === false) { parts.push(part); continue; }
    const low = (part.position[1] - part.size[1] / 2) * item.size[1], high = low + part.size[1] * item.size[1];
    const visit = (r: Rect, candidates: Cut[]) => {
      const diagonal = Math.hypot(r.w, r.d) / 2;
      const intersecting = candidates.filter(k => k.bottom < high && k.top > low && distance(r.x, r.z, k.a, k.b) - diagonal < k.radius);
      if (!intersecting.length) { emit(r, low, high, part); return; }
      const inside = intersecting.some(k => distance(r.x, r.z, k.a, k.b) + diagonal <= k.radius);
      if (!inside && Math.max(r.w, r.d) > resolution + 1e-6) {
        if (r.w >= r.d) for (const sign of [-1, 1]) visit({ ...r, x: r.x + sign * r.w / 4, w: r.w / 2 }, intersecting);
        else for (const sign of [-1, 1]) visit({ ...r, z: r.z + sign * r.d / 4, d: r.d / 2 }, intersecting);
        return;
      }
      // Retain a conservative envelope across every overlapping graded cut.
      excavated = true;
      emit(r, low, Math.min(high, Math.min(...intersecting.map(k=>k.bottom))), part);
      emit(r, Math.max(low, Math.max(...intersecting.map(k=>k.top))), high, part);
    };
    visit({ x: part.position[0] * item.size[0], z: part.position[2] * item.size[2], w: part.size[0] * item.size[0], d: part.size[2] * item.size[2] }, cut);
  }
  if (!excavated) return item;
  const merged = mergeBoxes(parts);
  if (merged.length > 512) throw Error(`${item.name} exceeds 512 collision shapes after cutting. Use a coarser cut or smaller mountain segments.`);
  return merged.length ? { ...item, parts: merged } : null;
}
export function excavateRoute(doc: WorldLayout, options: RouteOptions) {
  const length = validateRoute(options), { points, height, depth, kind } = options;
  const width = options.width + (kind.startsWith('canal') ? 0 : 2*(options.shoulder ?? 0));
  const canal = kind === 'canal' || kind === 'canal-tunnel', covered = ['tunnel', 'underpass', 'canal-tunnel'].includes(kind);
  if (canal && (doc.ground !== false || doc.base !== 'replace' || doc.repeat !== false))
    throw Error('Canal excavation needs a finite standalone layout with Support ground off; the global floor would block the channel');
  const y = points[0][1], floor = canal ? y - depth : y;
  // Includes the outside lining, so terrain never pokes through a wall or roof.
  const wallOffset = width / 2 / Math.cos(Math.PI / 6) + .7;
  const radius = wallOffset + .8;
  const cuts = points.slice(1).map((b, i) => ({ a: points[i], b, radius, bottom: Math.min(points[i][1],b[1]) - (canal ? depth : 0) - (Math.abs(b[1]-points[i][1])>.001 ? 1.5 : .5), top: covered ? Math.max(points[i][1],b[1]) + height + (Math.abs(b[1]-points[i][1])>.001 ? 2 : 1) : 100001 }));
  let changed = 0;
  const retained = doc.objects.flatMap(item => {
    if (!isExcavatable(item) || item.locked || !item.solid) return [item];
    if (item.parts.some(p => p.shape !== 'box' || p.rise)) throw Error(`Convert ${item.name} to box mountain segments before excavation`);
    const next = carveMountain(item, cuts, options.resolution);
    if (JSON.stringify(next?.parts) !== JSON.stringify(item.parts)) changed++;
    return next ? [next] : [];
  });
  let index = 1;
  while (doc.objects.some(o => o.id.startsWith(`route-${index}-`))) index++;
  const prefix = `route-${index}`, generated: LayoutObject[] = [], clearance: LayoutObject[] = [];
  points.slice(1).forEach((b, i) => {
    const a = points[i], dx = b[0] - a[0], dz = b[2] - a[2], span = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz) / radians, x = (a[0] + b[0]) / 2, z = (a[2] + b[2]) / 2;
    const y = (a[1]+b[1])/2, floor = canal ? y-depth : y;
    // Overlap joins along their length; keep the passage open across the seam.
    const extension = .18 + width * .14;
    const put = (suffix: string, piece: string, base: number, size: V3, color: string, offset = 0, solid = true) => {
      const o = colliderBox(`${prefix}-${i}-${suffix}`, piece, [x + dz / span * offset, base, z - dx / span * offset], size, color, yaw, solid);
      const rise = (b[1]-a[1]) * size[2]/span;
      if (Math.abs(rise)>1e-8) {
        const thickness=size[1], scale=Math.max(thickness,Math.abs(rise)/4);
        o.yaw-=90; o.size=[size[2],scale,size[0]];
        o.parts=[{shape:'box',position:[0,thickness/2/scale,0],size:[1,thickness/scale,1],rise:rise/scale,solid}];
      }
      generated.push(o); return o;
    };
    put('floor', canal ? 'excavated-canal-bed' : 'excavated-road', floor - .5, [2 * (wallOffset + .3), .5, span + extension], canal ? '#655f52' : '#414b54');
    if (canal) put('water', 'excavated-water', y - depth, [width, depth, span + extension], '#2b7187', 0, false);
    if (covered || canal || options.rails) for (const side of [-1, 1]) {
      const wall = put(`wall-${side < 0 ? 'left' : 'right'}`, covered || canal ? 'excavated-retaining-wall' : 'highway-guardrail', floor,
        [.6, covered ? height + y - floor : canal ? depth + .8 : 1.05, span + .18], '#929a9c', side * wallOffset);
      if (!covered && !canal) wall.destruction = { enabled: true, hp: 5, smallArms: 1, cannon: 1, bomb: 1, rubble: 'clear' };
    }
    if (covered) put('roof', 'excavated-tunnel-roof', y + height, [2 * (wallOffset + .3), .6, span + extension], '#787f83');
    clearance.push(colliderBox(`${prefix}-${i}-clearance`, 'excavation-guide', [x, Math.min(a[1],b[1])-(canal?depth:0), z], [width, height + y - floor + Math.abs(b[1]-a[1]), span], '#42d6d0', yaw, false));
  });
  if (options.waterfall) {
    if (!canal) throw Error('Waterfall terminus is available for canals');
    const end = points.at(-1)!, before = points.at(-2)!, dx = end[0] - before[0], dz = end[2] - before[2], d = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz) / radians;
    generated.push(colliderBox(`${prefix}-waterfall-rock`, 'mountain-waterfall-blocker', [end[0] + dx / d * 2, floor - .5, end[2] + dz / d * 2], [width + 4, depth + height + 1, 3], '#59615e', yaw));
    generated.push(colliderBox(`${prefix}-waterfall`, 'excavated-waterfall', [end[0] + dx / d * .45, y, end[2] + dz / d * .45], [width * .8, height, .12], '#71c3d2', yaw, false));
  }
  const result = parseLayout({ ...doc, objects: [...retained, ...generated] });
  return { doc: result, clearance, length, changed,
    obstructions: passageObstructions(retained, clearance),
    uncheckedAssets: retained.filter(o => o.solid && (o.model || o.road || o.piece.startsWith('kit-'))).length,
    shapes: result.objects.reduce((n, o) => n + o.parts.filter(p => o.solid && p.solid !== false).length, 0) };
}
