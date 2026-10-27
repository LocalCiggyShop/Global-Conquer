import * as THREE from "three";
import "./style.css";
import "./ui-theme.css";
import {calendar,TICKS_PER_DAY} from "./game-clock";
import {EconomyPanel} from "./economy-panel";
import {commodities} from "./economy";
import { GlobeView } from "./globe";
import type { OverviewData } from "./globe";
import { regions, getRegion } from "./regions";
import { createGrid, nationSpawn, cellAt } from "./navigation";
import {
  createCampaign,
  saveCampaign,
  savedCampaigns,
  restoreCampaign,
  Simulation,
  unitSpecs,
} from "./campaign";
import {loadMap} from "./map-loader";
import {backgroundPreparation} from "./deployment";
import type {PreparedDeployment} from "./deployment";
import { PathClient } from "./path-client";
import { PlayView } from "./play-view";
import { nationColor, isShip, countryRankings } from "./geopolitics";
import {
  productionBuildings,
  productionQueueLimit,
  productionRate,
} from "./production";
import { majoritySelection, leaderBonuses, leaderLevel } from "./leaders";
import { doctrines } from "./doctrines";
import type {
  Campaign,
  Building,
  ContinentData,
  DoctrineId,
  Grid,
  GameCommand,
  LeaderBranch,
  LeaderStance,
  Point,
  Unit,
} from "./types";

const icons: Record<string, string> = {
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  anchor: '<path d="M12 3v16M8 6h8M4 13v3a8 5 0 0 0 16 0v-3M2 15l2-2 2 2m12 0 2-2 2 2"/><circle cx="12" cy="3" r="2"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  layers:
    '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 17l10 5 10-5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  diamond:
    '<path d="m12 2 9 10-9 10L3 12l9-10Z"/><path d="m3 12 9 4 9-4M12 2v14"/>',
  supply:
    '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v9M7 5.5l9 5"/>',
  units:
    '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 4v3"/>',
  target:
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  home: '<path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M9 21v-7h6v7M8 8h8"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
};
const icon = (name: string, className = "") =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.target}</svg>`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const app = $("#app");
app.innerHTML = `
  <canvas id="world" aria-label="Interactive world map"></canvas>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Global Conquer home"><span class="brand-mark">${icon("globe")}</span><span>GLOBAL<span class="brand-rts">CONQUER</span><small>A WORLD OF POSSIBILITY</small></span></a>
    <nav aria-label="Main navigation"><button id="world-nav" class="nav-button active" aria-label="World overview">${icon("globe")}<span>World</span></button><button id="help-button" class="nav-button" aria-label="How to play">${icon("info")}<span>How to play</span></button></nav>
    <div class="session"><span class="status-dot"></span><span>LOCAL SAVE</span><span class="beta-label">Beta · v0.1.0</span></div>
  </header>
  <main>
    <div id="overview-ui">
      <aside class="region-sidebar">
        <div class="eyebrow">WORLD MAP</div>
        <h1>Where will<br>you <em>begin?</em></h1>
        <p class="intro">Choose a continent, then your nation.</p>
        <div class="section-label">CONTINENTS</div>
        <div class="region-list" role="group" aria-label="Continents">${regions.map((r, i) => `<button class="region-card${i === 0 ? " selected" : ""}" data-region="${r.id}" aria-pressed="${i === 0}"><span class="region-thumbnail"><img src="/maps/${r.id}.svg" alt="" width="56" height="40"></span><span class="region-copy"><strong>${r.name}</strong><small><span data-count="${r.id}">—</span> nations <span class="saved-indicator" data-saved="${r.id}"></span></small></span>${icon("chevron")}</button>`).join("")}</div>
      </aside>
      <div class="map-caption">A WORLD OF POSSIBILITIES</div>
      <div id="continent-markers">${regions.map((r) => `<button class="globe-label" data-marker="${r.id}" aria-label="Focus ${r.name}"><span class="marker-dot"></span>${r.name.toUpperCase()}</button>`).join("")}</div>
      <aside class="briefing-panel panel">
        <div class="eyebrow">YOUR STARTING POINT <span id="region-code">EU</span></div>
        <div class="briefing-map"><img id="briefing-image" src="/maps/europe.svg" alt="Europe silhouette"></div>
        <div class="briefing-heading"><h2 id="region-name">Europe</h2>${icon("flag")}</div>
        <p id="region-description" class="description"></p>
        <div class="briefing-stats"><span><strong id="nation-count">—</strong> nations</span><span id="campaign-status">New game</span></div>
        <label class="section-label nation-label" for="nation-select">STARTING NATION ${icon("flag")}</label>
        <select id="nation-select" aria-label="Starting nation" disabled><option>Loading nations…</option></select>
        <p class="nation-note" id="nation-note">5-second countdown. Then build your nation in peace.</p>
        <button id="deploy-button" class="primary-button" disabled><span>Loading map…</span>${icon("arrow")}</button>
        <p class="save-note">${icon("shield")} Progress saved on this device</p>
        <button id="retry-data" class="text-button" hidden>Retry map download</button>
      </aside>
      <div class="overview-bottom"><div>${icon("globe")} <span>ONE PLANET. ENDLESS POSSIBILITIES.</span></div><p>Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Select a continent to begin</p><span class="map-credit">EARTH · NASA / BORDERS · NATURAL EARTH</span></div>
    </div>
    <div id="play-ui" hidden>
      <div class="resource-bar"><span class="nation-title"><img id="nation-flag" class="nation-flag" alt="National flag"><span><strong id="play-nation"></strong><small id="play-region"></small></span></span><span id="peace-status" class="peace-status">At peace</span><div class="resource" title="Treasury"><span class="resource-label">Treasury</span>${icon("diamond")}<strong id="credits">650</strong><small id="income">+3/s</small></div><div class="resource" title="Supplies"><span class="resource-label">Supply</span>${icon("supply")}<strong id="supplies">160</strong><small id="supply-income">+3/s</small></div><div class="resource" title="Army capacity"><span class="resource-label">Forces</span>${icon("units")}<strong id="army">—</strong></div><button id="leaders-button" class="diplomacy-button" aria-controls="leaders-panel" aria-expanded="false">${icon("shield")}<span>Leaders</span></button><button id="diplomacy-button" class="diplomacy-button" aria-label="Open diplomacy" aria-controls="diplomacy-panel" aria-expanded="false">${icon("flag")}<span>Diplomacy</span></button><button id="pause-button" class="square-button" title="Pause / resume (Space)" aria-label="Pause game">${icon("pause")}</button><div id="game-clock" class="game-clock" title="1 real second = 1 tick · 5 ticks = 1 day"><strong id="operation-time">Day 1</strong><small id="game-tick">Tick 1 / 5</small><div id="day-progress" role="progressbar" aria-label="Day progress" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0"><span id="day-progress-fill"></span></div></div></div>
      <aside class="command-panel panel">
        <div id="nation-flag-overlay" aria-hidden="true"></div><div class="panel-heading"><h2>Your nation</h2><button id="manage-close" class="icon-button" aria-label="Close nation panel">${icon("close")}</button></div>
        <div class="management-tabs" role="tablist" aria-label="Nation management"><button id="economy-tab" role="tab" data-panel-tab="economy" aria-controls="economy-controls" aria-selected="true" class="active">${icon("layers")} Economy</button><button id="army-tab" role="tab" data-panel-tab="army" aria-controls="army-controls" aria-selected="false">${icon("units")} Army</button></div><section id="economy-controls" role="tabpanel" aria-labelledby="economy-tab"><div class="base-status"><span>Headquarters</span><strong id="hq-health">100%</strong><div class="health-track"><span id="hq-health-bar"></span></div></div>
        <div class="section-label">ECONOMY</div>
        <button id="invest-button" class="action-button">${icon("layers")}<span><strong>Infrastructure</strong><small id="industry-note">Level 0 · +2 income/s per level</small></span><span class="cost" id="industry-cost">160</span></button>
        <button class="action-button" data-build="barracks">${icon("home")}<span><strong>Barracks</strong><small>Unlock armored vehicles</small></span><span class="cost">200 <small>35 supply</small></span></button>
        <button class="action-button" data-build="mine">${icon("diamond")}<span><strong>Resource extractor</strong><small>Collect minerals · +7 credits/s</small></span><span class="cost">150 <small>20 supply</small></span></button>
        <button class="action-button" data-build="factory">${icon("home")}<span><strong>Factory</strong><small>Process minerals into finished goods</small></span><span class="cost">320 <small>35 supply</small></span></button>
        <button id="industry-button" class="action-button" aria-controls="industry-panel" aria-expanded="false">${icon("layers")}<span><strong>Industry & trade</strong><small>Stockpiles · factories · global market</small></span>${icon("chevron")}</button>
        <button id="ports-button" class="action-button">${icon("anchor")}<span><strong>Ports</strong><small>Real harbours · naval production</small></span>${icon("chevron")}</button>
        </section><section id="army-controls" role="tabpanel" aria-labelledby="army-tab" hidden><h3 class="recruit-heading">Recruit units</h3><div class="section-label training-label">ARMY <span id="queue-count"></span></div>
        <p id="production-summary" class="production-summary"></p>
        <button class="action-button" data-train="infantry">${icon("units")}<span><strong>Infantry squad</strong><small>Versatile ground unit · 4s</small></span><span class="cost">75 <small>10 supply</small></span></button>
        <button class="action-button" data-train="armor">${icon("shield")}<span><strong>Armored vehicle</strong><small>Heavy firepower · 8s</small></span><span class="cost">180 <small>30 supply</small></span></button>
        <button class="action-button" data-train="frigate">${icon("shield")}<span><strong>Frigate</strong><small>Naval combat · requires dock</small></span><span class="cost">240 <small>40 supply</small></span></button>
        <button class="action-button" data-train="transport">${icon("units")}<span><strong>Troop transport</strong><small>6 infantry or 3 armor · dock</small></span><span class="cost">160 <small>25 supply</small></span></button>
        <div class="force-capacity"><span>${icon("units")} Forces <strong id="panel-army"></strong></span><div id="capacity-warning" hidden>${icon("info")}<span><strong>Force capacity reached</strong><small>Control more population to recruit more units.</small></span></div></div><div class="section-label">${icon("supply")} TRAINING QUEUE</div><div id="training-queue" class="training-queue"><span>No units in training</span></div>
        <div class="doctrine-control"><label class="section-label" for="doctrine-select">MILITARY DOCTRINE</label><select id="doctrine-select">${Object.entries(
          doctrines,
        )
          .map(([id, d]) => `<option value="${id}">${d.name}</option>`)
          .join(
            "",
          )}</select><p id="doctrine-note"></p><small id="doctrine-lock">Change during peace · 60s cooldown</small></div></section>
      </aside>
      <aside class="tactical-panel panel"><div class="eyebrow">MAP<button id="frame-button" class="icon-button" title="Frame continent" aria-label="Frame continent">${icon("expand")}</button></div><canvas id="minimap" width="440" height="280" aria-label="Tactical map. Click to move camera."></canvas><div class="map-legend"><span><i class="friendly-dot"></i>You</span><span><i class="neutral-dot"></i>Neutral</span><span><i class="hostile-dot"></i>At war</span></div><button id="focus-button" class="secondary-button">${icon("home")} Headquarters <kbd>F</kbd></button></aside>
      <aside id="diplomacy-panel" class="diplomacy-panel panel" aria-label="Diplomacy" hidden>
        <div class="diplomacy-header"><div class="panel-heading"><h2>${icon("globe")} Diplomacy <small>Foreign relations</small></h2><button id="diplomacy-close" class="icon-button" aria-label="Close diplomacy">${icon("close")}</button></div><div class="diplomacy-tabs" role="group" aria-label="Diplomacy view"><button data-diplomacy-tab="nations" class="active">Nations & intel</button><button data-diplomacy-tab="rankings">Rankings</button></div></div>
        <div id="diplomacy-sidebar" class="diplomacy-sidebar"><label class="sr-only" for="nation-search">Search nations</label><input id="nation-search" type="search" placeholder="Search nations…" autocomplete="off"><select id="nation-filter" aria-label="Filter nations"><option value="all">All nations</option><option value="neighbors">Neighbours</option><option value="allies">Allies</option><option value="enemies">At war</option></select><div id="nation-list" class="nation-list"></div></div>
        <div id="rankings-panel" hidden><label class="section-label" for="ranking-sort">RANK BY</label><select id="ranking-sort"><option value="score">Overall power</option><option value="economy">Economy</option><option value="military">Military</option><option value="resources">Resources</option></select><p class="ranking-note">Public aggregate ratings. Unit locations stay hidden.</p><div id="ranking-table"></div></div><section id="nation-details" class="nation-details"></section>
      </aside>
      <aside id="leaders-panel" class="leaders-panel panel" aria-label="Military leaders" hidden>
        <div class="panel-heading"><div><div class="eyebrow">CHAIN OF COMMAND</div><h2>Military leaders</h2></div><button id="leaders-close" class="icon-button" aria-label="Close military leaders">${icon("close")}</button></div>
        <p class="diplomacy-intro">Generals command ground forces. Admirals command ships.</p>
        <div class="diplomacy-tabs" role="group" aria-label="Leader branch"><button data-leader-branch="army" class="active">Army generals</button><button data-leader-branch="navy">Navy admirals</button></div>
        <p id="leader-selection" class="leader-selection" aria-live="polite"></p><div id="leader-list" class="leader-list"></div>
        <button id="create-leader" class="secondary-button">Appoint general</button><section id="leader-details" class="leader-details"></section>
      </aside>
      <button id="manage-button" class="secondary-button">${icon("home")} Manage nation</button>
      <div class="selected-panel panel"><div class="selected-symbol">${icon("units")}</div><div class="selected-copy"><strong id="selection-title">Your command awaits</strong><span id="selection-note">Click a squad or drag to select units</span></div><button id="select-all-button" class="secondary-button">Select all <kbd>Q</kbd></button><button id="assign-leader-button" class="secondary-button" title="Assign selected units to a military leader">Leader</button><button id="move-button" class="secondary-button primary-command" title="Move selected units" aria-label="Move selected units">${icon("target")} Move</button><button id="frontline-button" class="secondary-button" title="Assign selected infantry to a land border">Frontline</button><button id="embark-button" class="secondary-button" title="Embark ground troops onto a nearby friendly transport" aria-label="Embark selected troops">${icon("anchor")} Board</button><button id="land-button" class="secondary-button" title="Disembark selected transports onto nearby land" aria-label="Disembark troops">${icon("flag")} Land</button><button id="stop-button" class="square-button" title="Stop selected units (X)" aria-label="Stop selected units">${icon("stop")}</button></div>
      <div class="play-footer"><span id="save-status">${icon("shield")} Autosave enabled <small class="beta-label">Beta · v0.1.0</small></span><p><button id="return-world-button" class="text-button">${icon("globe")} World</button><button id="play-help-button" class="text-button">${icon("info")} Help</button><span>·</span> Right-click to move <span>·</span> WASD / middle-drag to pan</p><span id="country-hover">OPEN OCEAN</span></div>
      <div id="paused-banner" hidden>Paused <span>Space to resume</span></div>
      <div id="build-banner" hidden></div>
      <div id="event-feed" aria-live="polite"></div>
    </div>
  </main>
  <div id="selection-box" hidden></div>
  <div id="toast" role="status" hidden></div>
  <div id="transition" class="transition" hidden><div class="loading-emblem">${icon("globe")}</div><div class="eyebrow" id="loading-caption">PREPARING THE WORLD</div><h2 id="loading-title">A world of possibility.</h2><div id="deployment-progress" class="deployment-progress" role="progressbar" aria-label="Loading continent" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="deployment-fill"></span></div><p><span id="deployment-stage">Preparing…</span> <strong id="deployment-percent">0%</strong></p></div>
  <div id="battle-countdown" class="battle-countdown" hidden><div class="countdown-card"><span class="eyebrow">GET READY</span><h2 id="countdown-region">Europe</h2><strong id="countdown-number" aria-live="polite">5</strong><p id="countdown-message">Your nation begins in peace.<br>Grow your economy. Choose your own path.</p><button id="cancel-countdown" class="secondary-button">Back to world</button></div></div>
  <dialog id="manual"><button id="close-dialog" class="icon-button dialog-close" aria-label="Close dialog">${icon("close")}</button><div id="dialog-content"></div></dialog>
`;

let renderer: THREE.WebGLRenderer;
let globe: GlobeView;
let play: PlayView | null = null;
let simulation: Simulation | null = null;
let worker: Worker | null = null;
let paths: PathClient | null = null;
let focusedRegion = "europe";
let data: ContinentData | null = null;
let grid: Grid | null = null;
let mode: "overview" | "play" | "transition" | "countdown" = "overview";
let countdownDeadline = 0;
let deploymentTimings:Record<string,number>={};
let runtimeTimings={simulationPeakMs:0,viewPeakMs:0,uiPeakMs:0};
let diplomacyNation: string | null = null;
let diplomacyRefresh = 0;
let leaderBranch: LeaderBranch = "army";
let selectedLeader: number | null = null;
let abortData: AbortController | null = null;
let placement: Exclude<Building["type"], "hq"> | null = null;
let moveMode = false;
let frontlineMode = false;
let uiTimer = 0,
  previousTime = 0,
  resultShown = false;
let pointerStart: {
  x: number;
  y: number;
  button: number;
  shift: boolean;
} | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let priorPause = false;
const manual = $<HTMLDialogElement>("#manual");
const canvas = $<HTMLCanvasElement>("#world");
const nationSelect = $<HTMLSelectElement>("#nation-select");
const deployButton = $<HTMLButtonElement>("#deploy-button");
const minimap = $<HTMLCanvasElement>("#minimap");
const economyPanel=new EconomyPanel($("#play-ui"),()=>simulation,()=>play,()=>beginPlacement("factory"),toast);

function toast(message: string) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 4000);
}
function eventMessage(message: string) {
  const line = document.createElement("div");
  line.textContent = message;
  $("#event-feed").prepend(line);
  while ($("#event-feed").children.length > 2)
    $("#event-feed").lastElementChild!.remove();
  setTimeout(() => line.remove(), 4500);
}
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
function refreshSaved() {
  const saved = savedCampaigns();
  for (const r of regions)
    $(`[data-saved="${r.id}"]`).textContent = saved[r.id] ? "· Saved" : "";
}
function updateDeploy() {
  const saved = savedCampaigns()[focusedRegion];
  const continuing = saved?.nation === nationSelect.value;
  deployButton.querySelector("span")!.textContent = continuing
    ? "Continue game"
    : "Play continent";
  $("#campaign-status").textContent = continuing ? "Saved game" : "New game";
  $("#nation-note").textContent = continuing
    ? `Saved game · ${formatTime(saved.elapsed)} played`
    : "5-second countdown. Then build your nation in peace.";
}

async function focusRegion(id: string, force = false) {
  if (mode !== "overview" || (!force && focusedRegion === id && data)) return;
  focusedRegion = id;
  const region = getRegion(id);
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-region]",
  )) {
    const selected = button.dataset.region === id;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  $("#region-name").textContent = region.name;
  $("#region-code").textContent = region.code;
  $("#region-description").textContent = region.description;
  $<HTMLImageElement>("#briefing-image").src = `/maps/${id}.svg`;
  $<HTMLImageElement>("#briefing-image").alt = `${region.name} silhouette`;
  globe.focus(id);
  abortData?.abort();
  const controller = new AbortController();
  abortData = controller;
  data = null;
  grid = null;
  deployButton.disabled = true;
  deployButton.querySelector("span")!.textContent = "Loading map…";
  nationSelect.disabled = true;
  nationSelect.replaceChildren(new Option("Loading nations…"));
  $("#retry-data").hidden = true;
  try {
    $("#nation-note").textContent="Downloading map…";
    const loaded=await loadMap(id,controller.signal);
    if (controller.signal.aborted) return;
    const prepared=await backgroundPreparation(loaded,null,null,null,(_value,label)=>{$("#nation-note").textContent=label;},controller.signal) as {grid:Grid;viable:string[]};
    const loadedGrid=prepared.grid;
    if (controller.signal.aborted) return;
    const viable = loaded.countries.filter(
      (c) => prepared.viable.includes(c.id),
    );
    if (!viable.length)
      throw new Error("No playable nations found on this continent.");
    data = loaded;
    grid = loadedGrid;
    nationSelect.replaceChildren(
      ...viable.map((c) => new Option(c.name, c.id)),
    );
    const saved = savedCampaigns()[id];
    nationSelect.value = viable.some((c) => c.id === saved?.nation)
      ? saved.nation
      : viable.some((c) => c.id === region.defaultNation)
        ? region.defaultNation
        : viable[0].id;
    nationSelect.disabled = false;
    deployButton.disabled = false;
    $("#nation-count").textContent = String(loaded.countries.length);
    updateDeploy();
  } catch (error) {
    if (controller.signal.aborted) return;
    nationSelect.replaceChildren(new Option("Map unavailable"));
    deployButton.querySelector("span")!.textContent = "Map unavailable";
    $("#retry-data").hidden = false;
    toast(
      error instanceof Error
        ? error.message
        : "Could not load this continent. Please retry.",
    );
  }
}

function startWorker(sim: Simulation) {
  worker = new Worker(new URL("./pathfinding.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.postMessage({
    type: "init",
    grid: sim.grid,
    walkable: sim.walkable,
    water: sim.naval.water,
    obstaclesRevision: sim.obstacleRevision,
    ...sim.accessSnapshot(),
  });
  const activeWorker = worker;
  const client = new PathClient(sim,activeWorker,toast);
  paths=client;
  sim.onObstacles = (walkable) => activeWorker.postMessage({type:"obstacles",walkable,obstaclesRevision:sim.obstacleRevision});
  sim.onAccess = (patch) => activeWorker.postMessage(patch?{type:"access-patch",...patch}:{type:"access",...sim.accessSnapshot()});
  sim.requestPath = (unit,target) => client.request(unit,target);
  worker.onmessage = (event) => { if(simulation===sim)client.receive(event.data); };
  for(const u of sim.state.units)if(u.hp>0&&!u.embarkedOn&&u.destination&&!u.path.length)client.request(u,u.destination);
  worker.onerror = () => {
    sim.paused = true;
    toast(
      "The pathfinding worker failed. Return to overview and reload the game.",
    );
  };
}

function deploymentProgress(value:number,label:string){
  const n=Math.max(0,Math.min(100,Math.round(value)));
  $("#deployment-progress").setAttribute("aria-valuenow",String(n));$("#deployment-fill").style.width=n+"%";
  $("#deployment-percent").textContent=n+"%";$("#deployment-stage").textContent=label;
}
async function enterPlay(reset = false) {
  if (!data || !grid || mode === "transition") return;
  const localData = data,
    localGrid = grid,
    nation = nationSelect.value;
  mode = "transition";
  $("#transition").hidden = false;
  $("#loading-caption").textContent =
    "DEPLOYING TO " + getRegion(focusedRegion).name.toUpperCase();
  $("#loading-title").textContent = "Your command awaits.";
  globe.controls.enabled = false;
  deploymentProgress(2,"Preparing deployment");
  await new Promise<void>((resolve)=>requestAnimationFrame(()=>resolve()));
  await document.fonts.ready;
  try {
    const saved=savedCampaigns()[focusedRegion];
    const prepared=await backgroundPreparation(localData,localGrid,nation,!reset&&saved?.nation===nation?saved as Campaign:null,(value,label)=>deploymentProgress(5+value*0.75,label)) as PreparedDeployment;
    deploymentTimings=prepared.timings;
    deploymentProgress(76,"Connecting the simulation");
    paths=null;worker?.terminate();play?.dispose();
    const state=prepared.state;
    simulation=new Simulation(localData,localGrid,state,prepared);
    simulation.onEvent=eventMessage;
    simulation.onCommandError=toast;
    startWorker(simulation);
    await new Promise<void>((resolve)=>requestAnimationFrame(()=>resolve()));
    play=new PlayView(canvas,localData,localGrid,simulation,prepared);
    await play.finishLabels(prepared.labels,(fraction)=>deploymentProgress(80+fraction*8,"Drawing country labels"));
    resize();deploymentProgress(91,"Preparing graphics");
    await renderer.compileAsync(play.scene,play.camera);
    deploymentProgress(98,"Finishing map upload");
    play.update(0);renderer.render(play.scene,play.camera);
    deploymentProgress(100,"Ready");
    await new Promise<void>((resolve)=>requestAnimationFrame(()=>resolve()));
    document.body.style.setProperty(
      "--nation-color",
      nationColor(nation, localData),
    );
    const country=localData.countries.find((c)=>c.id===nation)!;
    const flag=country.flagCode&&/^[a-z]{2}$/.test(country.flagCode)?`/flags/${country.flagCode}.svg`:"";
    if(flag)$<HTMLImageElement>("#nation-flag").src=flag;else $("#nation-flag").removeAttribute("src");
    $<HTMLImageElement>("#nation-flag").hidden=!flag;
    $("#nation-flag-overlay").style.backgroundImage=flag?`url("${flag}")`:"none";
    $("#play-region").textContent = getRegion(focusedRegion).name;
    $("#play-nation").textContent =
      localData.countries.find((c) => c.id === nation)?.name ?? nation;
    $("#overview-ui").hidden = true;
    $("#play-ui").hidden = true;
    document.body.classList.add("playing");
    $("#world-nav").innerHTML = `${icon("globe")}<span>World</span>`;
    mode = "countdown";
    resultShown = false;
    cancelCommand();
    resize();
    updatePlayUI();
    selectedLeader = null;
    $("#leader-details").dataset.key = "";
    $("#leader-list").dataset.key = "";
    closeLeaders();
    diplomacyNation = null;
    $("#nation-details").dataset.key = "";
    $("#nation-list").dataset.key = "";
    simulation.onDiplomacy = () => {
      play?.refreshRelations();
      renderDiplomacy();
      updatePlayUI();
    };
    $("#countdown-region").textContent = getRegion(focusedRegion).name;
    $("#countdown-number").textContent = "5";
    $("#countdown-message").textContent =
      state.elapsed > 0
        ? "Your saved world is ready. Continue building your nation."
        : "Every nation starts at peace. Grow your economy and choose your own path.";
    countdownDeadline = performance.now() + 5000;
    $("#battle-countdown").hidden = false;
  } catch (error) {
    paths=null;
    worker?.terminate();
    worker = null;
    play?.dispose();
    play = null;
    simulation = null;
    mode = "overview";
    globe.controls.enabled = true;
    $("#overview-ui").hidden = false;
    $("#play-ui").hidden = true;
    document.body.classList.remove("playing");
    toast(error instanceof Error ? error.message : "Could not start the game.");
  } finally {
    $("#transition").hidden = true;
  }
}

function returnToOverview() {
  if (mode === "transition") return;
  if (mode === "play" && simulation && !saveCampaign(simulation.state))
    toast("Device storage is full. This game could not be saved.");
  paths=null;
  worker?.terminate();
  worker = null;
  play?.dispose();
  play = null;
  simulation = null;
  $("#overview-ui").hidden = false;
  $("#play-ui").hidden = true;
  $("#battle-countdown").hidden = true;
  $("#diplomacy-panel").hidden = true;
  closeLeaders();
  economyPanel.close();
  $(".command-panel").classList.remove("mobile-open");
  document.body.classList.remove("playing");
  mode = "overview";
  globe.controls.enabled = true;
  globe.focus(focusedRegion);
  cancelCommand();
  refreshSaved();
  updateDeploy();
  resize();
  if (manual.open) manual.close();
}

function cancelCommand() {
  placement = null;
  moveMode = false;
  frontlineMode = false;
  $("#frontline-button").classList.remove("active");
  play?.showGhost(null);
  canvas.classList.remove("placing");
  $("#build-banner").hidden = true;
  $("#move-button").classList.remove("active");
  for (const b of document.querySelectorAll("[data-build]"))
    b.classList.remove("active");
}
function issueMove(point: Point) {
  if (!simulation || !play) return;
  const error = simulation.move([...play.selected], point);
  if (error) toast(error);
  else { play.showOrder(point); if(simulation.paused)toast("Move order queued. Resume with Space to move."); }
  cancelCommand();
}

function submit(command:GameCommand,message="Order queued for the next tick."){
  if(!simulation)return;const error=simulation.enqueue(command);toast(error??(simulation.paused?"Paused · order queued until the next tick after resume.":message));
}
let clockKey="";
function updateClockUI(){
  if(!simulation)return;
  const {state,paused}=simulation,c=calendar(state.elapsed,state.tickPhase),key=`${c.ticks}:${Math.floor(c.progress*100)}:${paused}:${state.pendingCommands?.length}`;
  if(key===clockKey)return;clockKey=key;
  $("#operation-time").textContent=`Day ${c.day}`;$("#game-tick").textContent=`Tick ${c.tick} / ${TICKS_PER_DAY}`;
  $("#day-progress").setAttribute("aria-valuenow",(c.progress*TICKS_PER_DAY).toFixed(2));
  $("#day-progress").setAttribute("aria-valuetext",`Day ${c.day}, tick ${c.tick} of ${TICKS_PER_DAY}${paused?", paused":""}`);
  $("#day-progress-fill").style.width=`${c.progress*100}%`;$("#game-clock").classList.toggle("paused",paused);
  $("#game-clock").title=`1 real second = 1 tick · 5 ticks = 1 day${paused?" · Paused":""} · ${state.pendingCommands?.length??0} queued orders`;
}
function updatePlayUI() {
  if (!simulation || !play) return;
  const s = simulation.state,
    n = simulation.playerNation;
  $("#credits").textContent = Math.floor(n.credits).toLocaleString();
  $("#supplies").textContent = Math.floor(n.supplies).toLocaleString();
  $("#supply-income").textContent = `+${simulation.supplyIncome(s.nation).toFixed(1)}/s`;
  $("#income").textContent = `+${simulation.income}/s`;
  $("#army").textContent = `${simulation.nationArmy(s.nation)} / ${simulation.nationCapacity(s.nation)}`;
  $("#panel-army").textContent = $("#army").textContent;
  $("#capacity-warning").hidden = simulation.nationArmy(s.nation) < simulation.nationCapacity(s.nation);
  $("#army").parentElement!.title = `Force capacity: ${simulation.territory.population(s.nation).toLocaleString()} controlled population · 6 base + 1 per 2 million (maximum 240)`;
  updateClockUI();
  $("#paused-banner").hidden = !simulation.paused || manual.open;
  $("#pause-button").innerHTML = icon(simulation.paused ? "play" : "pause");
  $("#pause-button").setAttribute(
    "aria-label",
    simulation.paused ? "Resume game" : "Pause game",
  );
  const hq = simulation.headquarters,
    health = hq ? Math.ceil((hq.hp / hq.maxHp) * 100) : 0;
  $("#hq-health").textContent = `${health}%`;
  $("#hq-health-bar").style.width = `${health}%`;
  const selected = simulation.playerUnits.filter((u) =>
    play!.selected.has(u.id),
  );
  $("#selection-title").textContent = selected.length
    ? `${selected.length} ${selected.length === 1 ? "unit" : "units"} selected`
    : "Your command awaits";
  $("#selection-note").textContent = selected.length
    ? "Right-click to move · Manual orders override frontlines"
    : "Select troops or ships · Q selects all";
  const assigned = selected.filter((u) => simulation!.command.forUnit(u));
  if (selected.length && assigned.length === selected.length) {
    const commanders = new Set(assigned.map((u) => u.leaderId));
    $("#selection-title").textContent += commanders.size === 1
      ? " · " + simulation.command.forUnit(assigned[0])!.name
      : ` · ${commanders.size} leaders`;
  }
  const frontlines = selected.filter((u) => u.frontline).length;
  if (frontlines) $("#selection-note").textContent = `${frontlines} infantry defending a frontline · Move / Stop to cancel`;
  const cargo = selected
    .filter((u) => u.type === "transport")
    .reduce((n, u) => n + (u.cargo?.length ?? 0), 0);
  if (cargo)
    $("#selection-note").textContent =
      `${cargo} troops aboard · Right-click a coast to land`;
  const factories = productionBuildings(s, s.nation),
    factoryIds = new Set(factories.map((b) => b.id));
  const rate = productionRate(s, s.nation, simulation.income),
    active = n.queue.filter(
      (q) => q.producer !== undefined && factoryIds.has(q.producer),
    );
  const waiting = n.queue.length - active.length;
  $("#queue-count").textContent = n.queue.length
    ? `${n.queue.length}/${productionQueueLimit(s, s.nation)}`
    : "";
  $("#production-summary").textContent =
    `${active.length} / ${factories.length} lines active · ${Math.round(rate * 100)}% training speed`;
  const displayed = [
    ...active,
    ...n.queue.filter((q) => !active.includes(q)),
  ].slice(0, 4);
  $("#training-queue").innerHTML = displayed.length
    ? displayed
        .map((q) => {
          const producer = factories.find((b) => b.id === q.producer),
            name =
              producer?.type === "hq"
                ? "HQ"
                : producer?.type === "dock"
                  ? "Dock"
                  : "Barracks";
          const status = producer
            ? q.remaining > 0
              ? `${Math.ceil(q.remaining / rate)} ticks`
              : "Waiting for space"
            : "Queued";
          return `<div class="training-job"><span>${unitSpecs[q.type].label}<small>${producer ? name + " #" + producer.id : "Waiting for a matching building"}</small></span><b>${status}</b><div class="queue-track"><span style="width:${producer ? (1 - q.remaining / q.total) * 100 : 0}%"></span></div></div>`;
        })
        .join("") +
      (n.queue.length > displayed.length
        ? `<span class="queue-overflow">+${n.queue.length - displayed.length} more · ${waiting} waiting</span>`
        : "")
    : "<span>No units in training</span>";
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-train]",
  )) {
    const type = button.dataset.train as Unit["type"],
      slots = productionBuildings(s, s.nation, type).length;
    const seconds = Math.ceil(unitSpecs[type].time / rate);
    const role = isShip(type)
      ? "dock"
      : type === "armor"
        ? "barracks"
        : "HQ/barracks";
    button.querySelector("small")!.textContent = slots
      ? `${type === "transport" ? "6 troop spaces · " : ""}${slots} ${role}${slots > 1 && role === "dock" ? "s" : ""} · ${seconds} ticks each`
      : isShip(type)&&data?.ports ? "Control an operational real port first" : `Build ${isShip(type) ? "a coastal dock" : type === "armor" ? "a barracks" : "an HQ or barracks"} first`;
  }
  play.drawMinimap(minimap);
  const enemies = simulation.enemiesOf(s.nation);
  $("#peace-status").textContent = enemies.length
    ? `At war · ${enemies.length}`
    : "At peace";
  $("#peace-status").classList.toggle("at-war", enemies.length > 0);
  $("#industry-note").textContent =
    `Level ${n.industry}/8 · +2 income/s per level`;
  $("#industry-cost").textContent =
    n.industry < 8 ? String(160 * (n.industry + 1)) : "Max";
  $<HTMLButtonElement>("#invest-button").disabled = n.industry >= 8;
  const doctrineSelect = $<HTMLSelectElement>("#doctrine-select");
  if (document.activeElement !== doctrineSelect)
    doctrineSelect.value = n.doctrine;
  const cooldown = Math.max(
    0,
    Math.ceil(60 - (s.elapsed - n.doctrineChangedAt)),
  );
  doctrineSelect.disabled = enemies.length > 0 || cooldown > 0;
  $("#doctrine-note").textContent = doctrines[n.doctrine].description;
  $("#doctrine-lock").textContent = enemies.length
    ? "Doctrine locked while at war"
    : cooldown > 0
      ? `Change available in ${cooldown}s`
      : "Change during peace · 60s cooldown";
  economyPanel.refresh();
  if (!$("#leaders-panel").hidden) renderLeaders();
  diplomacyRefresh -= 0.2;
  if (!$("#diplomacy-panel").hidden && diplomacyRefresh <= 0) {
    diplomacyRefresh = 1;
    renderDiplomacy();
  }
  if (s.result !== "playing" && !resultShown) {
    resultShown = true;
    showResult(s.result);
  }
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function countryFlag(country:ContinentData["countries"][number]):string {
  return country.flagCode ? `<img class="country-flag" src="/flags/${country.flagCode.toLowerCase()}.svg" alt="">` : `<span class="country-initial">${escapeHtml(country.id.slice(0,2))}</span>`;
}
function renderDiplomacy() {
  if (!simulation || !data) return;
  const sim = simulation,
    state = sim.state;
  if (!$("#rankings-panel").hidden) renderRankings();
  const query = $<HTMLInputElement>("#nation-search")
    .value.trim()
    .toLowerCase();
  const neighbors = new Set(sim.neighbors(state.nation));
  const filter = $<HTMLSelectElement>("#nation-filter").value;
  const countries = data.countries
    .filter((c) => c.name.toLowerCase().includes(query) && (filter === "all" || filter === "neighbors" && neighbors.has(c.id) || filter === "allies" && c.id !== state.nation && sim.allied(state.nation,c.id) || filter === "enemies" && sim.atWar(state.nation,c.id)))
    .sort(
      (a, b) =>
        Number(b.id === state.nation) - Number(a.id === state.nation) ||
        Number(sim.atWar(state.nation, b.id)) -
          Number(sim.atWar(state.nation, a.id)) ||
        Number(neighbors.has(b.id)) - Number(neighbors.has(a.id)) ||
        a.name.localeCompare(b.name),
    );
  if (!diplomacyNation)
    diplomacyNation =
      countries.find((c) => c.id !== state.nation && neighbors.has(c.id))?.id ??
      countries.find((c) => c.id !== state.nation)?.id ??
      state.nation;
  const list = $("#nation-list");
  const relation = (id: string) =>
    state.nations[id].defeated
      ? state.nations[id].annexedBy ? "Annexed" : "Surrendered"
      : id === state.nation
        ? "Your nation"
        : sim.atWar(state.nation, id)
          ? "At war"
          : sim.allied(state.nation, id) ? "Allied" : "At peace";
  const key = countries
    .map((c) => c.id + relation(c.id) + (c.id === diplomacyNation))
    .join("|");
  if (list.dataset.key !== key) {
    list.dataset.key = key;
    list.innerHTML = countries.length
      ? countries
          .map(
            (c) =>
              `<button class="diplomacy-nation${c.id === diplomacyNation ? " selected" : ""}" data-nation="${c.id}" aria-pressed="${c.id === diplomacyNation}">${countryFlag(c)}<span><strong>${escapeHtml(c.name)}</strong><small>${c.id === state.nation ? "You" : (neighbors.has(c.id) ? "Neighbour · " : "") + escapeHtml(getRegion(focusedRegion).name)}</small></span><span class="relation-label ${sim.atWar(state.nation, c.id) ? "war" : ""}">${relation(c.id)}</span></button>`,
          )
          .join("")
      : '<p class="empty-search">No nations found.</p>';
  }
  const nation = state.nations[diplomacyNation],
    country = data.countries.find((c) => c.id === diplomacyNation);
  if (!nation || !country) return;
  const details = $("#nation-details"),
    atWar = sim.atWar(state.nation, nation.id);
  const isAlly = sim.allied(state.nation, nation.id);
  const detailKey = nation.id + atWar + nation.defeated + isAlly + nation.annexedBy;
  if (details.dataset.key !== detailKey) {
    details.dataset.key = detailKey;
    details.innerHTML = `<div class="nation-detail-heading detail-card"><div class="selected-nation">${countryFlag(country)}<span><h3>${escapeHtml(country.name)}</h3><small>${nation.id===state.nation ? "Your nation" : neighbors.has(nation.id) ? "Neighbour" : "Continent nation"} · ${escapeHtml(getRegion(focusedRegion).name)}</small></span></div><span class="relation-label ${atWar ? "war" : ""}">${icon(atWar?"shield":"globe")} ${relation(nation.id)}</span></div>
    <div class="nation-metrics detail-card"><div><small>${icon("diamond")} Treasury</small><strong id="foreign-credits"></strong></div><div><small>${icon("layers")} Income</small><strong id="foreign-income"></strong></div><div><small>${icon("units")} Army</small><strong id="foreign-army"></strong><span id="foreign-army-note"></span></div><div><small>${icon("home")} Infrastructure</small><strong id="foreign-industry"></strong></div></div>
    <div class="nation-facts detail-card"><div>${icon("home")}<span><small>Capital</small><strong id="foreign-capital"></strong></span></div><div>${icon("layers")}<span><small>Cities held</small><strong id="foreign-city-control"></strong></span></div><div>${icon("units")}<span><small>Force capacity</small><strong id="foreign-capacity"></strong></span></div><div>${icon("units")}<span><small>Population</small><strong id="foreign-population"></strong></span></div></div>
    <p id="foreign-doctrine" class="foreign-doctrine detail-card"></p>
    <div class="intelligence-actions detail-card"><h4>${icon("target")} Intelligence</h4><p id="intel-status"></p><div class="intel-buttons">${nation.id !== state.nation ? `<button id="recon-button" class="secondary-button">${icon("target")} Recon <span class="cost">120</span></button><button id="network-button" class="secondary-button">${icon("shield")} Spy network <span class="cost">250</span></button>` : ""}<button id="counter-button" class="secondary-button">${icon("shield")} <span id="counter-label">Counterintelligence · 150</span></button></div></div>
    <details class="diplomacy-explainer detail-card"><summary>${icon("flag")} Land access & alliances ${icon("chevron")}</summary><p>Land access requires ownership, declared war, or an alliance. Alliances grant mutual access without automatically joining wars.${nation.capital ? "" : " This small territory develops through its economy and strategic reserves."}</p></details>
    <details class="diplomacy-explainer detail-card"><summary>${icon("home")} Capitulation rules ${icon("chevron")}</summary><p>${nation.annexedBy ? "Annexed by " + escapeHtml(sim.nationName(nation.annexedBy)) + "." : "Losing the capital and more than half of a nation’s cities forces capitulation."}</p></details>
    <div class="diplomacy-actions">${nation.id !== state.nation && !nation.defeated ? `${!atWar ? `<button id="alliance-action" class="peace-button">${icon("flag")} ${isAlly ? "End alliance" : "Form alliance"}</button>` : ""}` : ""}<button id="view-nation" class="secondary-button">${icon("target")} View nation</button>${nation.id !== state.nation && !nation.defeated && !isAlly ? `<button id="war-action" class="${atWar ? "peace-button" : "war-button"}">${icon("shield")} ${atWar ? "Make peace" : "Declare war"}</button>` : ""}</div>`;
    for (const [selector, kind] of [
      ["#recon-button", "recon"],
      ["#network-button", "network"],
    ] as const)
      $(selector)?.addEventListener("click", () => {
        const error = sim.enqueue({kind:"intelligence",target:nation.id,mission:kind});
        if (error) toast(error);
        else {
          eventMessage("Intelligence operation queued for the next tick.");
          saveCampaign(sim.state);
        }
        renderDiplomacy();
      });
    $("#counter-button").addEventListener("click", () => {
      const error = sim.enqueue({kind:"counterIntelligence"});
      if (error) toast(error);
      else {
        eventMessage("Counterintelligence queued for the next tick.");
        saveCampaign(sim.state);
      }
      renderDiplomacy();
    });
    $("#alliance-action")?.addEventListener("click", () => {
      const error = sim.enqueue({kind:"alliance",target:nation.id,enabled:!sim.allied(state.nation,nation.id)});
      if (error) toast(error);
      renderDiplomacy(); updatePlayUI();
    });
    $("#war-action")?.addEventListener("click", () => {
      const error = sim.enqueue({kind:sim.atWar(state.nation,nation.id)?"peace":"war",target:nation.id});
      if (error) toast(error);
      renderDiplomacy();
      updatePlayUI();
    });
    $("#view-nation").addEventListener("click", () => {
      const point = nation.capital ?? [
        (country.bounds[0] + country.bounds[2]) / 2,
        (country.bounds[1] + country.bounds[3]) / 2,
      ];
      play?.panTo(point[0], point[1]);
      if (innerWidth <= 800) closeDiplomacy();
    });
  }
  $("#foreign-credits").textContent = Math.floor(
    nation.credits,
  ).toLocaleString();
  $("#foreign-income").textContent = nation.defeated
    ? "—"
    : `+${sim.nationIncome(nation.id)}/s`;
  const cities = (state.cities ?? []).filter((c) => c.nation === nation.id),
    capital = cities.find((c) => c.capital);
  $("#foreign-city-control").textContent = `${cities.filter((c) => c.controller === nation.id).length} / ${cities.length}`;
  $("#foreign-capital").textContent = (capital?.name ?? "—") + (capital && capital.controller !== nation.id ? " (occupied)" : "");
  $("#foreign-capacity").textContent = String(sim.nationCapacity(nation.id));
  $("#foreign-population").textContent = sim.territory.population(nation.id).toLocaleString();
  const intelligence = sim.visibility.hasIntelligence(state.nation, nation.id);
  const spotted = state.units.filter(
    (u) => u.nation === nation.id && sim.visibility.canSee(state.nation, u),
  ).length;
  $("#foreign-army").textContent = intelligence
    ? String(sim.nationArmy(nation.id)) +
      (nation.reserves ? ` (${nation.reserves} reserve)` : "")
    : `${spotted} spotted`;
  $("#foreign-army-note").textContent = intelligence ? "Live intelligence" : "Observed units only";
  const mission = state.intelligence?.find(
    (m) =>
      m.observer === state.nation &&
      m.target === nation.id &&
      m.expiresAt > state.elapsed,
  );
  $("#intel-status").textContent =
    nation.id === state.nation
      ? "Your units and buildings remain visible. Counterintelligence blocks foreign spy missions."
      : mission?.failed
        ? "Operation blocked by counterintelligence."
        : mission && mission.readyAt > state.elapsed
          ? `Gathering intelligence · ${Math.ceil(mission.readyAt - state.elapsed)}s`
          : intelligence
            ? `Live military intelligence · ${Math.ceil((mission?.expiresAt ?? state.elapsed) - state.elapsed)}s remaining`
            : "No live intelligence. Only units and buildings within your sensors’ range are visible.";
  const counter = Math.ceil(
    (sim.playerNation.counterIntelUntil ?? 0) - state.elapsed,
  );
  $("#counter-label").textContent =
    counter > 0
      ? `Counterintelligence active · ${counter}s`
      : "Counterintelligence · 150";
  $<HTMLButtonElement>("#counter-button").disabled = counter > 0;
  $("#foreign-industry").textContent = `${nation.industry} / 8`;
  $("#foreign-doctrine").textContent =
    `${doctrines[nation.doctrine].name} doctrine · ${doctrines[nation.doctrine].description}`;
}
function renderRankings() {
  if (!simulation || !data) return;
  const metric = $<HTMLSelectElement>("#ranking-sort").value as
    "score" | "military" | "economy" | "resources";
  const entries = countryRankings(simulation.state, data).sort(
    (a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name),
  );
  $("#ranking-table").innerHTML =
    `<table><thead><tr><th>#</th><th>Nation</th><th>Economy</th><th>Military</th><th>Resources</th></tr></thead><tbody>${entries.map((r, i) => `<tr class="${r.id === simulation!.state.nation ? "your-ranking" : ""}"><td>${i + 1}</td><td><span class="ranking-dot" style="background:${nationColor(r.id, data!)}"></span>${escapeHtml(r.name)}${r.defeated ? " · defeated" : ""}</td><td>${r.economy}</td><td>${r.military}</td><td>${r.resources}</td></tr>`).join("")}</tbody></table>`;
}
function closeLeaders() {
  $("#leaders-panel").hidden = true;
  $("#leaders-button").setAttribute("aria-expanded", "false");
}
function openLeaders() {
  if (mode !== "play" || !simulation || !play) return;
  cancelCommand(); closeDiplomacy(); economyPanel.close();
  const selection = majoritySelection(simulation.state, play.selected);
  if (selection.total) leaderBranch = selection.branch;
  $("#leaders-panel").hidden = false;
  $("#leaders-button").setAttribute("aria-expanded", "true");
  renderLeaders();
}
function renderLeaders() {
  if (!simulation || !play) return;
  const sim = simulation, state = sim.state, selection = majoritySelection(state, play.selected);
  const leaders = state.leaders!.filter((l) => l.nation === state.nation && l.branch === leaderBranch);
  if (!leaders.some((l) => l.id === selectedLeader)) selectedLeader = leaders[0]?.id ?? null;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-leader-branch]")) {
    button.classList.toggle("active", button.dataset.leaderBranch === leaderBranch);
    button.setAttribute("aria-pressed", String(button.dataset.leaderBranch === leaderBranch));
  }
  $("#leader-selection").textContent = selection.total
    ? `${selection.army} ground · ${selection.navy} ships selected. ${selection.branch === "army" ? "Army" : "Navy"} majority${selection.army === selection.navy ? " (tie → army)" : ""}: assign ${selection.units.length}; the other branch stays with its current command.`
    : "Select units on the map, then assign them here. Mixed selections use the majority branch; ties use army.";
  const list = $("#leader-list"), listKey = leaders.map((l) => `${l.id}:${l.color}:${sim.command.force(l.id).length}:${selectedLeader === l.id}`).join("|");
  if (list.dataset.key !== listKey) {
    list.dataset.key = listKey;
    list.innerHTML = leaders.map((l) => `<button class="leader-card${l.id === selectedLeader ? " active" : ""}" data-leader="${l.id}" aria-pressed="${l.id === selectedLeader}"><span class="leader-swatch" style="background:${l.color}"></span><span><strong>${escapeHtml(l.name)}</strong><small>${sim.command.force(l.id).length} ${leaderBranch === "army" ? "ground units" : "ships"}</small></span>${icon(leaderBranch === "army" ? "shield" : "flag")}</button>`).join("");
  }
  $("#create-leader").textContent = leaderBranch === "army" ? "Appoint general" : "Appoint admiral";
  $<HTMLButtonElement>("#create-leader").disabled = leaders.length >= 8;
  const leader = sim.command.get(selectedLeader ?? undefined), details = $("#leader-details");
  if (!leader) { details.innerHTML = ""; return; }
  if (details.dataset.key !== String(leader.id)) {
    details.dataset.key = String(leader.id);
    details.innerHTML = `<div class="nation-detail-heading"><h3>${escapeHtml(leader.name)}</h3><span id="leader-level" class="relation-label"></span></div><label class="leader-colour-label" for="leader-color">Command & frontline colour<input id="leader-color" type="color" value="${leader.color}"></label><div class="leader-stats"><div><small>Attack</small><strong id="leader-attack"></strong></div><div><small>Defense</small><strong id="leader-defense"></strong></div><div><small>Manoeuvre</small><strong id="leader-maneuver"></strong></div></div><p id="leader-experience" class="territory-note"></p><p id="leader-strength" class="territory-note"></p>${leader.branch === "army" ? '<div class="leader-orders" role="group" aria-label="General orders"><button id="leader-order-attack" class="secondary-button">Attack</button><button id="leader-order-defend" class="secondary-button">Defend</button></div><p id="leader-order-status" class="territory-note"></p>' : ""}<div class="leader-actions"><button id="leader-assign" class="primary-button">Assign selection</button><button id="leader-select-force" class="secondary-button">Select force</button><button id="leader-unassign" class="secondary-button">Unassign selected</button></div><p class="territory-note">Bonuses apply to this leader’s units and stack with national doctrine. Every 250 combat XP adds a level (maximum 5). Colour updates existing frontlines.</p>`;
    for(const stance of ["attack","defend"] as LeaderStance[])
      $("#leader-order-"+stance)?.addEventListener("click",()=>{
        const error=sim.setLeaderStance(leader.id,stance);if(error)toast(error);renderLeaders();
      });
    $("#leader-color").addEventListener("input", (event) => {
      const error = sim.command.setColor(leader.id, (event.target as HTMLInputElement).value);
      if (error) toast(error); else renderLeaders();
    });
    $("#leader-color").addEventListener("change", () => saveCampaign(state));
    $("#leader-assign").addEventListener("click", () => {
      const result = sim.command.assign(play!.selected, leader.id);
      if (result.error) { toast(result.error); return; }
      play!.selected.clear(); result.ids.forEach((id) => play!.selected.add(id));
      eventMessage(`${result.ids.length} ${result.branch === "army" ? "ground units" : "ships"} assigned to ${leader.name}.`);
      saveCampaign(state); updatePlayUI();
    });
    $("#leader-select-force").addEventListener("click", () => {
      play!.selected.clear();
      sim.command.force(leader.id).filter((u) => !u.embarkedOn).forEach((u) => play!.selected.add(u.id));
      updatePlayUI();
    });
    $("#leader-unassign").addEventListener("click", () => {
      for (const u of sim.playerUnits) if (play!.selected.has(u.id) && u.leaderId === leader.id) delete u.leaderId;
      saveCampaign(state); updatePlayUI();
    });
  }
  const bonuses = leaderBonuses(leader), force = sim.command.force(leader.id);
  $("#leader-level").textContent = `Level ${leaderLevel(leader)}`;
  $("#leader-attack").textContent = `+${Math.round((bonuses.damage - 1) * 100)}%`;
  $("#leader-defense").textContent = `−${Math.round((1 - bonuses.received) * 100)}% damage`;
  $("#leader-maneuver").textContent = `+${Math.round((bonuses.speed - 1) * 100)}% speed`;
  $("#leader-experience").textContent = `${Math.floor(leader.experience)} combat XP · ${leaderLevel(leader) === 5 ? "Maximum level" : Math.ceil(leaderLevel(leader) * 250 - leader.experience) + " XP to next level"}`;
  const hp = force.reduce((n,u) => n + u.hp,0), maxHp = force.reduce((n,u) => n + u.maxHp,0);
  $("#leader-strength").textContent = `${force.length} assigned · ${maxHp ? Math.round(hp / maxHp * 100) : 0}% strength · ${force.filter((u) => u.frontline).length} on frontlines`;
  if(leader.branch === "army") {
    const attacking=leader.stance === "attack", hostile=force.filter((u)=>u.frontline&&sim.atWar(u.nation,u.frontline.target)).length;
    for(const stance of ["attack","defend"] as const) {
      $("#leader-order-"+stance).classList.toggle("active",leader.stance===stance);
      $("#leader-order-"+stance).setAttribute("aria-pressed",String(leader.stance===stance));
    }
    $("#leader-order-status").textContent=attacking ? hostile ? `Attack · advancing on ${hostile} hostile frontline positions; keep fighting while engaged.` : "Attack ready · holds the border until war is declared against its nation." : "Defend · avoids initiating combat, returns fire when attacked, and returns to defensive positions. Manual move orders take priority.";
  }
  const colour = $<HTMLInputElement>("#leader-color");
  if (document.activeElement !== colour) colour.value = leader.color;
  const assign = $<HTMLButtonElement>("#leader-assign");
  assign.disabled = !selection.total || selection.branch !== leader.branch || state.result !== "playing";
  assign.textContent = selection.total && selection.branch === leader.branch ? `Assign ${selection.units.length} ${leader.branch === "army" ? "ground units" : "ships"}` : "Select matching units";
  $<HTMLButtonElement>("#leader-select-force").disabled = !force.some((u) => !u.embarkedOn);
  $<HTMLButtonElement>("#leader-unassign").disabled = !force.some((u) => play!.selected.has(u.id) && !u.embarkedOn);
}

function closeDiplomacy() {
  $("#diplomacy-panel").hidden = true;
  $("#diplomacy-button").setAttribute("aria-expanded", "false");
}
function toggleDiplomacy() {
  if (mode !== "play") return;
  const opening = $("#diplomacy-panel").hidden;
  $("#diplomacy-panel").hidden = !opening;
  $("#diplomacy-button").setAttribute("aria-expanded", String(opening));
  if (opening) {
    economyPanel.close();
    closeLeaders();
    cancelCommand();
    $(".command-panel").classList.remove("mobile-open");
    renderDiplomacy();
    $<HTMLInputElement>("#nation-search").focus();
  }
}

function showHelp() {
  if (mode === "countdown" || mode === "transition") return;
  priorPause = simulation?.paused ?? false;
  if (simulation) simulation.paused = true;
  $("#dialog-content").innerHTML =
    `<div class="eyebrow">HOW TO PLAY</div><h2>Your nation. Your decisions.</h2><p class="dialog-intro">After a five-second countdown, every nation starts at peace. One real second advances one game tick; five ticks make a day. Orders execute on ticks, and the top bar shows the day’s progress. Build your economy before choosing a conflict.</p><div class="manual-grid"><div>${icon("diamond")}<strong>Build wealth</strong><p>Upgrade infrastructure for +2 credits/s per level. Extractors at coloured mineral deposits add +7 credits/s and collect iron, coal, copper, zinc, gold, or diamonds. Factories turn minerals into steel, electronics, consumer goods, or army supplies. Open Industry & trade to choose recipes, manage stockpiles, and import/export goods. Trade once on the next tick or schedule recurring deliveries every five days (25 ticks). Domestic consumer sales earn credits; direct trade is limited to peaceful nations. All AI nations develop their own economies and keep a treasury reserve. Productive income and infrastructure also speed up unit training. Supplies start at 3/s, plus 0.5/s per infrastructure level, 1/s per extractor, and a city bonus.</p></div><div>${icon("flag")}<strong>Choose peace or war</strong><p>Open Diplomacy, select a nation, and choose Declare war to enable combat. Make peace ends combat on the next tick. Neutral armies never attack each other. AI leaders consider war only when funded, militarily stronger, and able to reach the target. Diplomacy also offers reconnaissance, spy networks, counterintelligence, and public country rankings.</p></div><div>${icon("shield")}<strong>Set a military doctrine</strong><p>Balanced has no modifiers. Defensive reduces damage taken by 20% but is 15% slower. Maneuver is 30% faster but deals 15% less damage. Firepower deals 25% more damage but is 15% slower. Change doctrines during peace, with a 60-second cooldown.</p></div><div>${icon("units")}<strong>Command your army</strong><p>Click or drag to select. Right-click to move troops on land or ships on ocean. Each HQ, barracks, or port trains one matching unit at a time. Add barracks for parallel army production; control more real ports for parallel naval production. Open Ports to locate or repair your harbours. Board nearby transports, then right-click a coast to sail and land. Choose Frontline with infantry selected, then click a border to spread squads along your side. Move and Stop cancel a frontline. Leaders opens separate generals and admirals; select units and assign a leader, with mixed selections using the majority branch (ties: army). Leader stats include combat bonuses and an editable frontline colour. Only declared enemies fight. Foreign units and buildings stay hidden until your units, buildings, or intelligence reveal them.</p></div></div><div class="keyboard-guide"><span><kbd>WASD</kbd> Pan</span><span><kbd>Q</kbd> Select all</span><span><kbd>X</kbd> Stop</span><span><kbd>F</kbd> Headquarters</span><span><kbd>Space</kbd> Pause</span><span><kbd>Esc</kbd> Cancel</span></div><p class="manual-note">Only the active continent simulates. Returning to the world saves and pauses it. Very small territories develop through economic statistics and army reserves when a full capital does not fit. Use docks to train frigates and transports. Move ground troops near a friendly transport and choose Board. Right-click an enemy coast with a loaded transport to sail and land. Ground troops must physically occupy an enemy strategic state for one uncontested occupation tick (one second) to capture it. Adjacent states stay with their owners. Capturing a capital and more than half the country’s cities forces capitulation and annexation. Ships control sea zones and transport troops to accessible coasts. Neutral borders are closed; form an alliance for mutual military access. Alliances do not automatically join wars. Wars, alliances, frontlines, state control, doctrines, and economies are saved.</p>${simulation ? '<button id="restart-button" class="secondary-button">Restart this continent</button>' : ""}`;
  $("#close-dialog").hidden = false;
  if (!manual.open) manual.showModal();
  $("#restart-button")?.addEventListener("click", () => {
    manual.close();
    void enterPlay(true);
  });
}
function showResult(_result: Campaign["result"]) {
  priorPause = true;
  if (manual.open) manual.close();
  closeDiplomacy();
  $("#dialog-content").innerHTML =
    `<div class="eyebrow">BATTLE ENDED</div><h2>Your territory and forces have been lost.</h2><p class="dialog-intro">Rebuild your economy, reconsider your doctrine, and choose your conflicts carefully next time.</p><div class="result-stat"><span>TIME PLAYED</span><strong>${formatTime(simulation!.state.elapsed)}</strong></div><button id="result-overview" class="primary-button">Back to world ${icon("globe")}</button><button id="result-restart" class="secondary-button">Restart continent ${icon("arrow")}</button>`;
  $("#close-dialog").hidden = true;
  manual.showModal();
  $("#result-overview").addEventListener("click", returnToOverview);
  $("#result-restart").addEventListener("click", () => {
    manual.close();
    void enterPlay(true);
  });
}

function resize() {
  if (!renderer || !globe) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  globe.resize(window.innerWidth, window.innerHeight);
  play?.resize(window.innerWidth, window.innerHeight);
}

function animate(time: number) {
  paths?.flush();
  requestAnimationFrame(animate);
  const elapsed=Math.max(0,(time-previousTime)/1000||0.016);
  const dt = Math.min(elapsed, 0.1);
  previousTime = time;
  if (mode === "overview") {
    globe.update(dt);
    renderer.render(globe.scene, globe.camera);
    for (const region of regions) {
      const point = globe.markerPosition(
        region.id,
        window.innerWidth,
        window.innerHeight,
      );
      const marker = $(`[data-marker="${region.id}"]`);
      marker.style.transform = `translate(${point.x}px, ${point.y}px)`;
      marker.hidden = !point.visible;
      marker.classList.toggle("focused", region.id === focusedRegion);
    }
  } else if (mode === "countdown" && play && simulation) {
    play.update(dt);
    renderer.render(play.scene, play.camera);
    const remaining = Math.max(0, Math.ceil((countdownDeadline - time) / 1000));
    const number = String(remaining || 1);
    if ($("#countdown-number").textContent !== number)
      $("#countdown-number").textContent = number;
    if (remaining === 0 && !document.hidden) {
      mode = "play";
      runtimeTimings={simulationPeakMs:0,viewPeakMs:0,uiPeakMs:0};
      $("#battle-countdown").hidden = true;
      $("#play-ui").hidden = false;
      saveCampaign(simulation.state);
      updatePlayUI();
      eventMessage(
        simulation.state.elapsed > 0
          ? "Welcome back. Your world is ready."
          : "All nations are at peace. Build your economy and open Diplomacy when you're ready.",
      );
    }
  } else if (mode === "play" && play && simulation) {
    const simStart=performance.now();
    if(!document.hidden)simulation.step(Math.min(elapsed,5));
    updateClockUI();
    runtimeTimings.simulationPeakMs=Math.max(runtimeTimings.simulationPeakMs,performance.now()-simStart);
    const viewStart=performance.now();
    play.update(dt);
    renderer.render(play.scene, play.camera);
    runtimeTimings.viewPeakMs=Math.max(runtimeTimings.viewPeakMs,performance.now()-viewStart);
    uiTimer -= dt;
    if (uiTimer <= 0) {
      uiTimer = 0.2;
      const uiStart=performance.now();updatePlayUI();runtimeTimings.uiPeakMs=Math.max(runtimeTimings.uiPeakMs,performance.now()-uiStart);
    }
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-region], [data-marker]",
))
  button.addEventListener("click", () => {
    void focusRegion(button.dataset.region ?? button.dataset.marker!);
  });
nationSelect.addEventListener("change", updateDeploy);
deployButton.addEventListener("click", () => {
  void enterPlay();
});
$("#retry-data").addEventListener("click", () => {
  void focusRegion(focusedRegion, true);
});
$("#world-nav").addEventListener("click", () => {
  if (mode === "play" || mode === "countdown") returnToOverview();
  else globe.focus(focusedRegion);
});
$("#help-button").addEventListener("click", showHelp);
$("#cancel-countdown").addEventListener("click", returnToOverview);
$("#leaders-button").addEventListener("click", () => $("#leaders-panel").hidden ? openLeaders() : closeLeaders());
$("#assign-leader-button").addEventListener("click", openLeaders);
$("#leaders-close").addEventListener("click", closeLeaders);
$("#leaders-panel").addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); closeLeaders(); $("#leaders-button").focus(); }
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-leader-branch]"))
  button.addEventListener("click", () => { leaderBranch = button.dataset.leaderBranch as LeaderBranch; selectedLeader = null; renderLeaders(); });
$("#leader-list").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-leader]");
  if (button) { selectedLeader = Number(button.dataset.leader); renderLeaders(); }
});
$("#create-leader").addEventListener("click", () => {
  if (!simulation) return;
  const leader = simulation.command.create(leaderBranch);
  if (!leader) { toast("Eight leaders per branch is the maximum."); return; }
  selectedLeader = leader.id; saveCampaign(simulation.state); renderLeaders();
});
$("#diplomacy-button").addEventListener("click", toggleDiplomacy);
$("#diplomacy-close").addEventListener("click", closeDiplomacy);
$("#nation-search").addEventListener("input", renderDiplomacy);
$("#nation-filter").addEventListener("change", renderDiplomacy);
$("#return-world-button").addEventListener("click", () => $("#world-nav").click());
$("#play-help-button").addEventListener("click", showHelp);
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-panel-tab]")) button.addEventListener("click", () => {
  for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-panel-tab]")) {
    const active=tab===button; tab.classList.toggle("active",active); tab.setAttribute("aria-selected",String(active));
    $(`#${tab.dataset.panelTab}-controls`).hidden=!active;
  }
});
$("#ranking-sort").addEventListener("change", renderRankings);
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-diplomacy-tab]",
))
  button.addEventListener("click", () => {
    const rankings = button.dataset.diplomacyTab === "rankings";
    $("#rankings-panel").hidden = !rankings;
    $("#diplomacy-sidebar").hidden = rankings;
    $("#nation-list").hidden = rankings;
    $("#nation-details").hidden = rankings;
    $("#nation-search").hidden = rankings;
    for (const item of document.querySelectorAll<HTMLButtonElement>(
      "[data-diplomacy-tab]",
    ))
      item.classList.toggle("active", item === button);
    if (rankings) renderRankings();
    else renderDiplomacy();
  });
$("#embark-button").addEventListener("click", () => {
  if (!simulation || !play) return;
  const error = simulation.enqueue({kind:"embark",ids:[...play.selected]});
  if (error) toast(error);
  else
    eventMessage(
      "Embark order queued for the next tick.",
    );
  updatePlayUI();
});
$("#land-button").addEventListener("click", () => {
  if (!simulation || !play) return;
  const error = simulation.enqueue({kind:"disembark",ids:[...play.selected]});
  if (error) toast(error);
  else eventMessage("Disembark order queued for the next tick.");
  updatePlayUI();
});
$("#nation-search").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeDiplomacy();
    $("#diplomacy-button").focus();
  }
});
$("#nation-list").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-nation]",
  );
  if (button) {
    diplomacyNation = button.dataset.nation!;
    renderDiplomacy();
  }
});
$("#industry-button").addEventListener("click",()=>{
  if(mode!=="play")return;
  if(economyPanel.visible){economyPanel.close();return;}
  cancelCommand();closeDiplomacy();closeLeaders();economyPanel.open();
  $("#industry-button").setAttribute("aria-expanded","true");
});
$("#invest-button").addEventListener("click", () => {
  submit({kind:"invest"});
  updatePlayUI();
});
$("#doctrine-select").addEventListener("change", (event) => {
  submit({kind:"doctrine",doctrine:(event.target as HTMLSelectElement).value as DoctrineId});
  updatePlayUI();
});
$("#manage-button").addEventListener("click", () => {
  closeDiplomacy();
  $(".command-panel").classList.toggle("mobile-open");
});
$("#manage-close").addEventListener("click", () =>
  $(".command-panel").classList.remove("mobile-open"),
);
$("#close-dialog").addEventListener("click", () => manual.close());
manual.addEventListener("close", () => {
  if (simulation && simulation.state.result === "playing")
    simulation.paused = priorPause;
});
manual.addEventListener("cancel", (event) => {
  if (simulation?.state.result !== "playing" && simulation)
    event.preventDefault();
});
function showPorts(){
  if(!simulation||!play)return;
  priorPause=simulation.paused;simulation.paused=true;
  const sim=simulation,ports=(data?.ports??[]).filter((p)=>sim.state.buildings.some((b)=>b.portId===p.id&&sim.territory.controllerAt(cellAt(sim.grid,b.x,b.z))===sim.state.nation));
  $("#dialog-content").innerHTML=`<div class="eyebrow">NAVAL INFRASTRUCTURE</div><h2>National ports</h2><p class="dialog-intro">Docks are fixed at real-world harbours. Each operational dock provides one naval production line.</p>${ports.length?ports.map((p)=>{const b=sim.state.buildings.find((b)=>b.portId===p.id)!;return `<div class="port-row"><span><strong>⚓ ${escapeHtml(p.name)}</strong><small>${b.hp>0?"Operational":"Damaged"} · near ${escapeHtml(p.city)}</small></span><button class="secondary-button" data-view-port="${p.id}">Locate</button>${b.hp<=0?`<button class="secondary-button" data-repair-port="${p.id}">Repair · 180 / 30</button>`:""}</div>`;}).join(""):"<p>No navigable mapped port is currently under your control.</p>"}`;
  for(const button of document.querySelectorAll<HTMLButtonElement>("[data-view-port]"))button.onclick=()=>{const p=ports.find((p)=>p.id===button.dataset.viewPort)!;play?.panTo(p.x,p.z);manual.close();simulation!.paused=priorPause;};
  for(const button of document.querySelectorAll<HTMLButtonElement>("[data-repair-port]"))button.onclick=()=>{const error=sim.enqueue({kind:"repairPort",id:button.dataset.repairPort!});if(error)toast(error);else{manual.close();sim.paused=priorPause;toast("Port repair queued for the next tick.");}};
  manual.showModal();
}
$("#ports-button").addEventListener("click",showPorts);
$("#pause-button").addEventListener("click", () => {
  if (simulation) simulation.paused = !simulation.paused;
  updatePlayUI();
});
$("#focus-button").addEventListener("click", () => play?.focusBase());
$("#frame-button").addEventListener("click", () => play?.frameContinent());
$("#select-all-button").addEventListener("click", () => {
  simulation?.playerUnits.forEach((u) => play?.selected.add(u.id));
  updatePlayUI();
});
$("#stop-button").addEventListener("click", () => {
  if (play) simulation?.stop([...play.selected]);
  cancelCommand();
});
$("#frontline-button").addEventListener("click", () => {
  if (!simulation?.playerUnits.some((u) => u.type === "infantry" && play?.selected.has(u.id))) {
    toast("Select infantry squads first."); return;
  }
  cancelCommand(); closeLeaders();
  frontlineMode = true;
  $("#frontline-button").classList.add("active");
  $("#build-banner").textContent = "Choose a land border to defend · Infantry spread along your side · Esc to cancel";
  $("#build-banner").hidden = false;
});
$("#move-button").addEventListener("click", () => {
  if (!play?.selected.size) {
    toast("Select your units first.");
    return;
  }
  cancelCommand();
  moveMode = true;
  $("#move-button").classList.add("active");
  $("#build-banner").textContent = "Choose a land destination · Esc to cancel";
  $("#build-banner").hidden = false;
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-train]",
))
  button.addEventListener("click", () => {
    if (!simulation) return;
    submit({kind:"train",type:button.dataset.train as Unit["type"]});
    updatePlayUI();
  });
function beginPlacement(type:Exclude<Building["type"],"hq">){
  cancelCommand();economyPanel.close();closeDiplomacy();closeLeaders();
  $(".command-panel").classList.remove("mobile-open");placement=type;
  document.querySelector(`[data-build="${type}"]`)?.classList.add("active");canvas.classList.add("placing");
  $("#build-banner").textContent=type==="mine"?"Place at a coloured mineral deposit in your nation · Esc to cancel":type==="dock"?"Place at an owned coastal site · Esc to cancel":`Place ${type==="factory"?"a factory":"barracks"} on land you control · Esc to cancel`;
  $("#build-banner").hidden=false;
}
for(const button of document.querySelectorAll<HTMLButtonElement>("[data-build]"))button.addEventListener("click",()=>beginPlacement(button.dataset.build as Exclude<Building["type"],"hq">));
minimap.addEventListener("pointerdown", (event) => {
  play?.minimapPoint(minimap, event.clientX, event.clientY);
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  if (mode === "transition" || mode === "countdown" || manual.open) return;
  if(mode==="play"&&event.button===2&&play&&simulation) {
    event.preventDefault();
    pointerStart=null;
    const point=play.groundPoint(event.clientX,event.clientY);
    if(point)issueMove(point);
    return;
  }
  pointerStart = {
    x: event.clientX,
    y: event.clientY,
    button: event.button,
    shift: event.shiftKey,
  };
  if (mode === "play" && event.button === 0 && event.pointerType !== "touch")
    canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (mode !== "play" || !play || !simulation) return;
  const point = play.groundPoint(event.clientX, event.clientY);
  if (point) {
    $("#country-hover").textContent =
      play.countryAt(point)?.name.toUpperCase() ?? "OPEN OCEAN";
    const tile = cellAt(simulation.grid, ...point),
      controller = simulation.territory.controllerAt(tile),
      province = simulation.territory.stateAt(tile);
    if (province) $("#country-hover").textContent += " · " + province.name;
    const deposit=simulation.state.nodes.find(node=>!node.claimed&&Math.hypot(node.x-point[0],node.z-point[1])<1.5&&(node.nation===simulation!.state.nation||simulation!.visibility.seesPoint(simulation!.state.nation,[node.x,node.z])||simulation!.visibility.hasIntelligence(simulation!.state.nation,node.nation)));
    if(deposit)$("#country-hover").textContent=commodities[deposit.mineral??"gold"].name+" deposit";
    if (controller && controller !== play.countryAt(point)?.id)
      $("#country-hover").textContent +=
        " · Held by " + simulation.nationName(controller);
    if (!controller && tile >= 0 && simulation.state.seaControl?.[tile])
      $("#country-hover").textContent =
        "Waters · " +
        simulation.nationName(simulation.state.seaControl[tile].controller);
    if (placement)
      play.showGhost(point, !simulation.placementError(placement, ...point));
  }
  const start = pointerStart;
  if (
    start?.button === 0 &&
    !placement &&
    !moveMode &&
    !frontlineMode &&
    event.pointerType !== "touch" &&
    Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
  ) {
    const box = $("#selection-box");
    box.hidden = false;
    box.style.left = `${Math.min(start.x, event.clientX)}px`;
    box.style.top = `${Math.min(start.y, event.clientY)}px`;
    box.style.width = `${Math.abs(event.clientX - start.x)}px`;
    box.style.height = `${Math.abs(event.clientY - start.y)}px`;
  }
});
canvas.addEventListener("pointerup", (event) => {
  const start = pointerStart;
  pointerStart = null;
  $("#selection-box").hidden = true;
  if (!start || manual.open) return;
  const moved =
    Math.hypot(start.x - event.clientX, start.y - event.clientY) > 6;
  if (mode === "overview") {
    if (!moved && start.button === 0) {
      const region = globe.pick(event.clientX, event.clientY);
      if (region) void focusRegion(region);
    }
    return;
  }
  if (mode !== "play" || !play || !simulation) return;
  const point = play.groundPoint(event.clientX, event.clientY);
  if (start.button !== 0) return;
  if (placement && point && !moved) {
    const error = simulation.placementError(placement,...point)??simulation.enqueue({kind:"build",type:placement,x:point[0],z:point[1]});
    if (error) toast(error);
    else {cancelCommand();toast("Construction queued for the next tick.");}
    updatePlayUI();
    return;
  }
  if (frontlineMode && point && !moved) {
    const error = simulation.frontline([...play.selected], point);
    if (error) toast(error);
    else { eventMessage("Infantry assigned to defend the border."); cancelCommand(); }
    updatePlayUI(); return;
  }
  if (moveMode && point && !moved) {
    issueMove(point);
    return;
  }
  if (moved && event.pointerType !== "touch")
    play.selectBox(start.x, start.y, event.clientX, event.clientY, start.shift);
  else if (!moved) {
    const id = play.pickUnit(event.clientX, event.clientY);
    if (!start.shift) play.selected.clear();
    if (id && simulation.playerUnits.some((u) => u.id === id)) {
      if (start.shift && play.selected.has(id)) play.selected.delete(id);
      else play.selected.add(id);
    }
    if (!id && point) {
      const country = play.countryAt(point);
      if (country && country.id !== simulation.state.nation) {
        diplomacyNation = country.id;
        if ($("#diplomacy-panel").hidden) toggleDiplomacy();
        else renderDiplomacy();
      }
    }
  }
  updatePlayUI();
});
canvas.addEventListener("pointercancel", () => {
  pointerStart = null;
  $("#selection-box").hidden = true;
});
window.addEventListener("keydown", (event) => {
  if (
    manual.open ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return;
  if (mode !== "play" || !play || !simulation) return;
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      event.code,
    )
  )
    event.preventDefault();
  if (event.repeat) return;
  if (event.code === "KeyQ")
    simulation.playerUnits.forEach((u) => play!.selected.add(u.id));
  if (event.code === "KeyX") simulation.stop([...play.selected]);
  if (event.code === "KeyF") play.focusBase();
  if (event.code === "Escape") {
    if (economyPanel.visible) {economyPanel.close();return;}
    if (!$("#diplomacy-panel").hidden) {
      closeDiplomacy();
      $<HTMLButtonElement>("#diplomacy-button").focus();
    } else if (!$("#leaders-panel").hidden) {
      closeLeaders(); $("#leaders-button").focus();
    } else if (placement || moveMode || frontlineMode) cancelCommand();
    else play.selected.clear();
  }
  if (event.code === "Space") simulation.paused = !simulation.paused;
  updatePlayUI();
});
window.addEventListener("resize", resize);
window.addEventListener("pagehide", () => {
  if (simulation && mode === "play") saveCampaign(simulation.state);
});
document.addEventListener("visibilitychange", () => {
  previousTime=performance.now();
  if (document.hidden && simulation && mode === "play") {
    simulation.paused = true;
    saveCampaign(simulation.state);
    updatePlayUI();
  }
});

async function boot() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    globe = new GlobeView(canvas);
    resize();
    requestAnimationFrame(animate);
    refreshSaved();
    const response = await fetch("/data/overview.json");
    if (!response.ok)
      throw new Error("Could not load the world overview. Reload to retry.");
    const overview: OverviewData = await response.json();
    globe.setData(overview);
    for (const region of regions)
      $(`[data-count="${region.id}"]`).textContent = String(
        overview.counts[region.id],
      );
    await focusRegion(focusedRegion, true);
    if (import.meta.env.DEV) {
      // Read-only diagnostics for local development and browser smoke tests.
      Object.defineProperty(window, "__worldRTS", {
        get: () => ({
          mode,
          focusedRegion,
          data,
          grid,
          state: simulation?.state,
          paused: simulation?.paused,
          selected: play ? [...play.selected] : [],
          renderer: renderer.info,
          visibleBuildingIds: play ? [...play.buildings.entries()].filter(([, model]) => model.visible).map(([id]) => id) : [],
          visibleUnitIds: play
            ? [...play.units.entries()]
                .filter(([, m]) => m.group.visible)
                .map(([id]) => id)
            : [],
          deploymentTimings,
          runtimeTimings:{...runtimeTimings},
          calendar:simulation?calendar(simulation.state.elapsed,simulation.state.tickPhase):null,
          renderTimings:play?{...play.performanceStats}:null,
          visibleCityNames:play?.visibleCityNames??[],
          modelStats: play ? {...play.modelStats} : null,
          modelScales:play?{unit:[...play.units.values()][0]?.group.scale.x,building:[...play.buildings.values()][0]?.scale.x}:null,
          pathQueue: paths?.queued ?? 0,
          frontlineColors: play ? [...play.frontlineColors] : [],
          occupationInstances: play?.occupationInstances ?? 0,
          seaControlInstances: play?.seaControlInstances ?? 0,
          maxZoom: play?.controls.maxZoom,
          globeRotation: globe.globe.rotation.toArray(),
          project: (x: number, z: number) => {
            if (!play) return null;
            const p = new THREE.Vector3(x, 0.5, z).project(play.camera);
            return {
              x: ((p.x + 1) * innerWidth) / 2,
              y: ((1 - p.y) * innerHeight) / 2,
            };
          },
        }),
      });
    }
  } catch (error) {
    const panel = $(".briefing-panel");
    panel.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Unable to load the world.";
    const message = document.createElement("p");
    message.textContent =
      error instanceof Error
        ? error.message
        : "This browser needs WebGL 2 support.";
    const retry = document.createElement("button");
    retry.className = "primary-button";
    retry.textContent = "Reload";
    retry.onclick = () => location.reload();
    panel.append(title, message, retry);
  }
}
void boot();
