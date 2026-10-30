import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Unit } from "./types";
const { loadAsync } = vi.hoisted(() => ({ loadAsync: vi.fn() }));
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({ GLTFLoader: class { loadAsync = loadAsync; } }));
import { UnitModelAssets } from "./unit-model-assets";

function unit(id: number) { return { id, type: "infantry" } as Unit; }
function asset() {
  const scene = new THREE.Group(), geometry = new THREE.BoxGeometry(.3, 1, .3);
  const material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(geometry, material));
  return { scene, animations: [] as THREE.AnimationClip[], geometry, material };
}
function manifest(entries: unknown[]) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => entries })); }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); loadAsync.mockReset(); });

describe("bounded unit asset rendering", () => {
  it("does not request models before approved files are enabled", async () => {
    manifest([]); const library = new UnitModelAssets();
    await Promise.resolve(); await Promise.resolve();
    expect(loadAsync).not.toHaveBeenCalled();
    const fallback = new THREE.Group();
    library.update(unit(1), new THREE.Group(), fallback, true, false, false, .1, false);
    expect(fallback.visible).toBe(true); library.dispose();
  });
  it("shares GPU assets, caps detailed clones, and frees clones without disposing shared geometry", async () => {
    const source = asset(); manifest([{ type: "infantry", file: "infantry.glb" }]);
    loadAsync.mockResolvedValue(source);
    const library = new UnitModelAssets(); await vi.waitFor(() => expect(library.stats.loaded).toBe(1));
    const dispose = vi.spyOn(source.geometry, "dispose"), parents: THREE.Group[] = [];
    for (let id = 0; id < 30; id++) parents.push(new THREE.Group());
    for (let frame = 0; frame < 12; frame++) {
      library.beginFrame();
      for (let id = 0; id < 30; id++) library.update(unit(id), parents[id], new THREE.Group(), true, false, false, .1, false);
      library.endFrame();
      if (frame === 0) expect(library.stats.detailed).toBe(2);
    }
    library.endFrame(); expect(library.stats.detailed).toBe(24);
    const clonedMesh = parents[0].children[0].children[0].children[0] as THREE.Mesh;
    expect(clonedMesh.geometry).toBe(source.geometry);
    library.beginFrame(); library.endFrame();
    expect(parents.every(parent => parent.children.length === 0)).toBe(true);
    expect(dispose).not.toHaveBeenCalled(); library.dispose(); expect(dispose).toHaveBeenCalledTimes(1);
  });
  it("uses configured movement and firing clips and limits mixer updates", async () => {
    const source = asset(); source.animations = ["Idle", "Walk", "Fire"].map(name => new THREE.AnimationClip(name, 1, []));
    manifest([{ type: "infantry", file: "infantry.glb", clips: { idle: "Idle", walk: "Walk", fire: "Fire" } }]);
    loadAsync.mockResolvedValue(source);
    const library = new UnitModelAssets(); await vi.waitFor(() => expect(library.stats.loaded).toBe(1));
    const play = vi.spyOn(THREE.AnimationAction.prototype, "play");
    library.beginFrame(); const parent = new THREE.Group(), fallback = new THREE.Group();
    library.update(unit(1), parent, fallback, true, true, false, .05, false);
    expect((play.mock.instances.at(-1) as THREE.AnimationAction).getClip().name).toBe("Walk");
    library.update(unit(1), parent, fallback, true, false, true, .05, false);
    expect((play.mock.instances.at(-1) as THREE.AnimationAction).getClip().name).toBe("Fire");
    const parents = Array.from({length: 20}, (_, i) => i === 0 ? parent : new THREE.Group());
    for (let frame = 0; frame < 10; frame++) {
      library.beginFrame();
      for (let id = 1; id <= 20; id++) library.update(unit(id), parents[id-1], new THREE.Group(), true, false, false, .05, false);
      library.endFrame();
    }
    expect(library.stats.animated).toBe(12); library.dispose();
  });
  it("recoils the tank cannon on a shot and restores its original pose", async () => {
    const source=asset(),cannon=new THREE.Bone();cannon.name="cannon_2";source.scene.add(cannon);
    manifest([{type:"armor",file:"armor.glb",recoilBone:"cannon_2"}]);loadAsync.mockResolvedValue(source);
    const library=new UnitModelAssets();await library.ready;
    const parent=new THREE.Group(),fallback=new THREE.Group(),tank={...unit(1),type:"armor"} as Unit;
    library.beginFrame();library.update(tank,parent,fallback,true,false,true,.05,false,0);
    const clone=parent.getObjectByName("cannon_2")!;expect(clone.position.length()).toBeGreaterThan(0);
    expect(cannon.position.length()).toBe(0);
    library.beginFrame();library.update(tank,parent,fallback,true,false,false,.05,false,1);
    expect(clone.position.length()).toBeCloseTo(0);library.dispose();
  });
  it("rejects excessive material draw calls and keeps the fallback", async () => {
    const source = asset();
    for (let i = 0; i < 8; i++) source.scene.add(new THREE.Mesh(source.geometry, source.material));
    manifest([{ type: "infantry", file: "infantry.glb" }]); loadAsync.mockResolvedValue(source);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const dispose = vi.spyOn(source.geometry, "dispose"), library = new UnitModelAssets();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(library.stats.loaded).toBe(0); library.dispose();
  });
});
