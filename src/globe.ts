import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { disposeObject, seeded } from "./render-utils";
import { regions } from "./regions";
import type { Point } from "./types";

interface OverviewCountry {
  id: string;
  continent: string;
  coordinates: Point[][][];
}
export interface OverviewData {
  countries: OverviewCountry[];
  counts: Record<string, number>;
}
export const globePoint = (lon: number, lat: number, radius = 5) => {
  const a = THREE.MathUtils.degToRad(lon),
    b = THREE.MathUtils.degToRad(lat);
  return new THREE.Vector3(
    Math.cos(b) * Math.cos(a),
    Math.sin(b),
    -Math.cos(b) * Math.sin(a),
  ).multiplyScalar(radius);
};

export class GlobeView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  readonly controls: OrbitControls;
  readonly globe: THREE.Mesh;
  readonly markers = new Map<string, THREE.Vector3>();
  private highlights = new THREE.Group();
  private desired: THREE.Vector3 | null = null;
  private focusDistance = 18;
  private data: OverviewData | null = null;
  private readonly onControlsStart = () => {
    this.desired = null;
  };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color("#0c1621");
    this.camera.position.copy(globePoint(18, 40, 19));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.autoRotate = false;
    this.controls.enablePan = false;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 30;
    this.controls.addEventListener("start", this.onControlsStart);
    const texture = new THREE.TextureLoader().load("/textures/earth.jpg");
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    this.globe = new THREE.Mesh(
      new THREE.SphereGeometry(5, 96, 64),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 1,
        metalness: 0,
        color: "#b6c6c9",
      }),
    );
    this.scene.add(this.globe, this.highlights);
    this.scene.add(new THREE.AmbientLight("#d4e0ed", 2.1));
    const sun = new THREE.DirectionalLight("#fff2db", 2.1);
    sun.position.set(-5, 10, 8);
    this.scene.add(sun);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(5.14, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader:
          "varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(normalMatrix*normal); vec4 p=modelViewMatrix*vec4(position,1.0); vPosition=p.xyz; gl_Position=projectionMatrix*p;}",
        fragmentShader:
          "varying vec3 vNormal; varying vec3 vPosition; void main(){float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(-vPosition))),3.0); gl_FragColor=vec4(0.25,0.56,0.7,rim*0.42);}",
      }),
    );
    this.scene.add(atmosphere);
    const random = seeded(1042),
      starPositions: number[] = [];
    for (let i = 0; i < 1800; i++) {
      const theta = random() * Math.PI * 2,
        z = random() * 2 - 1,
        radius = 75 + random() * 70;
      starPositions.push(
        radius * Math.sqrt(1 - z * z) * Math.cos(theta),
        radius * z,
        radius * Math.sqrt(1 - z * z) * Math.sin(theta),
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starPositions, 3),
    );
    this.scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: "#bbd4d9",
          size: 0.075,
          transparent: true,
          opacity: 0.6,
          sizeAttenuation: true,
        }),
      ),
    );
    regions.forEach((r) =>
      this.markers.set(r.id, globePoint(...r.center, 5.05)),
    );
  }

  setData(data: OverviewData) {
    this.data = data;
    this.scene.add(this.makeBorders(data.countries, "#d8e8df", 0.25, 5.012));
  }

  private makeBorders(
    countries: OverviewCountry[],
    color: string,
    opacity: number,
    radius: number,
  ) {
    const vertices: number[] = [];
    for (const country of countries)
      for (const polygon of country.coordinates)
        for (const ring of polygon)
          for (let i = 1; i < ring.length; i++) {
            const a = globePoint(...ring[i - 1], radius),
              b = globePoint(...ring[i], radius);
            const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.12));
            for (let j = 0; j < steps; j++) {
              const p = a
                .clone()
                .lerp(b, j / steps)
                .normalize()
                .multiplyScalar(radius);
              const q = a
                .clone()
                .lerp(b, (j + 1) / steps)
                .normalize()
                .multiplyScalar(radius);
              vertices.push(...p.toArray(), ...q.toArray());
            }
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

  focus(id: string, animate = true) {
    const region = regions.find((r) => r.id === id)!;
    this.desired = globePoint(...region.center, 1);
    this.controls.enabled = true;
    if (!animate) {
      this.camera.position
        .copy(this.desired)
        .multiplyScalar(this.focusDistance);
      this.camera.lookAt(0, 0, 0);
    }
    disposeObject(this.highlights);
    this.highlights = new THREE.Group();
    this.scene.add(this.highlights);
    if (this.data)
      this.highlights.add(
        this.makeBorders(
          this.data.countries.filter(
            (c) =>
              c.continent === region.name || (id === "asia" && c.id === "RUS"),
          ),
          "#e4c48b",
          0.9,
          5.025,
        ),
      );
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const limitingFov = Math.min(
      halfFov,
      Math.atan(Math.tan(halfFov) * this.camera.aspect),
    );
    const fit = 5.25 / Math.sin(limitingFov);
    this.controls.minDistance = fit * (width <= 800 ? 1.08 : 1.2);
    this.controls.maxDistance = Math.max(fit * 1.7, 30);
    this.focusDistance = this.controls.minDistance;
    if (width <= 800)
      this.camera.setViewOffset(width, height, 0, height * 0.1, width, height);
    else this.camera.clearViewOffset();
    if (this.camera.position.length() < this.controls.minDistance)
      this.camera.position.setLength(this.controls.minDistance);
  }

  update(dt: number) {
    if (this.desired) {
      const length = THREE.MathUtils.lerp(
        this.camera.position.length(),
        this.focusDistance,
        1 - Math.exp(-dt * 3),
      );
      const direction = this.camera.position
        .clone()
        .normalize()
        .lerp(this.desired, 1 - Math.exp(-dt * 3))
        .normalize();
      this.camera.position.copy(direction).multiplyScalar(length);
      if (direction.distanceTo(this.desired) < 0.001) this.desired = null;
    }
    this.controls.update();
  }

  markerPosition(id: string, width: number, height: number) {
    const point = this.markers.get(id)!;
    const visible = point.dot(this.camera.position.clone().sub(point)) > 0;
    const projected = point.clone().project(this.camera);
    return {
      x: ((projected.x + 1) / 2) * width,
      y: ((1 - projected.y) / 2) * height,
      visible: visible && projected.z < 1,
    };
  }

  pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((clientY - rect.top) / rect.height) * 2,
      ),
      this.camera,
    );
    const hit = raycaster.intersectObject(this.globe)[0];
    if (!hit) return null;
    return regions.reduce((best, r) =>
      this.markers.get(r.id)!.distanceTo(hit.point) <
      this.markers.get(best.id)!.distanceTo(hit.point)
        ? r
        : best,
    ).id;
  }

  dispose() {
    this.controls.dispose();
    disposeObject(this.scene);
  }
}
