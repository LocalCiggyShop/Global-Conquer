import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cellAt, cellPoint } from "./navigation";
import {
  disposeObject,
  flatLines,
  hash,
  labelSprite,
  pathLine,
  polygonGeometry,
} from "./render-utils";
import type { Simulation } from "./campaign";
import type { Building, ContinentData, Grid, Point, Unit } from "./types";
import { nationLabelLayouts, nationLabelMesh } from "./map-labels";
import {CityOverlay} from "./city-overlay";
import type {PreparedDeployment,PackedGeometry} from "./deployment";
import {commodities} from "./economy";
import { PoliticalTerrain } from "./political-terrain";
import { activeOccupation, activeSeaControl } from "./territory-style";
import { nationColor, isShip } from "./geopolitics";

const PLAYER = "#66CBB5",
  ENEMY = "#D87570",
  GOLD = "#DDB565";
const NEUTRAL = "#9ebee0";
interface Model {
  group: THREE.Group;
  ring: THREE.Mesh;
  health: THREE.Mesh;
  bar: THREE.Group;
  from:THREE.Vector3;
  target:THREE.Vector3;
  movedTick:number;
}

export class PlayView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-80, 80, 50, -50, 0.1, 700);
  readonly controls: MapControls;
  readonly units = new Map<number, Model>();
  readonly buildings = new Map<number, THREE.Group>();
  readonly selected = new Set<number>();
  readonly modelStats = { unitsCreated:0, buildingsCreated:0 };
  private cityBlocks: THREE.InstancedMesh | null = null;
  private readonly cityOverlay:CityOverlay;
  private countryLabels: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private landOverlay: THREE.InstancedMesh | null = null;
  private seaOverlay: THREE.InstancedMesh | null = null;
  private territoryRevision = -1;
  private politicalKey = "";
  private seaKey = "";
  private readonly politicalTerrain: PoliticalTerrain;
  private readonly frontlineGroup = new THREE.Group();
  private frontlineKey = "";
  private readonly minimapTerrain = document.createElement("canvas");
  private minimapKey = "";
  private readonly minimapBase=document.createElement("canvas");
  private readonly minimapMask=document.createElement("canvas");
  private readonly minimapOwnership=document.createElement("canvas");
  private readonly minimapBorders=document.createElement("canvas");
  private readonly minimapPolygons:ContinentData["countries"];
  readonly performanceStats={minimapMs:0,terrainMs:0};
  readonly frontlineColors = new Set<string>();
  private readonly stateBorders: THREE.LineSegments;
  private readonly countryMaterials = new Map<
    string,
    { material: THREE.MeshStandardMaterial; color: THREE.Color }
  >();
  private readonly pathGroup = new THREE.Group();
  private readonly nodeGroup = new THREE.Group();
  private readonly ghost: THREE.Mesh;
  private readonly orderMarker: THREE.Mesh;
  private orderLife = 0;
  private pathTimer = 0;
  private shots: { object: THREE.Line; life: number }[] = [];
  private unitGeometry = new THREE.CylinderGeometry(0.22, 0.29, 0.5, 6);
  private headGeometry = new THREE.SphereGeometry(0.15, 6, 5);
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly keys = new Set<string>();
  private readonly keyDown = (event: KeyboardEvent) => {
    if (
      !document.querySelector("dialog[open]") &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLSelectElement)
    )
      this.keys.add(event.code);
  };
  private readonly keyUp = (event: KeyboardEvent) =>
    this.keys.delete(event.code);
  private readonly blur = () => this.keys.clear();

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly data: ContinentData,
    readonly grid: Grid,
    readonly simulation: Simulation,
    prepared?:PreparedDeployment,
  ) {
    this.minimapPolygons=data.countries.map((c)=>({...c,polygons:prepared?.countries.find((p)=>p.id===c.id)?.minimap??c.polygons}));
    this.scene.background = new THREE.Color("#0c2035");
    this.scene.add(new THREE.AmbientLight("#cadbd7", 2.3));
    const sun = new THREE.DirectionalLight("#ffefcd", 3);
    sun.position.set(-30, 80, 30);
    this.scene.add(sun);
    const oceanMaterial = new THREE.ShaderMaterial({
      uniforms:{deep:{value:new THREE.Color("#0b1d32")},light:{value:new THREE.Color("#18374f")}},
      vertexShader:`varying vec2 seaPosition;
        void main(){seaPosition=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform vec3 deep; uniform vec3 light; varying vec2 seaPosition;
        void main(){float shade=0.42+0.16*sin(seaPosition.x*0.027+seaPosition.y*0.018)+0.12*cos(seaPosition.y*0.041);
        gl_FragColor=vec4(mix(deep,light,shade),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 1800),
      oceanMaterial,
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.12;
    this.scene.add(ocean);
    const stateEdges: number[] = [];
    for (let i = 0; i < grid.owners.length; i++) {
      if (grid.owners[i] < 0) continue;
      const p = cellPoint(grid, i), h = grid.cell / 2;
      for (const [j, edge] of [
        [i % grid.width < grid.width - 1 ? i + 1 : -1, [p[0] + h, 0.135, p[1] - h, p[0] + h, 0.135, p[1] + h]],
        [i + grid.width, [p[0] - h, 0.135, p[1] + h, p[0] + h, 0.135, p[1] + h]],
      ] as [number, number[]][]) {
        if (j >= 0 && j < grid.owners.length && grid.owners[j] === grid.owners[i] &&
          simulation.territory.membership[i] !== simulation.territory.membership[j]) stateEdges.push(...edge);
      }
    }
    this.stateBorders = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(stateEdges, 3)),
      new THREE.LineBasicMaterial({ color: "#253342", transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.stateBorders.visible=false;
    this.scene.add(this.stateBorders);
    this.politicalTerrain = new PoliticalTerrain(grid, data,prepared?.fields);
    for (const country of data.countries) {
      const color = new THREE.Color(
        nationColor(country.id, data),
      ).multiplyScalar(0.72);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
      });
      this.politicalTerrain.attach(material,country.id);
      this.countryMaterials.set(country.id, { material, color: color.clone() });
      const packed=prepared?.countries.find((c)=>c.id===country.id)?.geometry;
      const pieces=packed?[]:country.polygons.map(polygonGeometry);
      const mesh = new THREE.Mesh(packed?this.unpack(packed):mergeGeometries(pieces), material);
      mesh.position.y = 0.02;
      this.scene.add(mesh);
      pieces.forEach((piece) => piece.dispose());
      const border=prepared?.countries.find((c)=>c.id===country.id)?.border;
      if(border){const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(border,3));this.scene.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:"#14202b",transparent:true,opacity:0.95})));}
      else this.scene.add(flatLines(country.polygons,0.08,"#14202b",0.95));
    }
    for (const layout of prepared?[]:nationLabelLayouts(data, grid)) {
      const label = nationLabelMesh(layout);
      this.countryLabels.push(label);
      this.scene.add(label);
    }
    const lakeMaterial = oceanMaterial.clone();
    lakeMaterial.vertexShader=`varying vec2 seaPosition;
      void main(){seaPosition=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
    if (data.lakes.length) {
      const pieces=prepared?.lakes?[]:data.lakes.map(polygonGeometry);
      const mesh = new THREE.Mesh(prepared?.lakes?this.unpack(prepared.lakes):mergeGeometries(pieces), lakeMaterial);
      mesh.position.y = 0.09;
      this.scene.add(mesh);
      pieces.forEach((piece) => piece.dispose());
    }
    this.scene.add(this.pathGroup, this.nodeGroup, this.frontlineGroup);
    this.createNodes();
    this.createWorldDetails();
    this.cityOverlay=new CityOverlay(canvas,data,simulation);
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.16, 0.84),
      new THREE.MeshBasicMaterial({
        color: PLAYER,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.orderMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.57, 48),
      new THREE.MeshBasicMaterial({
        color: PLAYER,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.orderMarker.rotation.x = -Math.PI / 2;
    this.orderMarker.visible = false;
    this.scene.add(this.orderMarker);
    this.controls = new MapControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.zoomSpeed = 2.2;
    this.controls.zoomToCursor = true;
    this.controls.enableRotate = false;
    this.controls.mouseButtons = { MIDDLE: THREE.MOUSE.PAN };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 40;
    this.camera.position.set(0, 140, 70);
    this.camera.lookAt(0, 0, 0);
    this.camera.zoom = 1;
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blur);
    this.simulation.onShot = (from, to, team, nation) => {
      if (
        !simulation.visibility.seesPoint(simulation.state.nation, from) &&
        !simulation.visibility.seesPoint(simulation.state.nation, to) &&
        (!nation ||
          !simulation.visibility.hasIntelligence(
            simulation.state.nation,
            nation,
          ))
      )
        return;
      const line = pathLine(
        [from, to],
        team === "player" ? "#c7f0bb" : "#ff9f78",
      );
      line.position.y = 0.35;
      this.scene.add(line);
      this.shots.push({ object: line, life: 0.13 });
    };
    this.focusBase();
    this.syncModels(1);
  }

  private createNodes() {
    for (const n of this.simulation.state.nodes) {
      const group = new THREE.Group();
      group.position.set(n.x, 0.1, n.z);
      group.scale.setScalar(0.65);
      const mineralColor=commodities[n.mineral??"gold"].color;
      for (let i = 0; i < 3; i++) {
        const mesh = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.28 + i * 0.06, 0),
          new THREE.MeshStandardMaterial({
            color: mineralColor,
            roughness: 0.6,
            metalness: 0.35,
          }),
        );
        mesh.position.set((i - 1) * 0.35, 0.25, (i % 2) * 0.25);
        mesh.rotation.set(0.2 * i, 0.6 * i, 0.2);
        group.add(mesh);
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 0.88, 32),
        new THREE.MeshBasicMaterial({
          color: mineralColor,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
      this.nodeGroup.add(group);
    }
  }

  private unpack(packed:PackedGeometry){
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(packed.position,3));g.setAttribute("normal",new THREE.BufferAttribute(packed.normal,3));g.setAttribute("uv",new THREE.BufferAttribute(packed.uv,2));g.setIndex(new THREE.BufferAttribute(packed.index,1));return g;
  }
  async finishLabels(layouts:ReturnType<typeof nationLabelLayouts>,progress:(value:number)=>void){
    for(let i=0;i<layouts.length;i++){const label=nationLabelMesh(layouts[i]);this.countryLabels.push(label);this.scene.add(label);if(i%8===0){progress(i/layouts.length);await new Promise<void>((resolve)=>requestAnimationFrame(()=>resolve()));}}
  }
  get visibleCityNames(){return [...this.cityOverlay.visibleNames];}
  private createWorldDetails() {
    const cities = this.simulation.state.cities ?? [];
    this.cityBlocks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.13, 0.10, 0.13),
      new THREE.MeshStandardMaterial({ roughness: 1 }),
      Math.max(1, cities.length * 3),
    );
    this.cityBlocks.count = cities.length * 3;
    this.scene.add(this.cityBlocks);
    this.refreshTerritory();
  }

  refreshTerritory() {
    const started=performance.now();
    const matrix=new THREE.Matrix4(), s=this.simulation.state, wars=s.wars.map((w)=>w.a+"/"+w.b).join(",");
    const landKey=this.simulation.territory.landRevision+":"+wars, seaKey=this.simulation.territory.seaRevision+":"+wars;
    const colorCache=new Map<string,THREE.Color>();
    const color=(id:string)=>{let c=colorCache.get(id);if(!c){c=new THREE.Color(this.nationColor(id));colorCache.set(id,c);}return c;};
    const update=(mesh:THREE.InstancedMesh|null,entries:typeof s.occupation,y:number,active:(tile:NonNullable<typeof s.occupation>[string])=>boolean)=>{
      if(!mesh)return;
      let n=0;
      for(const key in entries) {
        const tile=entries![key];if(!active(tile))continue;
        const index=Number(key);if(index<0||index>=this.grid.owners.length)continue;
        const p=cellPoint(this.grid,index);matrix.makeTranslation(p[0],y,p[1]);
        mesh.setMatrixAt(n,matrix);mesh.setColorAt(n,color(tile.controller));n++;
      }
      mesh.count=n;
      if(n) {
        mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,n*16);mesh.instanceMatrix.needsUpdate=true;
        if(mesh.instanceColor){mesh.instanceColor.clearUpdateRanges();mesh.instanceColor.addUpdateRange(0,n*3);mesh.instanceColor.needsUpdate=true;}
      }
    };
    if(landKey!==this.politicalKey) {
      this.politicalKey=landKey;
      for(const [id,record] of this.countryMaterials) {
        const victor=s.nations[id]?.annexedBy;
        if(victor)record.material.color.set(this.nationColor(victor)).multiplyScalar(0.72);
        else record.material.color.copy(record.color);
      }
      this.politicalTerrain.update(s);
      update(this.landOverlay,s.occupation,0.11,(tile)=>activeOccupation(s,tile));
      for(let i=0;i<(s.cities?.length??0);i++) {
        const c=s.cities![i];
        for(let b=0;b<3;b++) {
          matrix.makeTranslation(c.x+(b-1)*0.25,0.22+b*0.025,c.z+(b%2)*0.24);
          this.cityBlocks!.setMatrixAt(i*3+b,matrix);this.cityBlocks!.setColorAt(i*3+b,color(c.controller));
        }
      }
      if(this.cityBlocks){this.cityBlocks.instanceMatrix.needsUpdate=true;if(this.cityBlocks.instanceColor)this.cityBlocks.instanceColor.needsUpdate=true;this.cityBlocks.computeBoundingSphere();}
    }
    if(seaKey!==this.seaKey) {
      this.seaKey=seaKey;
      update(this.seaOverlay,s.seaControl,-0.065,(tile)=>activeSeaControl(s,tile.controller,tile));
    }
    this.territoryRevision=this.simulation.territory.revision;
    this.performanceStats.terrainMs=performance.now()-started;
  }

  private makeUnit(unit: Unit): Model {
    this.modelStats.unitsCreated++;
    const color = this.nationColor(unit.nation);
    const group = new THREE.Group();
    group.userData.unitId = unit.id;
    group.scale.setScalar(0.5);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    if (isShip(unit.type)) {
      const hull = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.25, 1.7, 5),
        material,
      );
      hull.rotation.x = Math.PI / 2;
      hull.position.y = 0.25;
      group.add(hull);
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.25, 1.2),
        material,
      );
      deck.position.y = 0.45;
      group.add(deck);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.4, 0.4),
        new THREE.MeshStandardMaterial({ color: "#d4dce4" }),
      );
      cabin.position.set(0, 0.7, 0.1);
      group.add(cabin);
      if (unit.type === "frigate") {
        const gun = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.12, 0.75),
          material,
        );
        gun.position.set(0, 0.65, -0.5);
        group.add(gun);
      } else {
        const platform = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.13, 0.65),
          new THREE.MeshStandardMaterial({ color: "#5d707c" }),
        );
        platform.position.set(0, 0.65, -0.3);
        group.add(platform);
      }
    } else if (unit.type === "infantry") {
      const body = new THREE.Mesh(this.unitGeometry.clone(), material);
      body.position.y = 0.45;
      group.add(body);
      const head = new THREE.Mesh(
        this.headGeometry.clone(),
        new THREE.MeshStandardMaterial({ color: "#e2c9a0" }),
      );
      head.position.y = 0.83;
      group.add(head);
      const weapon = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.1, 0.48),
        new THREE.MeshStandardMaterial({ color: "#2b363b" }),
      );
      weapon.position.set(0.23, 0.52, -0.15);
      group.add(weapon);
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.42, 1.25),
        material,
      );
      body.position.y = 0.38;
      group.add(body);
      const turret = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.3, 0.55),
        material,
      );
      turret.position.y = 0.74;
      group.add(turret);
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.13, 1),
        material,
      );
      gun.position.set(0, 0.78, -0.65);
      group.add(gun);
      for (const x of [-0.48, 0.48]) {
        const track = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.3, 1.35),
          new THREE.MeshStandardMaterial({ color: "#273035" }),
        );
        track.position.set(x, 0.23, 0);
        group.add(track);
      }
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(
        unit.type === "armor" ? 0.8 : 0.52,
        unit.type === "armor" ? 0.87 : 0.58,
        32,
      ),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.13;
    ring.visible = false;
    group.add(ring);
    const bar = new THREE.Group();
    bar.position.set(0, 1.2, 0);
    const background = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.09),
      new THREE.MeshBasicMaterial({ color: "#18242a", side: THREE.DoubleSide }),
    );
    bar.add(background);
    const health = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.055),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    health.position.z = 0.005;
    bar.add(health);
    group.add(bar);
    group.position.set(unit.x, 0.1, unit.z);
    this.scene.add(group);
    return { group, ring, health, bar, from:group.position.clone(), target:group.position.clone(), movedTick:this.simulation.state.elapsed };
  }

  private makeBuilding(b: Building) {
    const group = new THREE.Group();
    group.position.set(b.x, 0.08, b.z);
    group.scale.setScalar(0.32);
    group.userData.nation = b.nation;
    const color = this.nationColor(b.nation);
    const concrete = new THREE.MeshStandardMaterial({
      color: "#80877a",
      roughness: 1,
    });
    const trim = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.2, 2.1),
      new THREE.MeshStandardMaterial({ color: "#414d49" }),
    );
    plinth.position.y = 0.1;
    group.add(plinth);
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(b.type === "hq" ? 1.65 : 1.45, 0.85, 1.45),
      concrete,
    );
    block.position.y = 0.6;
    group.add(block);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 1.55), trim);
    roof.position.y = 1.1;
    group.add(roof);
    if (b.type === "dock") {
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.15, 3.5),
        new THREE.MeshStandardMaterial({ color: "#9d8d72" }),
      );
      pier.position.set(0, 0.05, -1);
      group.add(pier);
    } else if (b.type === "hq") {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.9, 0.6),
        concrete,
      );
      tower.position.set(-0.4, 1.55, -0.3);
      group.add(tower);
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        trim,
      );
      dish.position.set(-0.4, 2, -0.3);
      dish.rotation.z = 0.4;
      group.add(dish);
    } else if (b.type === "factory") {
      for(const x of [-0.5,0.5]) {
        const stack=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.18,1.4,6),concrete);
        stack.position.set(x,1.65,-0.4);group.add(stack);
      }
    } else if (b.type === "mine") {
      const derrick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.4, 1.9, 4, 1, true),
        trim,
      );
      derrick.position.set(0, 1.9, 0);
      group.add(derrick);
    } else {
      for (let i = 0; i < 3; i++) {
        const window = new THREE.Mesh(
          new THREE.BoxGeometry(0.23, 0.25, 0.02),
          new THREE.MeshBasicMaterial({ color: "#e3c594" }),
        );
        window.position.set(-0.45 + i * 0.45, 0.7, 0.74);
        group.add(window);
      }
    }
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 2.5, 5),
      concrete,
    );
    pole.position.set(0.9, 1.35, 0.85);
    group.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.65, 0.4),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    flag.position.set(1.22, 2.3, 0.85);
    group.add(flag);
    const title = labelSprite(
      b.type === "hq" ? "HQ" : b.type,
      color,
      0.55,
    );
    title.name="title";
    title.position.set(0, 3.1, 0);
    title.visible =
      b.nation === this.simulation.state.nation ||
      this.simulation.atWar(b.nation, this.simulation.state.nation);
    group.add(title);
    const health = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.09),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    health.position.set(0, 2.7, 0);
    health.name = "health";
    group.add(health);
    this.scene.add(group);
    return group;
  }

  private syncModels(dt: number) {
    const live = new Set(this.simulation.state.units.map((u) => u.id));
    for (const [id, model] of this.units)
      if (!live.has(id)) {
        disposeObject(model.group,new Set([this.unitGeometry,this.headGeometry]));
        this.units.delete(id);
        this.selected.delete(id);
      }
    for (const u of this.simulation.state.units) {
      const visible = this.simulation.visibility.canSee(
        this.simulation.state.nation,
        u,
      );
      let model = this.units.get(u.id);
      if (!visible) {
        if (model) model.group.visible = false;
        this.selected.delete(u.id);
        continue;
      }
      if (!model) {
        model = this.makeUnit(u);
        this.units.set(u.id, model);
      }
      model.group.visible = true;
      const next = new THREE.Vector3(u.x, 0.1, u.z);
      if(!model.target.equals(next)){
        // Render between authoritative tick positions; relocations snap instead of crossing borders.
        model.from.copy(model.target.distanceToSquared(next)>64?next:model.target);
        model.target.copy(next);model.movedTick=this.simulation.state.elapsed;
      }
      const alpha=Math.min(1,Math.max(0,this.simulation.state.elapsed-model.movedTick+(this.simulation.state.tickPhase??0)));
      model.group.position.lerpVectors(model.from,model.target,alpha);
      if (u.path.length) {
        const p = u.path[0],
          angle = Math.atan2(p[0] - u.x, p[1] - u.z) + Math.PI;
        model.group.rotation.y = angle;
      }
      model.ring.visible =
        this.selected.has(u.id) ||
        this.simulation.atWar(u.nation, this.simulation.state.nation);
      (model.ring.material as THREE.MeshBasicMaterial).color.set(
        this.simulation.atWar(u.nation, this.simulation.state.nation)
          ? "#ff9e94"
          : this.simulation.command.forUnit(u)?.color ?? this.nationColor(u.nation),
      );
      model.bar.quaternion.copy(this.camera.quaternion);
      model.bar.quaternion.premultiply(model.group.quaternion.clone().invert());
      model.bar.visible = this.selected.has(u.id) || u.hp < u.maxHp;
      model.health.scale.x = Math.max(0, u.hp / u.maxHp);
    }
    const liveBuildings=new Set(this.simulation.state.buildings.filter((b)=>b.hp>0).map((b)=>b.id));
    for (const [id, group] of this.buildings)
      if (!liveBuildings.has(id)) {
        disposeObject(group);
        this.buildings.delete(id);
      }
    for (const b of this.simulation.state.buildings)
      if (b.hp > 0) {
        if(b.type==="dock"&&this.data.ports){const old=this.buildings.get(b.id);if(old){disposeObject(old);this.buildings.delete(b.id);}continue;}
        const visible = this.simulation.visibility.canSeeBuilding(this.simulation.state.nation, b);
        let model = this.buildings.get(b.id);
        if (!visible) { if (model) model.visible = false; continue; }
        if (model && model.userData.nation !== b.nation) {
          disposeObject(model);
          this.buildings.delete(b.id);
          model = undefined;
        }
        if (!model) {
          model = this.makeBuilding(b);
          this.buildings.set(b.id, model);
        }
        model.visible = true;
        const title=model.getObjectByName("title");
        if(title)title.visible=b.nation===this.simulation.state.nation||this.simulation.atWar(b.nation,this.simulation.state.nation);
        const health = model.getObjectByName("health")!;
        health.visible =
          b.nation === this.simulation.state.nation || b.hp < b.maxHp;
        health.scale.x = b.hp / b.maxHp;
        health.quaternion.copy(this.camera.quaternion);
      }
    this.nodeGroup.children.forEach((object, i) => {
      const node = this.simulation.state.nodes[i];
      object.visible = !node.claimed && (node.nation === this.simulation.state.nation ||
        this.simulation.visibility.seesPoint(this.simulation.state.nation, [node.x, node.z]) ||
        this.simulation.visibility.hasIntelligence(this.simulation.state.nation, node.nation));
    });
  }

  private nationColor(id: string) {
    return nationColor(id, this.data);
  }

  refreshRelations() {
    // Relations affect colours and labels; existing models remain reusable.
    this.politicalKey=""; this.seaKey=""; this.territoryRevision=-1;
  }

  groundPoint(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((clientY - rect.top) / rect.height) * 2,
      ),
      this.camera,
    );
    const hit = this.raycaster.ray.intersectPlane(
      this.ground,
      new THREE.Vector3(),
    );
    return hit ? [hit.x, hit.z] : null;
  }

  pickUnit(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((clientY - rect.top) / rect.height) * 2,
      ),
      this.camera,
    );
    const hit = this.raycaster.intersectObjects(
      [...this.units.values()]
        .filter((v) => v.group.visible)
        .map((v) => v.group),
      true,
    )[0];
    if (!hit) {
      // Small models retain a forgiving screen-space selection target.
      let nearest:number|null=null,distance=12;
      for(const u of this.simulation.playerUnits){
        if(!this.units.get(u.id)?.group.visible)continue;
        const p=this.units.get(u.id)!.group.position.clone().project(this.camera);
        const d=Math.hypot(rect.left+(p.x+1)*rect.width/2-clientX,rect.top+(1-p.y)*rect.height/2-clientY);
        if(d<distance){nearest=u.id;distance=d;}
      }
      return nearest;
    }
    let object: THREE.Object3D | null = hit.object;
    while (object && object.userData.unitId === undefined)
      object = object.parent;
    return object?.userData.unitId ?? null;
  }

  selectBox(x1: number, y1: number, x2: number, y2: number, additive: boolean) {
    if (!additive) this.selected.clear();
    const rect = this.canvas.getBoundingClientRect();
    for (const u of this.simulation.playerUnits) {
      const p = (this.units.get(u.id)?.group.position.clone()??new THREE.Vector3(u.x,0.5,u.z)).project(this.camera);
      const x = rect.left + ((p.x + 1) * rect.width) / 2,
        y = rect.top + ((1 - p.y) * rect.height) / 2;
      if (
        x >= Math.min(x1, x2) &&
        x <= Math.max(x1, x2) &&
        y >= Math.min(y1, y2) &&
        y <= Math.max(y1, y2)
      )
        this.selected.add(u.id);
    }
  }

  showGhost(point: Point | null, valid = false) {
    this.ghost.visible = !!point;
    if (point) {
      this.ghost.position.set(point[0], 0.4, point[1]);
      (this.ghost.material as THREE.MeshBasicMaterial).color.set(
        valid ? PLAYER : ENEMY,
      );
    }
  }

  showOrder(point: Point) {
    this.orderLife = 1;
    this.orderMarker.position.set(point[0], 0.2, point[1]);
    this.orderMarker.visible = true;
  }

  focusBase() {
    const base =
      this.simulation.headquarters ?? this.simulation.state.buildings[0];
    this.panTo(base.x, base.z);
    this.camera.zoom = 3.5;
    this.camera.updateProjectionMatrix();
  }

  frameContinent() {
    this.panTo(0, 0);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
  }

  panTo(x: number, z: number) {
    const delta = new THREE.Vector3(x, 0, z).sub(this.controls.target);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.controls.update();
  }

  resize(width: number, height: number) {
    const aspect = width / height;
    const mapHeight =
      Math.max(
        this.data.bounds[3] - this.data.bounds[1],
        (this.data.bounds[2] - this.data.bounds[0]) / aspect,
      ) * 0.68;
    this.camera.left = -mapHeight * aspect;
    this.camera.right = mapHeight * aspect;
    this.camera.top = mapHeight;
    this.camera.bottom = -mapHeight;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    if (this.territoryRevision !== this.simulation.territory.revision)
      this.refreshTerritory();
    for (const label of this.countryLabels) {
      label.visible = this.camera.zoom < 14;
      label.material.opacity =
        0.86 * THREE.MathUtils.clamp((14 - this.camera.zoom) / 6, 0, 1);
    }
    const x =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const z =
      Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) -
      Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
    const speed = (35 * dt) / this.camera.zoom;
    if (x || z) {
      this.camera.position.x += x * speed;
      this.camera.position.z += z * speed;
      this.controls.target.x += x * speed;
      this.controls.target.z += z * speed;
    }
    this.controls.update();
    const [minX, minZ, maxX, maxZ] = this.data.bounds;
    const target = this.controls.target;
    const dx = THREE.MathUtils.clamp(target.x, minX - 12, maxX + 12) - target.x,
      dz = THREE.MathUtils.clamp(target.z, minZ - 12, maxZ + 12) - target.z;
    target.x += dx;
    target.z += dz;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
    this.camera.updateMatrixWorld();
    this.cityOverlay.update(this.camera);
    this.syncModels(dt);
    this.pathTimer -= dt;
    if (this.pathTimer <= 0) {
      this.pathTimer = 0.25;
      for (const object of [...this.pathGroup.children]) disposeObject(object);
      for (const u of this.simulation.playerUnits)
        if (this.selected.has(u.id) && u.path.length)
          this.pathGroup.add(pathLine([[this.units.get(u.id)?.group.position.x??u.x, this.units.get(u.id)?.group.position.z??u.z], ...u.path], this.simulation.command.forUnit(u)?.color ?? PLAYER));
      this.refreshFrontlines();
    }
    this.orderLife -= dt;
    this.orderMarker.visible = this.orderLife > 0;
    if (this.orderLife > 0) {
      this.orderMarker.scale.setScalar(1 + (1 - this.orderLife) * 2);
      (this.orderMarker.material as THREE.MeshBasicMaterial).opacity =
        this.orderLife;
    }
    this.shots = this.shots.filter((shot) => {
      shot.life -= dt;
      if (shot.life <= 0) {
        disposeObject(shot.object);
        return false;
      }
      return true;
    });
  }

  get occupationInstances() { return this.landOverlay?.count ?? 0; }
  get seaControlInstances() { return this.seaOverlay?.count ?? 0; }

  private refreshFrontlines() {
    const units = this.simulation.playerUnits.filter((u) => u.frontline);
    const key = this.simulation.territory.landRevision + "|" + units.map((u) =>
      `${u.id}:${u.frontline!.target}:${u.frontline!.anchor}:${u.frontline!.position}:${this.simulation.command.forUnit(u)?.color ?? PLAYER}`).join("|");
    if (key === this.frontlineKey) return;
    this.frontlineKey = key;
    for (const object of [...this.frontlineGroup.children]) disposeObject(object);
    this.frontlineColors.clear();
    const groups = new Map<string, Unit[]>();
    for (const u of units) {
      const f = u.frontline!, groupKey = f.target + ":" + f.anchor.join(","), group = groups.get(groupKey) ?? [];
      group.push(u); groups.set(groupKey, group);
    }
    const vertices: number[] = [], colors: number[] = [];
    for (const troops of groups.values()) {
      const f = troops[0].frontline!;
      const border = this.simulation.frontlineBorder(this.simulation.state.nation,f.target,f.anchor);
      const points = new Map(border.points.map((p) => [cellAt(this.grid, ...p), p]));
      for (const [index, p] of points) {
        const x = index % this.grid.width;
        for (const j of [x < this.grid.width - 1 ? index + 1 : -1, index + this.grid.width,
          x < this.grid.width - 1 ? index + this.grid.width + 1 : -1,
          x > 0 ? index + this.grid.width - 1 : -1]) {
          const q = points.get(j); if (!q) continue;
          const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
          const nearest = troops.reduce((a, b) =>
            Math.hypot(a.frontline!.position[0] - mx, a.frontline!.position[1] - mz) <
            Math.hypot(b.frontline!.position[0] - mx, b.frontline!.position[1] - mz) ? a : b);
          const color = this.simulation.command.forUnit(nearest)?.color ?? PLAYER;
          this.frontlineColors.add(color);
          const c = new THREE.Color(color), length = Math.hypot(q[0] - p[0], q[1] - p[1]), width = this.grid.cell * 0.14;
          const dx = -(q[1] - p[1]) / length * width, dz = (q[0] - p[0]) / length * width;
          for (const v of [[p[0]+dx,p[1]+dz],[p[0]-dx,p[1]-dz],[q[0]+dx,q[1]+dz],
            [q[0]+dx,q[1]+dz],[p[0]-dx,p[1]-dz],[q[0]-dx,q[1]-dz]]) {
            vertices.push(v[0],0.27,v[1]); colors.push(c.r,c.g,c.b);
          }
        }
      }
    }
    if (vertices.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices,3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors,3));
      this.frontlineGroup.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors:true, transparent:true, opacity:0.9, side:THREE.DoubleSide, depthWrite:false })));
    }
  }

  drawMinimap(canvas: HTMLCanvasElement) {
    const started=performance.now();
    const ctx = canvas.getContext("2d")!,
      w = canvas.width,
      h = canvas.height;
    const [minX, minZ, maxX, maxZ] = this.data.bounds;
    const padding = 12,
      scale = Math.min(
        (w - padding * 2) / (maxX - minX),
        (h - padding * 2) / (maxZ - minZ),
      );
    const ox = (w - (maxX - minX) * scale) / 2,
      oz = (h - (maxZ - minZ) * scale) / 2;
    const x = (n: number) => ox + (n - minX) * scale,
      z = (n: number) => oz + (n - minZ) * scale;
    if(this.minimapBase.width!==w||this.minimapBase.height!==h){
      for(const c of [this.minimapBase,this.minimapMask,this.minimapBorders,this.minimapOwnership]){c.width=w;c.height=h;}
      const base=this.minimapBase.getContext("2d")!,mask=this.minimapMask.getContext("2d")!,borders=this.minimapBorders.getContext("2d")!;
      base.fillStyle="#0b181f";base.fillRect(0,0,w,h);mask.fillStyle="#ffffff";borders.strokeStyle="#637166";borders.lineWidth=0.5;
      for(const country of this.minimapPolygons){
        base.fillStyle=this.nationColor(country.id);
        for(const polygon of country.polygons){const path=new Path2D();for(const ring of polygon){ring.forEach((p,i)=>i?path.lineTo(x(p[0]),z(p[1])):path.moveTo(x(p[0]),z(p[1])));path.closePath();}base.fill(path,"evenodd");mask.fill(path,"evenodd");borders.stroke(path);}
      }
      this.minimapKey="";
    }
    const mapKey=`${w}:${h}:${this.simulation.territory.landRevision}`;
    if(mapKey!==this.minimapKey){
      this.minimapKey=mapKey;this.minimapTerrain.width=w;this.minimapTerrain.height=h;
      const terrain=this.minimapTerrain.getContext("2d")!,ownership=this.minimapOwnership.getContext("2d")!;
      ownership.clearRect(0,0,w,h);ownership.globalCompositeOperation="source-over";
      const size=this.grid.cell*scale;
      for(const key in this.simulation.state.occupation){const tile=this.simulation.state.occupation[key],p=cellPoint(this.grid,Number(key));ownership.fillStyle=this.nationColor(tile.controller);ownership.fillRect(x(p[0])-size/2,z(p[1])-size/2,size+0.2,size+0.2);}
      ownership.globalCompositeOperation="destination-in";ownership.drawImage(this.minimapMask,0,0);ownership.globalCompositeOperation="source-over";
      terrain.drawImage(this.minimapBase,0,0);terrain.drawImage(this.minimapOwnership,0,0);terrain.drawImage(this.minimapBorders,0,0);
    }
    ctx.drawImage(this.minimapTerrain,0,0);
    for (const node of this.simulation.state.nodes)
      if (!node.claimed) {
        ctx.fillStyle = GOLD;
        ctx.fillRect(x(node.x) - 1, z(node.z) - 1, 2, 2);
      }
    for (const unit of this.simulation.state.units) {
      if (
        !this.simulation.visibility.canSee(this.simulation.state.nation, unit)
      )
        continue;
      ctx.fillStyle = unit.nation === this.simulation.state.nation ? this.simulation.command.forUnit(unit)?.color ?? this.nationColor(unit.nation) : this.nationColor(unit.nation);
      ctx.beginPath();
      ctx.arc(x(unit.x), z(unit.z), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const city of this.simulation.state.cities ?? []) {
      ctx.fillStyle = this.nationColor(city.controller);
      ctx.fillRect(x(city.x) - 1.5, z(city.z) - 1.5, 3, 3);
    }
    for (const b of this.simulation.state.buildings)
      if (this.simulation.visibility.canSeeBuilding(this.simulation.state.nation, b)) {
        ctx.fillStyle = this.nationColor(b.nation);
        ctx.fillRect(x(b.x) - 2, z(b.z) - 2, 4, 4);
      }
    ctx.strokeStyle = "#d1b37c";
    ctx.lineWidth = 1;
    const a = this.groundPoint(0, 80),
      b = this.groundPoint(window.innerWidth, window.innerHeight);
    if (a && b)
      ctx.strokeRect(
        x(a[0]),
        z(a[1]),
        (b[0] - a[0]) * scale,
        (b[1] - a[1]) * scale,
      );
    this.performanceStats.minimapMs=performance.now()-started;
  }

  minimapPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const [minX, minZ, maxX, maxZ] = this.data.bounds;
    const scale = Math.min(
      (canvas.width - 24) / (maxX - minX),
      (canvas.height - 24) / (maxZ - minZ),
    );
    const ox = (canvas.width - (maxX - minX) * scale) / 2,
      oz = (canvas.height - (maxZ - minZ) * scale) / 2;
    this.panTo(
      minX + (((clientX - rect.left) * canvas.width) / rect.width - ox) / scale,
      minZ +
        (((clientY - rect.top) * canvas.height) / rect.height - oz) / scale,
    );
  }

  countryAt(point: Point) {
    const index = cellAt(this.grid, ...point);
    return index >= 0 && this.grid.owners[index] >= 0
      ? this.data.countries[this.grid.owners[index]]
      : null;
  }

  dispose() {
    this.cityOverlay.dispose();
    this.politicalTerrain.dispose();
    this.controls.dispose();
    this.simulation.onShot = () => {};
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.blur);
    this.unitGeometry.dispose();
    this.headGeometry.dispose();
    disposeObject(this.scene);
  }
}
