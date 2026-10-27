import * as THREE from "three";
import type { Point, Polygon } from "./types";

export function disposeObject(root: THREE.Object3D, preserveGeometries: ReadonlySet<THREE.BufferGeometry> = new Set()) {
  const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>(), textures=new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if(mesh.geometry&&!preserveGeometries.has(mesh.geometry)&&!geometries.has(mesh.geometry)){geometries.add(mesh.geometry);mesh.geometry.dispose();}
    if (mesh.material)
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        if(materials.has(material))continue;
        materials.add(material);
        const textured = material as THREE.MeshBasicMaterial;
        if(textured.map&&!textures.has(textured.map)){textures.add(textured.map);textured.map.dispose();}
        material.dispose();
      }
  });
  root.removeFromParent();
}

export function polygonGeometry(polygon: Polygon) {
  const shape = new THREE.Shape(
    polygon[0].map((p) => new THREE.Vector2(p[0], -p[1])),
  );
  for (const hole of polygon.slice(1))
    shape.holes.push(
      new THREE.Path(hole.map((p) => new THREE.Vector2(p[0], -p[1]))),
    );
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function flatLines(
  polygons: Polygon[],
  y: number,
  color: THREE.ColorRepresentation,
  opacity = 0.5,
) {
  const vertices: number[] = [];
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        vertices.push(a[0], y, a[1], b[0], y, b[1]);
      }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

export function labelSprite(text: string, color = "#c1cabe", scale = 5) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.font = "500 26px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "#0a1015";
  context.shadowBlur = 7;
  context.fillStyle = color;
  context.fillText(text.toUpperCase(), 256, 32, 490);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(scale * 4, scale / 2, 1);
  return sprite;
}

export function pathLine(points: Point[], color: THREE.ColorRepresentation) {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(p[0], 0.25, p[1])),
  );
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
  );
}

export function hash(text: string) {
  let value = 0;
  for (const character of text)
    value = ((value << 5) - value + character.charCodeAt(0)) | 0;
  return Math.abs(value);
}

export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
