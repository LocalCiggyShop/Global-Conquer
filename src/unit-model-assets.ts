import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { Unit } from "./types";

type Kind = Unit["type"];
interface Entry {
  type: Kind;
  file: string;
  /** Explicit clip names: never guess that a rig includes animations. */
  clips?: Partial<Record<"idle" | "walk" | "fire" | "walkFire", string>>;
  rotationY?: number;
  recoilBone?: string;
}
interface Template { gltf: GLTF; entry: Entry; scale: number; center: THREE.Vector3 }
interface Instance { recoil?: {bone:THREE.Object3D;base:THREE.Vector3;delta:THREE.Vector3}; root: THREE.Group; mixer?: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; current?: string; accumulator: number }
const MAX_DETAILS = 24, MAX_ANIMATIONS = 12;
const LIMITS: Record<Kind, number> = { infantry: 12000, armor: 30000, frigate: 10000, transport: 15000 };

/** One library per map. Clones share immutable GPU assets; skeletons remain independent. */
export class UnitModelAssets {
  private templates = new Map<Kind, Template>();
  private instances = new Map<number, Instance>();
  private disposed = false;
  private detailed = 0;
  private animated = 0;
  private createdThisFrame = 0;
  readonly ready: Promise<void>;
  readonly stats = { loaded: 0, detailed: 0, animated: 0, trianglesPerModel: {} as Partial<Record<Kind, number>> };

  constructor() { this.ready = this.load(); }
  async prepareGraphics(renderer: THREE.WebGLRenderer, camera: THREE.Camera, target: THREE.Scene) {
    await this.ready;
    if (this.disposed) return;
    const staging = new THREE.Scene();
    for (const {gltf} of this.templates.values()) staging.add(gltf.scene);
    try {
      await renderer.compileAsync(staging, camera, target);
      const textures = new Set<THREE.Texture>();
      staging.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      });
      for (const texture of textures) renderer.initTexture(texture);
    } finally { staging.clear(); }
  }
  private async load() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}models/units.json`);
      if (!response.ok) return;
      const entries = await response.json() as Entry[];
      const loader = new GLTFLoader();
      // Sequential loading avoids decoding several models in the same frame.
      for (const entry of entries) {
        if (this.disposed) break;
        if (!(entry.type in LIMITS) || !/^[\w/-]+\.glb$/.test(entry.file) || entry.file.includes("..")) continue;
        try {
          const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${entry.file}`);
          let triangles = 0, draws = 0;
          const textures = new Set<THREE.Texture>();
          gltf.scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            triangles += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3;
            draws += Math.max(1, object.geometry.groups.length);
            for (const material of Array.isArray(object.material) ? object.material : [object.material])
              for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
            object.castShadow = false; object.receiveShadow = false;
          });
          let texturePixels = 0, oversizedTexture = false;
          for (const texture of textures) {
            const image = texture.image as { width?: number; height?: number } | undefined;
            const width = image?.width ?? 0, height = image?.height ?? 0;
            texturePixels += width * height;
            oversizedTexture ||= width > 1024 || height > 1024;
          }
          gltf.scene.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(gltf.scene);
          const size = bounds.getSize(new THREE.Vector3());
          if (this.disposed || triangles > LIMITS[entry.type] || draws > 8 || oversizedTexture || texturePixels > 4 * 1024 * 1024 || size.lengthSq() === 0 || this.templates.has(entry.type)) {
            this.release(gltf);
            if (!this.disposed) console.warn(`Unit model rejected: ${entry.type} (${triangles} triangles, ${draws} draws, ${texturePixels} texture pixels). Optimize before enabling.`);
            continue;
          }
          const center = bounds.getCenter(new THREE.Vector3()); center.y = bounds.min.y;
          const extent = entry.type === "infantry" ? size.y : Math.max(size.x, size.z);
          this.templates.set(entry.type, { gltf, entry, center, scale: (entry.type === "infantry" ? 1 : 1.7) / extent });
          this.stats.trianglesPerModel[entry.type] = triangles;
          this.stats.loaded++;
        } catch (error) { console.warn(`Unable to load ${entry.type} model; retaining lightweight fallback.`, error); }
      }
    } catch (error) { console.warn("Unit model manifest unavailable; retaining lightweight models.", error); }
  }
  beginFrame() { for (const instance of this.instances.values()) instance.root.visible = false; this.createdThisFrame = 0; this.detailed = 0; this.animated = 0; this.stats.detailed = 0; this.stats.animated = 0; }
  endFrame() { for (const [id, instance] of this.instances) if (!instance.root.visible) this.remove(id); }
  update(unit: Unit, parent: THREE.Group, fallback: THREE.Group, eligible: boolean, moving: boolean, firing: boolean, dt: number, paused: boolean, fireAge=Infinity) {
    const template = this.templates.get(unit.type);
    let instance = this.instances.get(unit.id);
    const show = !!template && eligible && this.detailed < MAX_DETAILS;
    fallback.visible = !show;
    if (instance) instance.root.visible = show;
    if (!show || !template) return;
    if (!instance) {
      // Spread skeleton/mixer allocation over frames when zooming into an army.
      if (this.createdThisFrame >= 2) { fallback.visible = true; return; }
      this.createdThisFrame++;
      const root = new THREE.Group(), mesh = clone(template.gltf.scene);
      mesh.position.copy(template.center).multiplyScalar(-template.scale);
      mesh.scale.setScalar(template.scale);
      root.add(mesh); root.rotation.y = template.entry.rotationY ?? 0;
      const actions = new Map<string, THREE.AnimationAction>();
      const mixer = template.gltf.animations.length ? new THREE.AnimationMixer(mesh) : undefined;
      if (mixer) for (const clip of template.gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
      instance = { root, mixer, actions, accumulator: 0 };
      this.instances.set(unit.id, instance); parent.add(root);
      const bone=template.entry.recoilBone?mesh.getObjectByName(template.entry.recoilBone):undefined;
      if(bone?.parent){
        root.updateWorldMatrix(true,true);
        const start=parent.localToWorld(new THREE.Vector3()),end=parent.localToWorld(new THREE.Vector3(0,0,.06));
        const delta=bone.parent.worldToLocal(end).sub(bone.parent.worldToLocal(start));
        instance.recoil={bone,base:bone.position.clone(),delta};
      }
    }
    this.stats.detailed = ++this.detailed;
    if(instance.recoil){const {bone,base,delta}=instance.recoil;bone.position.copy(base).addScaledVector(delta,Math.max(0,1-fireAge/.3));}
    if (!instance.mixer || this.animated >= MAX_ANIMATIONS || paused) return;
    this.stats.animated = ++this.animated;
    const clips = template.entry.clips;
    const name = moving ? (firing ? clips?.walkFire ?? clips?.walk : clips?.walk) : firing ? clips?.fire : clips?.idle;
    if (name !== instance.current) {
      const previous = instance.current ? instance.actions.get(instance.current) : undefined;
      previous?.fadeOut(.15);
      const next = name ? instance.actions.get(name) : undefined;
      next?.reset().fadeIn(.15).play(); instance.current = name;
    }
    instance.accumulator += Math.min(dt, .1);
    // 20 Hz skeletal sampling; transforms still follow the smooth render position.
    if (instance.accumulator >= .05) { instance.mixer.update(instance.accumulator); instance.accumulator = 0; }
  }
  remove(id: number) {
    const instance = this.instances.get(id);
    if (!instance) return;
    instance.mixer?.stopAllAction();
    if (instance.mixer) instance.mixer.uncacheRoot(instance.mixer.getRoot());
    const skeletons = new Set<THREE.Skeleton>();
    instance.root.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
    skeletons.forEach(skeleton => skeleton.dispose());
    instance.root.removeFromParent(); this.instances.delete(id);
  }
  private release(gltf: GLTF) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  }
  dispose() {
    this.disposed = true;
    for (const id of this.instances.keys()) this.remove(id);
    for (const template of this.templates.values()) this.release(template.gltf);
    this.templates.clear();
  }
}
