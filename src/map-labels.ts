import * as THREE from "three";
import { cellPoint } from "./navigation";
import type { ContinentData, Grid, Point } from "./types";

export interface NationLabelLayout {
  id: string;
  lines: string[];
  x: number;
  z: number;
  angle: number;
  width: number;
  height: number;
}

function linesFor(name: string, ratio: number): string[] {
  const words = name.toUpperCase().split(/\s+/);
  if (name.length < 19 || words.length < 2 || ratio > 2.6)
    return [name.toUpperCase()];
  let best = [name.toUpperCase()],
    score = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")],
      diff = Math.abs(lines[0].length - lines[1].length);
    if (diff < score) {
      best = lines;
      score = diff;
    }
  }
  return best;
}

/** One flood pass finds main landmasses; fitted text rectangles stay inside their nation. */
export function nationLabelLayouts(
  data: ContinentData,
  grid: Grid,
): NationLabelLayout[] {
  const seen = new Uint8Array(grid.owners.length),
    main = new Map<number, number[]>(),
    clearance = new Uint16Array(grid.owners.length);
  for (let start = 0; start < seen.length; start++)
    if (!seen[start] && grid.owners[start] >= 0) {
      const owner = grid.owners[start],
        cells = [start];
      seen[start] = 1;
      for (let q = 0; q < cells.length; q++) {
        const i = cells[q],
          col = i % grid.width;
        for (const j of [
          col > 0 ? i - 1 : -1,
          col < grid.width - 1 ? i + 1 : -1,
          i - grid.width,
          i + grid.width,
        ])
          if (
            j >= 0 &&
            j < seen.length &&
            !seen[j] &&
            grid.owners[j] === owner
          ) {
            seen[j] = 1;
            cells.push(j);
          }
      }
      if (cells.length > (main.get(owner)?.length ?? 0)) main.set(owner, cells);
    }
  for (let i = 0; i < clearance.length; i++)
    if (grid.owners[i] >= 0) {
      const x = i % grid.width;
      clearance[i] =
        1 +
        Math.min(
          x > 0 && grid.owners[i - 1] === grid.owners[i] ? clearance[i - 1] : 0,
          i >= grid.width && grid.owners[i - grid.width] === grid.owners[i]
            ? clearance[i - grid.width]
            : 0,
        );
    }
  for (let i = clearance.length - 1; i >= 0; i--)
    if (grid.owners[i] >= 0) {
      const x = i % grid.width;
      clearance[i] = Math.min(
        clearance[i],
        1 +
          Math.min(
            x < grid.width - 1 && grid.owners[i + 1] === grid.owners[i]
              ? clearance[i + 1]
              : 0,
            i + grid.width < clearance.length &&
              grid.owners[i + grid.width] === grid.owners[i]
              ? clearance[i + grid.width]
              : 0,
          ),
      );
    }
  const ownerAt = (x: number, z: number) => {
    const col = Math.floor((x - grid.x) / grid.cell),
      row = Math.floor((z - grid.z) / grid.cell);
    return col < 0 || row < 0 || col >= grid.width || row >= grid.height
      ? -1
      : grid.owners[row * grid.width + col];
  };
  const result: NationLabelLayout[] = [];
  for (const [owner, cells] of main) {
    if (cells.length < 14) continue;
    const points = cells.map((i) => cellPoint(grid, i)),
      cx = points.reduce((s, p) => s + p[0], 0) / points.length,
      cz = points.reduce((s, p) => s + p[1], 0) / points.length;
    let xx = 0,
      zz = 0,
      xz = 0;
    for (const p of points) {
      xx += (p[0] - cx) ** 2;
      zz += (p[1] - cz) ** 2;
      xz += (p[0] - cx) * (p[1] - cz);
    }
    const principal = 0.5 * Math.atan2(2 * xz, xx - zz),
      major = Math.sqrt(Math.max(xx, zz) / points.length),
      minor = Math.sqrt(Math.min(xx, zz) / points.length);
    const lines = linesFor(
      data.countries[owner].name,
      major / Math.max(grid.cell, minor),
    );
    const aspect =
      (Math.max(...lines.map((s) => s.length)) * 0.7) /
      (lines.length * 1.3 + 0.15);
    const candidates = cells
      .map((i, n) => ({
        i,
        p: points[n],
        score:
          clearance[i] * grid.cell -
          Math.hypot(points[n][0] - cx, points[n][1] - cz) * 0.13,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    let best: NationLabelLayout | undefined,
      upright:NationLabelLayout|undefined,
      uprightScore=0,
      bestScore = 0;
    for (const candidate of candidates)
      for (const angle of [0, principal, principal - 0.2, principal + 0.2]) {
        const c = Math.cos(angle),
          s = Math.sin(angle);
        let forward = 0,
          back = 0;
        for (const sign of [-1, 1]) {
          let d = 0;
          for (; d < 250; d += grid.cell * 0.5)
            if (
              ownerAt(
                candidate.p[0] + sign * c * d,
                candidate.p[1] + sign * s * d,
              ) !== owner
            )
              break;
          if (sign === 1) forward = d;
          else back = d;
        }
        const shift = (forward - back) * 0.5,
          x = candidate.p[0] + c * shift,
          z = candidate.p[1] + s * shift;
        let width = (forward + back) * 0.78;
        for (let attempt = 0; attempt < 10; attempt++, width *= 0.84) {
          const height = Math.min(width / aspect, 3.3);
          if (height < grid.cell * 0.65) break;
          let fits = true;
          for (let row = -1; row <= 1 && fits; row++)
            for (let col = -4; col <= 4; col++) {
              const dx = (col / 8) * width,
                dz = (row / 2) * height;
              if (ownerAt(x + dx * c - dz * s, z + dx * s + dz * c) !== owner) {
                fits = false;
                break;
              }
            }
          if (fits) {
            const score = height / (1 + Math.hypot(x - cx, z - cz) * 0.035);
            if(angle===0&&score>uprightScore){uprightScore=score;upright={id:data.countries[owner].id,lines,x,z,angle:0,width,height};}
            if (score > bestScore) {
              bestScore = score;
              best = {
                id: data.countries[owner].id,
                lines,
                x,
                z,
                angle,
                width,
                height,
              };
            }
            break;
          }
        }
      }
    if(upright&&(!best||upright.height>=Math.min(0.8,best.height*0.55)))best=upright;
    if (best) result.push(best);
  }
  return result;
}

/** Outlined, tracked capitals on the map surface instead of camera-facing sprites. */
export function nationLabelMesh(
  layout: NationLabelLayout,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!,
    fontSize = 54,
    tracking = 3;
  const font = `600 ${fontSize}px Manrope, sans-serif`;
  ctx.font = font;
  const widths = layout.lines.map(
    (line) =>
      Array.from(line).reduce((s, c) => s + ctx.measureText(c).width, 0) +
      Math.max(0, Array.from(line).length - 1) * tracking,
  );
  const textWidth = Math.max(...widths),
    textHeight = layout.lines.length * fontSize * 1.3 + 18;
  canvas.width = THREE.MathUtils.ceilPowerOfTwo(Math.min(2048, textWidth + 40));
  canvas.height = THREE.MathUtils.ceilPowerOfTwo(textHeight + 20);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#17222d";
  ctx.fillStyle = "#d0d3d0";
  ctx.lineWidth = 5;
  layout.lines.forEach((line, row) => {
    let x = (canvas.width - widths[row]) / 2;
    const baseline =
        canvas.height / 2 +
        (row - (layout.lines.length - 1) / 2) * fontSize * 1.3,
      arc = layout.lines.length === 1 ? Math.min(10, widths[row] * 0.02) : 0;
    for (const char of Array.from(line)) {
      const w = ctx.measureText(char).width,
        center = x + w / 2,
        t = (center - canvas.width / 2) / Math.max(1, widths[row] / 2);
      ctx.save();
      ctx.translate(center, baseline + arc * t * t);
      ctx.rotate(Math.atan((4 * arc * t) / Math.max(1, widths[row])));
      ctx.strokeText(char, 0, 0);
      ctx.fillText(char, 0, 0);
      ctx.restore();
      x += w + tracking;
    }
  });
  const scale = Math.min(
      layout.width / (textWidth + 8),
      layout.height / textHeight,
    ),
    texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(canvas.width * scale, canvas.height * scale),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.86,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  mesh.rotation.set(-Math.PI / 2, 0, -layout.angle);
  mesh.position.set(layout.x, 0.16, layout.z);
  mesh.renderOrder = 2;
  return mesh;
}
