# Global Conquer

Beta · v0.1.2

This update adds daily construction-site stages (excavation, frame, walls, finished
building), stable stack-frontline orders, delayed-path rebasing that preserves
neutral borders, and tank muzzle flashes/cannon recoil. Explicit Attack Move can
initiate combat under a defending general; Hold and defensive orders still return
fire only. Prepared real unit models and their attribution are in `public/models`;
original downloads are preserved in `assets/model-sources`.

Production bundles are not regenerated for this source update. Run `npm run build`
to create the current build.

A single-player browser RTS prototype built with TypeScript, Vite, and Three.js. Choose a continent on a stationary Earth, then deploy into its detailed flat map.

## Run locally

Install Node.js **22.12+** (or 20.19+), then run:

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite, normally **http://localhost:5173**. A modern browser with WebGL 2 is required. Assets and fonts are bundled locally; no API keys or external map service are needed during play.

```sh
npm test          # Navigation, all seven continents, economy, combat, persistence
npm run build    # Type-check and create dist/
npm run preview  # Serve the production build
```

For the desktop and mobile browser checks:

```sh
npx playwright install chromium
npm run test:e2e
```

On Linux, Playwright may also need its system dependencies (`npx playwright install --with-deps chromium`). `WORLD_RTS_BROWSER` can point to an existing Chromium executable. Vite uses file polling so edits also reload reliably from a Windows-mounted WSL folder.

## Play

1. Pick a continent and starting nation, then choose **Play continent**. A **five-second countdown** appears over the map. Economies, recruitment, and armies stay frozen until it ends. Cancel returns to the world without replacing a save.
2. Every nation starts **at peace**. Upgrade infrastructure for +2 credits/s per level, or place extractors at mineral deposits for +7 credits/s and material collection. Docks are existing real-world ports, not freely placed buildings; open **Ports** to locate or repair them. Supplies regenerate at **3/s + 0.5/s per infrastructure level + 1/s per extractor + 0.1 × city income/s**, capped at 9,999. The resource bar shows the current rate. AI nations have their own treasuries, infrastructure, buildings, military recruitment, and doctrines. They prioritize economic development and keep a treasury reserve.
3. Recruit infantry. Build a barracks to unlock armored vehicles. Click a unit, drag a selection box, or press **Q** to select all. Shift adds to your selection. Right-click land to move; **X** stops selected units. On touch devices, use Select all and the target button.
4. Open **Diplomacy** to inspect national wealth, income, armies, infrastructure, and doctrines. Select a country and choose **Declare war** to enable combat with that country. **Make peace** ends that bilateral conflict immediately. Neutral nations never attack one another; war between two AI nations does not make them hostile to every other country. Clicking foreign land opens its diplomacy entry. **Form alliance** grants mutual military access; **End alliance** revokes it. Make peace before allying, and end the alliance before declaring war. Alliances do not automatically join wars or reveal military positions.
5. Choose a **military doctrine** in Your nation. Doctrines can change during peace, with a 60-second cooldown. Infrastructure and armies can continue developing during peace or war.

| Doctrine  | Benefit              | Tradeoff                |
| --------- | -------------------- | ----------------------- |
| Balanced  | Standard forces      | No bonuses or penalties |
| Defensive | Take 20% less damage | Move 15% slower         |
| Maneuver  | Move 30% faster      | Deal 15% less damage    |
| Firepower | Deal 25% more damage | Move 15% slower         |

AI nations initially focus on prosperity. Ambitious nations may consider a land-neighbor war after **three simulation minutes**, when they have developed infrastructure, a large treasury, and a strong military advantage. War always goes through the same bilateral declaration system. Neutral borders are closed. Ground routes and naval landings require owned territory, declared war, or an alliance; AI leaders also check for a permitted invasion route. Ending access automatically withdraws stranded troops to their nearest controlled land. Ground occupation transfers the physically occupied strategic state. Losing the capital city and more than half of the original national cities forces capitulation and annexation. Peacetime never triggers an automatic victory screen.

**WASD / arrow keys / middle-drag:** pan. **Scroll:** zoom. **F:** focus headquarters. **Space:** pause. **Escape:** close diplomacy or cancel placement/selection. Click the tactical map to reposition. On mobile, **Manage nation** opens construction, recruitment, and doctrine controls.

Returning to the world saves and pauses the game. Snapshots also save every ten simulation seconds, when the page is hidden or closed, and after diplomacy or doctrine changes. Each continent has one local save slot; choosing a different nation replaces that slot only once its countdown finishes. Cancelling a countdown preserves the prior save. The help dialog includes Restart this continent.

The v2 save contains all national economies, wars, alliances, military leaders and their colours/stats, unit leader assignments, doctrines, armies, infantry frontlines, buildings, recruitment queues, city control, strategic states, sea control, intelligence operations, and embarked troop IDs. Earlier v2 saves gain leaders and other missing systems automatically; existing occupied navigation cells migrate to the majority controller of each strategic state. Earlier v1 skirmish saves migrate when continued: surviving player units/buildings, money, resources, and training are retained; the old generic hostile outpost is replaced by independent peaceful nations. Old storage is kept intact. Saves are local to this browser and device.

## Recruitment and production

Every living production building provides **one simultaneous training line**:

| Unit                    | Matching buildings    |
| ----------------------- | --------------------- |
| Infantry                | HQs and barracks      |
| Armor                   | Barracks              |
| Frigates and transports | Docks                 |

One dock cannot train a frigate and a transport simultaneously; two docks can train two ships. Infantry prefers HQs so barracks remain available for armor. Waiting jobs use the next compatible free building. Destroyed/captured military producers release their orders for reassignment, preserving completed work. A blocked spawn holds only that building's line, while other lines keep working.

Stronger productive economies accelerate all training. The speed multiplier is **1 + 0.08 × infrastructure level + 0.015 × max(0, income/s − 3)**, capped at **2.5×**. Treasury alone does not create a speed bonus. Unit prices are unchanged and charged once when ordered. If territory loss reduces capacity, existing troops survive and prepaid recruitment waits for a free slot. Queue capacity grows to three orders per production building (minimum five, maximum thirty); the population-based force capacity also applies. AI recruitment also uses the same slots and economy bonuses.

The Army panel displays occupied/total lines, economy speed, matching buildings per unit type, adjusted training times, and independent job progress. Producer assignments are saved with existing campaign snapshots.

## Military leaders

Open **Leaders** in the resource bar, or select units and choose **Leader** in the command strip. **Army generals** command infantry and armor; **Navy admirals** command frigates and transports. Each nation begins with two of each; appoint additional leaders up to eight per branch. The names are fictional callsigns. AI recruits automatically receive a leader for their branch; player recruits can be assigned manually.

A mixed selection votes by unit count: the majority branch is offered for assignment, and ties choose the army. Assigning retains only that branch in the map selection and changes only its commanders. The minority keeps its previous assignments. Foreign, dead, duplicate, and embarked selection IDs cannot affect the vote. Infantry retain their army leader while embarked on a separately commanded transport. **Select force** selects a leader’s available units; **Unassign selected** removes selected units from that leader.

Army generals have **Attack** and **Defend** buttons in their stats. Attack-enabled frontlines check for a declared war before advancing into the opposing country. They keep fighting while engaged and advance again as states fall. Defend avoids initiating combat, returns fire against its attacker, and returns to the defensive line when possible. A manual right-click movement cancels that unit’s frontline and takes priority, including while it is fighting. AI generals follow the same stance rules.

Leader stats show attack, defense, manoeuvre, combat experience, assigned strength, frontline count, and an editable **command/frontline colour**. Unit bodies retain national colours; selection rings, movement routes, minimap markers, and frontlines use command colours. An unassigned frontline uses the default mint colour.

Each attack/defense/manoeuvre rating point adds 2% damage, reduces received damage by 2%, or adds 2% movement speed. Actual damage dealt by commanded units awards combat XP. Every 250 XP adds a level, up to level five; each extra level improves all three modifiers by one percentage point. These bonuses stack with national doctrines. Leaders, colours, experience, assignments, and frontlines persist in the existing local save.

## Population and conquest performance

Force capacity is **6 + floor(controlled population / 2,000,000)**, capped at **240 formations** for the active simulation. Ships and reserves use the same capacity. Losing population does not delete existing troops; it blocks new recruitment and holds prepaid queues until there is room. The resource bar shows the capacity, its tooltip shows the population estimate, and Diplomacy shows both for other countries. AI army targets scale within this limit.

Country population comes from the cached Natural Earth `POP_EST`/`POP_YEAR` fields, retained in prepared map data. Controlled state shares are approximated by their share of national land cells; this is a gameplay population model. Older saves gain the population data when loaded. Capacity updates after occupation and annexation.

Conquest previously restarted every army’s routes, while diplomacy rebuilt every unit/building model. Land changes now preserve valid routes, share a cached border index, and refresh map layers once per rendered frame. Sea-only changes do not repaint land. Unit deaths retain shared infantry geometry; Ownership colours update country-local terrain textures. Political minimap terrain and economic summaries are cached.

Pathfinding requests are deduplicated, sent within a per-frame budget, and prioritize manual player orders. The worker also prioritizes those requests. Results from an earlier territory revision are accepted if still legal; invalid results are retried instead of silently losing the order. Right-click issues its command on press, tolerates mouse jitter, permits movement through buildings, and permits disengaging from combat. Paused movement orders remain queued until resume.

Saves store province-level occupation records and destinations instead of thousands of repeated cell records and full waypoint paths. Runtime cells reconstruct on load; pending routes resume through the worker. Legacy saves remain readable. The conquest diagnostic checks that unchanged routes are not restarted and that compact snapshots remain substantially smaller than their expanded runtime form. Real port infrastructure adds extra saved assets, so raw snapshot size depends on the map. This isolates CPU/serialization work, not a universal frame-rate guarantee. Run `npx vitest run src/conquest-profile.test.ts` to repeat that diagnostic.

## Loading and rendering performance

Deployment uses a preparation worker for national setup, territory partitioning, coast navigation, detailed country/lake triangulation, border geometry, upright-first label layout, and political paint fields. Prepared typed arrays transfer back to the browser instead of repeating the expensive work on the UI thread. The loading bar reports actual preparation stages, then graphics compilation/upload, followed by the existing five-second countdown. Choosing a continent also prepares navigation and nation eligibility in the background.

Continent packages are bundled as gzip files, reducing map transfers by about two thirds (Europe: 2.86 MB to 0.98 MB). The loader retains two recently used maps, retries interrupted downloads once, and reports a retryable error if a download stalls. Worker startup and preparation also have bounded retries.

Occupation changes now send changed-cell patches to the route worker. Existing masks and routes survive when permission is unchanged (for example, enemy land becoming your land during the same war). Only nations whose access changes recheck their paths. Border caches update changed border cells. Country-local, coast-padded colour fields prevent another country’s raster cells leaking across detailed vector borders; linear filtering smooths the internal ownership frontier.

The minimap uses worker-simplified coastlines and cached base/mask/border layers. A capture updates only its ownership layer, rather than clipping and rasterizing all high-detail coastlines again. Live play panels use opaque surfaces instead of repeatedly blurring changing WebGL/canvas backgrounds. The developer diagnostic exposes deployment stages and simulation/view/UI peaks, plus minimap/terrain timings.

National flags are bundled locally, displayed in the upper-left nation heading, and softly overlaid behind the management panel. A refresh loads these changes while preserving your local campaign; restarting is optional. Old freely placed docks migrate to real port sites where possible, and surviving ships remain saved.

## Political map styling

Country labels prefer a horizontal, upright orientation whenever a readable fit is available; narrow countries can still use an angled fit. The map uses a muted, reference-inspired country palette (blue France, charcoal Germany, rose United Kingdom, ochre Spain, green Italy, and comparable tones elsewhere), dark borders, and a deep-blue ocean. Nation labels use outlined, spaced capitals on the map surface, angled to fit their main landmass with a slight curve. **Country names and borders have not changed**; historical names or borders from the reference images are not substituted. Labels yield to city details when zoomed in closely.

## Cities, intelligence, navy, and occupation

- Every nation has a distinct map color shared by units, cities, diplomacy, and occupation overlays. Country geography and city locations remain visible. Foreign **units and military buildings** are shown only within your units’ or buildings’ sight range or through active intelligence; hidden forces are excluded from rendering, selection, shots, and the minimap. Ground sight is 8 map units, ship sight is 12, HQ sight is 10, and other buildings provide 7. Alliances grant access but do not share sensors.
- Diplomacy offers **Recon** (120 credits, 8 seconds to gather, 30 seconds of live military intelligence), a **Spy network** (250 credits, 15 seconds to gather, 90 seconds active), and **Counterintelligence** (150 credits, 45 seconds of protection). Counterintelligence blocks foreign operations but does not hide troops from nearby scouts. Time advances only while the game simulates.
- **Cities** use Natural Earth's major populated places, snapped to valid land. Nations without a source city receive a clearly generated capital settlement. Each controlled city contributes 1–4 credits/s according to its source population. About 7,300 mapped towns, cities, and stations are available across continent packages from Natural Earth’s 1:10m populated places. Their markers and names reveal progressively as you zoom; label collisions are reduced and all mapped places retain markers. A single screen-space canvas renders city/port labels rather than thousands of per-place GPU textures. Strategic major cities still determine income and capitulation. Camera zoom reaches 40×. Building models and footprints are smaller, and infantry, armor, frigates, and transports move roughly 20–23% slower than before.
- **Real ports** are pre-existing infrastructure from Natural Earth’s named port locations. Their map symbols are anchors, and the Ports menu lists your harbours with Locate and Repair actions. Free dock placement is disabled. Port markers retain real coordinates; naval production uses the nearest navigable owned coast because the RTS navigation grid does not model every river channel. Existing dock/ship progress migrates to mapped port infrastructure. A **frigate** costs 240 credits / 40 supplies and trains in 10 seconds. A **transport** costs 160 / 25 and trains in 8 seconds. Ships use a separate ocean grid, cannot cross land or enclosed lakes, and fight only ships of nations at war. Transports are unarmed.
- Bring ground troops within 4 map units of a friendly transport and choose **Board**. Capacity is six infantry or three armored vehicles, or a mix using the same space. Select the transport and right-click a coastal land destination: it sails to adjacent ocean and automatically disembarks troops onto valid nearby land. **Land** disembarks beside the current position. Losing a transport also loses embarked troops. Cargo stays hidden and does not provide extra sight or firepower while embarked.
- Land is divided into **strategic states**: connected gameplay provinces generated around cities and spaced inland seeds, clipped to current country borders. These are not real administrative state boundaries. Hover names identify them; the artificial grid outlines are hidden. Ground troops must physically occupy a hostile state for **one uninterrupted occupation tick (one second)** to capture that state, its cities, buildings, and deposits. Enemy defenders anywhere in that state contest capture. Leaving resets occupation progress; adjacent states remain untouched. Ships control sea zones and transport armies but cannot capture land themselves. Ceasefires retain state control and settle the captured land into the controller’s normal terrain colour. Settled territory has no occupation-square overlay, including in later wars. Ownership is painted directly on country geometry during war and peace. Both land-square overlays and sea-control trails are hidden; the military control data remains available to simulation and hover information.
- **Frontline**: select infantry, choose Frontline, then click near a controlled land border. Squads spread along your side of that border and defend it. Positions follow changes in control. Frontlines remain visible when squads are deselected, and each segment uses the colour of the leader commanding its nearest assigned defensive position. Change that colour in Leaders → leader stats; existing lines update immediately. The general’s Attack/Defend order controls this line: Attack advances only against a declared enemy; Defend holds your side, avoids initiating combat, and returns fire when attacked. An unassigned frontline defaults to defense. Move, Stop, and embarking cancel frontline assignments.
- **Capitulation** requires losing the capital city (marked ★) and **more than half** the original national cities. A one-city nation therefore falls when its capital state is occupied. The capital occupier annexes the defeated nation’s original and remaining controlled states, buildings, cities, deposits, treasury, supplies, and infrastructure. Its military surrenders and its treaties end. Destroying an HQ alone does not count as occupying the capital city. The same rule applies to the player.
- Ships establish sea control on occupied ocean tiles and can contest hostile control during war. Water control is separate from land ownership. Occupation and sea-control overlays use instanced geometry updated only when control changes.
- The **Rankings** tab sorts by overall power, economy, military, or resources. Ratings are public aggregates and never expose unit positions. Resources count treasury plus twice supplies; economic assets include infrastructure, cities, and buildings; military strength uses surviving unit health/type, doctrine modifiers, and reserves. Overall power weights resources at 0.25, economic assets at 1, and military strength at 1.5.
- **AI leaders** evaluate wars against other AI nations as well as the player. They require economic reserves, developed infrastructure, available supplies, no existing war commitments, a substantial military advantage, and a connected land route or a frigate/transport fleet for overseas campaigns. They initially prioritize wealth. Coastal nations use mapped ports to build fleets, embark troops, and attempt landings.

## Architecture

- `src/globe.ts`: fixed Earth mesh, low-detail global borders, continent picking, smooth camera focus. The globe never spins; the camera orbits it. The whole globe stays in frame; its rear hemisphere is naturally hidden.
- `src/main.ts`: overview → load → five-second countdown → play state changes, controls, UI, save/resume, and worker lifecycle. A new focus aborts the previous fetch. Only one continent has an active grid, navigation worker, and simulation; the loader caches up to two downloaded packages. Inactive continents have no live simulation.
- `src/play-view.ts`: a separate orthographic scene with flat country meshes, country borders, lakes, units, buildings, selection, and tactical map. Country and lake meshes are merged to reduce draw calls. Scene GPU resources are disposed on exit.
- `src/campaign.ts`: fixed-step 1 Hz simulation, independent national economies, AI development, bilateral diplomacy, recruitment, construction, doctrine modifiers, combat, transport coordination, and save migration. No off-screen simulation runs in overview.
- `src/navigation.ts` and `src/pathfinding.worker.ts`: a 256-cell-long-side land/ownership grid rasterized from the same projected country/lake polygons that are rendered. A* runs in a dedicated worker over separate land and ocean masks, allows passage through structures, provides coastal clearance, and prevents diagonal corner cutting. Order IDs reject stale worker responses.
- `src/production.ts`: parallel producer assignments, matching unit/building types, bounded economy-based training speed, and scalable queue capacity.
- `src/map-labels.ts`: cached main-landmass analysis and fitted, outlined geographic nation labels.
- `src/visibility.ts`: spatially bucketed force sight, timed intelligence missions, and counterintelligence. Visibility is enforced for both player and AI targeting.
- `src/naval.ts`: cached ocean/coast masks, transport capacity, embarkation, safe landings, and cargo loss.
- `src/territory.ts` and `src/states.ts`: connected strategic states, contested occupation, annexation, city control, and income.
- `src/manpower.ts` and `src/snapshot.ts`: population capacity and compact save snapshots.
- `src/path-client.ts`: priority, deduplication, bounded submission, and stale-result validation for pathfinding.
- `src/leaders.ts`: separate army/naval commands, majority assignment, stats, colours, experience, and save migration.
- `src/political-terrain.ts` and `src/political-fields.ts`: country-local ownership colour fields clipped by existing country geometry.
- `src/deployment.worker.ts`: transferable world preparation and simplified minimap geometry.
- `src/city-overlay.ts` and `src/ports.ts`: efficient place labels and fixed real port infrastructure.
- `src/relations.ts` and `src/frontline.ts`: bilateral alliances, military access, and infantry border positions. Worker access masks are cached per nation and invalidated when land control or treaties change; sea control does not rebuild land routes.
- `src/strategy.ts` and `src/geopolitics.ts`: cached land connectivity, war-readiness decisions, faction colors, and country rankings.
- `src/spatial.ts`: combat broad-phase buckets, avoiding an all-units-against-all-units distance scan each tick.
- `scripts/prepare-data.mjs`: downloads source geography, separates theatre packages, applies continent-centered azimuthal equal-area projections with D3, builds silhouettes, and resizes the Earth texture with Sharp. D3 and Sharp are build-time dependencies.

## Geography and assets

All generated assets are checked into `public/`, so data preparation is **not required** to run the app. To regenerate them:

```sh
npm run prepare:data
```

Source files are cached in ignored `.cache/`. Detailed places and real port URLs/hashes are included in the manifest. Flag attribution and checksums are in `public/flags/sources.json`; `scripts/prepare-flags.mjs` refreshes missing local SVGs from the [country-flags source project](https://github.com/hampusborgos/country-flags). Exact downloaded URLs and SHA-256 hashes are recorded in `public/data/sources.json`. The script uses Natural Earth's upstream `master`; inspect changed geography when regenerating and commit the updated manifest with the assets.

- **Earth:** [NASA Blue Marble Next Generation, December 2004](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/), resized to 4096 × 2048. Image courtesy NASA Earth Observatory. The globe is native `SphereGeometry`; no external model is required.
- **Borders:** [Natural Earth Admin 0 countries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/), at **1:10 million cartographic scale** for play; 1:110 million for overview. These scales do not mean 10-meter or 110-meter accuracy.
- **Water:** [Natural Earth lakes](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/). Country polygons provide coastlines; lake polygons are subtracted from navigation and rendered as water.
- Natural Earth vector data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Its default boundaries reflect de facto control in a fixed dataset and may differ from a desired political map. Country IDs use `ADM0_A3`, avoiding missing ISO-code placeholders.
- **Cities:** [Natural Earth populated places](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-populated-places/), at 1:110 million scale. These are major settlements and historical source populations, not a complete or current city census.
- **Fonts:** DM Sans and Manrope, distributed locally under the SIL Open Font License; license text is in `public/fonts/`.

Russia is split at **60°E** between the Europe and Asia gameplay theatres while retaining its nation ID. Overseas European territories are grouped geographically. Antarctica is a fictional expedition theatre, not a claim of national sovereignty.

## Prototype scope

This is a local, single-player nation-building sandbox with infantry, armor, frigates, transports, capitals, barracks, docks, extractors, civilian factories, mineral stockpiles, global and bilateral trade, cities, infrastructure, four military doctrines, timed intelligence, military fog of war, state occupation and capitulation, infantry frontlines, separate army/navy leaders, country rankings, and bilateral alliances/war/peace diplomacy. It does not include multiplayer, physical trade convoys, trade treaties, terrain elevation, or simulation of inactive continents.

Every country on the active continent has an economic and military state. Very small territories without room for a full capital develop through infrastructure, income, and abstract army reserves rather than placing invalid buildings or troops outside their borders. Such nations are identified in Diplomacy. Starting nations need space for a valid capital.

Resource deposits and initial military locations are generated for gameplay. The navigation grid is coarser than the detailed coastline, so tiny islands and narrow channels may be impassable. Cities without source data use generated capital names. Projected map units are intended for gameplay, not physically exact travel distances. Rankings summarize game-state power, not real-world national capability.

## Desktop interface refresh

The desktop game uses a single resource strip, Economy/Army management tabs, and a wide diplomacy window with searchable/filterable nations, flags, intelligence, and persistent action buttons. The shared palette is slate `#17232E`, warm white `#E8EDF2`, teal `#66CBB5`, amber `#DDB565`, and coral `#D87570` (`src/ui-theme.css`). World and Help controls remain in the game footer.

City and port markers project from the final camera matrix on every moving frame, with unchanged views cached. Zoom is 2.2× the previous control sensitivity and anchors to the pointer. Country fills use muted political colours, subtle continuous decorative relief, dark vector borders, and softly shaded navy water; the repeating rectangular noise texture and ocean grid are removed. Relief is visual shading, not sampled elevation or a movement modifier.

Buildings are traversable by ground units. Land/water geometry and diplomatic access still constrain movement; building placement cannot overlap other buildings. Construction and building destruction no longer invalidate routes or resend full navigation masks.

## Minerals, factories, and global trade

Open **Economy → Industry & trade** to manage stockpiles, production lines, deposits, and trade. **Factory** places a civilian factory on controlled land (320 credits / 35 supplies). Factories are separate from military recruitment buildings; each runs one configurable line. Inputs and operating credits are deducted together on batch completion. Missing inputs, full output storage, or insufficient operating credits pause progress; lines can also be paused manually.

| Line | Inputs per batch | Output | Base time |
| --- | --- | --- | --- |
| Steel mill | 3 iron + 2 coal | 3 steel | 5 seconds |
| Electronics | 2 copper + 1 zinc + 0.25 gold | 2 electronics | 6 seconds |
| Consumer goods | 1 steel + 1 electronics | 3 consumer goods | 6 seconds |
| Jewellery | 1 gold + 0.2 diamonds | 3 consumer goods | 8 seconds |
| Army supplies | 2 steel + 1 copper | 8 supplies | 6 seconds |

A batch also costs 2–3 credits. Infrastructure improves extraction and factory speed. Each nation receives a small starting mineral reserve, then needs extraction or imports for continued production. Extractors collect their site's iron, coal, copper, zinc, gold, or diamonds while retaining the existing +7 credits/s economic bonus. Deposits are deterministic gameplay resources, not a real-world mineral survey. Previously built gold extractors retain their mineral when migrating old saves. The deposit list and hover text identify each mineral.

Consumer goods can be sold to domestic customers for 12 credits each, at a limited demand rate of `0.2 + 0.04 × infrastructure` goods per second. Disable domestic sales to hold goods for exports. Trade stockpiles and manufactured goods contribute to public resource rankings; civilian factories contribute to economic rankings.

**Global trade** matches real buyers and sellers among active nations in the current theatre. Orders transfer existing goods and credits; the Open market option can split an order across eligible nations. There is no replenishing outside warehouse. Relations, war, both parties’ trade policies, stock and buyer funds govern settlement. One-off trades execute next tick; recurring trades retry every five days at current terms.

AI nations build a limited civilian factory network, import missing inputs while preserving treasury reserves, and export surplus stocks. Civilian production runs once per simulation second; AI market decisions run every 15 seconds. UI inventory updates run only while the window is open. Existing saves retain inventories, recipe/progress, paused lines, recent player trades, and market stocks. Capitulation transfers factories with their territory and national stockpiles to the victor.

Unit models now use 50% of their previous scale; building models use 0.32 rather than 0.42 (about 24% smaller). City models retain their size. Small units have a 12-pixel selection tolerance, while movement, combat, and diplomatic access retain their prior rules.

## Shared game clock and recurring orders

**One real second = one game tick. Five ticks = one day.** The resource bar shows the current day, the active tick (1–5), and a progress bar through that day. Pausing, opening a pausing dialog, returning to overview, or switching away from the tab stops game time. Saves preserve the unfinished tick, calendar position, and pending commands. The browser renders smoothly between authoritative unit positions; movement, combat, recruitment, economy, occupation, intelligence, and AI update only on full ticks. Existing per-second rates retain the same real-time meaning, applied once per tick. Combat carries weapon cooldowns across ticks to retain their average firing rate.

Construction, recruitment, one-off trades, factory settings, diplomacy, intelligence and embark/disembark actions queue for the next tick. Orders can be planned while paused; resume to execute them. Costs and legality are checked again on execution, and unsuccessful commands report an error. Saved commands use data records, so a reload preserves pending work.

In **Industry & trade → Global trade**, choose **Once · next tick** or **Every 5 days**. Recurring imports and exports first run 25 ticks after scheduling, then every 25 ticks. Each delivery uses current prices, stock, diplomatic relations, warehouse capacity, and available credits. Orders reserve no funds or goods. Missing stock, insufficient funds, full warehouses, or war skip that delivery; the order tries again at its next five-day interval. The order list shows the next due day/tick and the last result. Pause/resume or cancel any recurring order; resuming starts a fresh five-day interval. Pending trades and recurring settlement results are saved after their complete simulation tick, preventing partial tick saves or duplicate deliveries on reload. No inactive-continent or offline catch-up simulation is introduced.

## Command interface and coastal navigation

The reference-style interface uses monochrome square panels, a left Map/Forces/Economy/Diplomacy/Intel rail, right-hand management panels, and a compact top resource/calendar strip. The Menu button opens World overview and Help. Overview retains the existing globe and continent selection, with a separate Start a new game action for saved campaigns.

Land navigation retains all rasterized land-cell centres instead of removing an extra cell around every coast. This restores Denmark’s narrow/coastal routes without opening water or diagonal corner cuts. Ground recruitment stays on the producing building’s connected landmass. Separate islands still require sea transport. The navigation grid dimensions and map geography are unchanged.

## Campaign affairs, spending and revised theatres

The **NEWS & BUDGET** rail button opens military spending, the national exchange, and the news archive. Fictional geopolitical stories include national flags, elections, unrest, tensions, war and peace. Drag a report by its heading; dismissing it leaves it in the archive. Up to three reports appear at once, prioritising severity, with at most 32 retained. Recent severe crises shorten the next random-report interval. An unresolved nuclear-power tension can escalate after 60 ticks; affected governments can fund crisis talks for 75 credits. Nuclear warnings are narrative crises, not a nuclear weapon simulation.

New campaigns begin neutral and peaceful. Distance biases subsequent diplomatic events; crises, peace agreements, trade and embassies affect bilateral relations. Alliances need +20 relations; bilateral trade requires at least −10, with improved prices at +20. **Diplomacy → Establish mutual embassy** costs 150 credits, improves relations by 15, then provides both nations +2 credits and +0.5 relations each day. War closes that pair’s embassies. AI war decisions require strained relations as well as the existing economic and military readiness checks.

Every nation has a bounded stock index (initially 100), reacting to economic development, budget pressure, elections, unrest and conflict. The player may buy/sell their own national index shares using treasury funds, with a 1% spread each way. The exchange panel also lists foreign indices. These are abstract national indices rather than individual companies or a real financial exchange. Holdings, indices, relations, embassies, news and budgets persist with campaign saves.

Military spending ranges from **50–200%, with 100% as baseline**. Recruitment credits and army supplies scale with this setting, rounding up; ongoing upkeep is `(0.5 + 0.3 × formations) × spending multiplier` credits per tick and `0.04 × formations × multiplier` supplies per tick. Abstract reserves also count. At 150% spending, the funding damage multiplier is 1.25; at 50%, it is 0.75. Treasury exhaustion and supply shortages impose additional combat penalties. The resource strip reports upkeep-adjusted income, and recruitment cards show adjusted costs.

Movement is measured in **km/h**: infantry 4, armor 12, frigates 28, transports 22, before doctrine, commander, damage and shortage modifiers. One tick allocates 2.4 travel hours (12 hours per five-tick game day, allowing for operational pauses). New theatre maps include their projection scale; older maps use an approximate 45 km per map unit. Selected forces show their slowest unit’s current speed. Combat includes losses reducing firepower, reduced fire while moving, stationary defender protection and infantry penalties against armor. Capture requires a stationary, uncontested hold for 10 ticks, or 15 ticks in a city state; fighting interrupts the hold. Moving enemy troops still contest occupation.

Playable theatres are **Europe, Africa, Americas, and Asia & Oceania**. The latter two use freshly projected combined geography, cities, lakes and real ports. Antarctica remains visible on Earth but cannot be played. Older North/South America, Oceania and Asia saves remain in browser storage; combined theatres start separate save slots to avoid placing old coordinates on different maps. Existing Europe/Africa saves continue with the new systems. Regenerate only the combined maps using `node scripts/prepare-data.mjs --regions-only`; this skips rebuilding the Earth texture and downloading flags. Only the selected theatre simulates.

Focused checks: `npx vitest run src/world-affairs.test.ts` and `npx playwright test tests/affairs.spec.ts`. The production bundle in `dist/` is unchanged until you run `npm run build`.


## Material construction and trade policy

New placements are construction sites, with a progress bar above the map position. Credits and army supplies pay the initial placement cost; each completed construction day then requires an atomic instalment of materials. No partial instalment is consumed when a material is missing. Work resumes at the next funded daily check. Construction progress, next due tick and shortages persist in saves. Unfinished buildings cannot recruit, extract minerals, manufacture goods or provide building sight. Existing completed buildings stay complete.

| Building | Construction days | Materials per day |
| --- | --- | --- |
| Extractor | 2 | 2 iron + 1 copper |
| Barracks | 3 | 2 steel + 1 iron |
| Factory | 3 | 3 iron + 1 copper |
| Dock, where placement is supported | 4 | 3 steel + 2 iron |

Factories start from raw minerals so a country can establish its first steel mill without an existing supply of steel. Existing mapped ports and their repair controls remain separate.

**Industry & trade** shows daily resource surplus/deficit estimates, planned use, and stock coverage on hover. Estimates include factory inputs, functioning output, extractors, daily building instalments, domestic demand, and recurring trade averages. Scheduled imports are forecasts and may fail at settlement. Active construction projects and their shortages appear below factories.

Economic policies are in the stockpile sidebar (scroll down): **Free market** permits exporting all stock; **Balanced trade** reserves five units of every good and adds a small import markup; **Closed economy** blocks foreign trade. AI import orders can buy player goods when the player’s policy, inventory and relations allow it. Foreign purchases appear in the player’s trade history. Industrial priorities are **Balanced**, **Civilian** (+20% consumer goods/jewellery output), **Industrial** (+15% steel/electronics), and **Mobilised** (+25% army supplies, −10% other factory output). Policy changes apply next tick.

Click an owned factory on the map to open its production-line selector. Operational factories show white factory markers; factories that lack inputs, credits, storage or are paused show coral-red markers. Marker status refreshes once per tick and is drawn on a separate cached canvas, preserving city-label caching and camera alignment. The stock exchange now includes a graph with at most 120 daily history samples, saved with each nation’s index.

News windows automatically close after **15 real seconds**, or **30 seconds for severity 3–4**. A timeout bar indicates the limit. Dismissed stories remain in the News archive and can be reopened; timeouts do not resolve crises. Timers are cleared when windows leave the visible set or a different campaign is loaded.

Focused verification: `npx vitest run src/industry-evolution.test.ts` and `npx playwright test tests/industry-evolution.spec.ts`. Production build and broader regression runs remain manual.


## AI response to threatening neighbours

At its existing decision cadence, an AI nation checks current shared land borders for targeted tension/nuclear reports, wars, hostile relations and hostile military mobilisation. Neutral strength alone and allied or distant reports do not trigger the response. Threatened nations prioritise recruitment, needed barracks, arms production and military-material imports before civilian projects. Military spending rises to 150% for a threat or 175% for severe threats when affordable; low funds reduce the increase, and recruitment keeps an upkeep reserve. Defensive readiness prevents starting additional wars.

Available infantry and armor on connected landmasses receive frontline positions on their own side of the threatening neighbour’s border. Army commanders defend and return fire; new recruits join on subsequent AI decisions. Existing valid frontline orders are retained instead of repeatedly restarting routes. The AI restores its former spending, industrial priority and commander stances after threats clear and a 30-tick cooling-off period expires. Player budgets and orders remain under player control. Neighbour lookup reuses the border cache shared with frontlines, and readiness persists in campaign saves. Focused check: `npx vitest run src/ai-defense.test.ts`.


## Independent-country news and AI alliances

New reports require independent, active source and target nations. Conquest retires their existing crises from popups and escalation; old reports remain labelled historical in the archive. Historical crises cannot be reopened or funded. The news-frequency calculation ignores extinct governments.

AI nations consider AI alliance partners at most once every 25 ticks, using the current border cache. Both must be independent, peaceful toward each other, have at least +20 relations and a modest treasury reserve. Shared borders with compatible trade policies, common threats/enemies, or very strong relations with economic benefits make a partnership worthwhile. Active bilateral threats and alliances with the other side’s enemy block acceptance. Each nation maintains at most three alliances. Formation uses the existing alliance/access system, does not automatically join wars, and does not replace the player’s alliance decisions. Alliance checks run alongside development, so diplomacy does not consume an economic-development action. Focused check: `npx vitest run src/diplomatic-ai.test.ts`.


## Formations, stacking and personnel

Each formation has a maximum of **1,000 personnel**; current strength follows its remaining health. This is an abstract formation/crew strength for every unit type, not a claim about the crew of one real ship or vehicle. Up to **five** formations with the same nation, type and commander can share a stack. A stack draws one model and a combined troop badge. Clicking it selects its members; health, orders, combat, transport capacity and force-capacity slots remain per formation. Overflow and incompatible units seek nearby legal space; when no legal space exists movement waits instead of crossing water or neutral borders. Existing stacks retain a shared destination when moved together. Path indicators with the same stack and destination are deduplicated. Stack counts, selection, the Army panel and government view expose personnel statistics; foreign totals require intelligence, otherwise only observed forces are counted.

Collision handling uses local spatial buckets on simulation ticks. Stack membership and visibility are cached by tick. This reduces model draw calls where troops concentrate; individual formations still simulate, so it is not a universal frame-rate guarantee. Stack badges follow interpolated model positions and the final camera matrix, without repainting city geography.

## Government and historical formables

Click the top-left national flag (or a nation flag in Diplomacy) for **Government & formables**. The ideology tree begins with Non aligned and branches into Democracy, Liberalism, Nationalism, Fascism, Socialism and Communism. Every country begins with fictional democratic game settings, **70 stability and 25 political power**. These are gameplay defaults and balance modifiers rather than current real-world political classifications.

Changing ideology costs **100 political power and 10 stability**, with five game days between changes. Political power normally grows by one per day (Democracy +20%, Fascism −20%). Ideologies modify income, combat or factory throughput; the menu lists each benefit and drawback. Low stability reduces economic and combat effectiveness. AI nations with low stability can fund welfare when affordable, while keeping economic development running.

Every five ticks, civilian consumption that meets daily demand gives **+2 stability**; inadequate supply gives **−2**. Imports may support consumption as well as domestic production. Ongoing war gives **−3**, and a recent unresolved unrest event gives **−1** per day. Offensive declarations also cost **10 immediately**, except for Nationalism and Fascism. Civic policies in the flag government menu provide **Civil rights: +1/day** (25 PP to adopt, 5 credits/day) or **Public welfare: +2/day** (40 PP, 10 credits/day, +25% consumer demand). Unfunded policies provide no bonus. Stability is bounded to 0–100 and political power to 0–500; all values persist.

Initial formables are **German Reich** (Germany, Austria, Poland, France, the Netherlands, Belgium and Luxembourg), **Polish–Lithuanian Commonwealth / Rzeczpospolita** (Poland, Lithuania, Belarus, Ukraine and Latvia), and **Kalmar Union** (Denmark, Norway and Sweden). These deliberately use simplified whole modern-country requirements, not exact historical frontiers. Missing countries outside the active theatre prevent formation. All required states and cities must be controlled by the founder; alliances do not satisfy requirements. Proclaiming the formable consolidates the required governments, resources, remaining forces and training into the founder, updates its name and map label, and preserves the existing save and geographic IDs. Modern flags remain in use.

Historical reference context: [Austria's incorporation into Germany](https://encyclopedia.ushmm.org/content/en/article/nazi-territorial-aggression-the-anschluss), [Poland–Lithuania's territory](https://discovery.ucl.ac.uk/id/eprint/10183178/1/Butterwick%20-%20Pawlikowski_polandlithuania_in_the_age_of_atlantic_revolutions_dilemmas_of_liberty.pdf), and [the principal Kalmar kingdoms](https://historiska.se/en/explore-history/history-hub/queen-margaret-and-the-union-of-kalmar/).

AI offensive planning now includes ideology, military funding, stability, campaign reserves and a viable invasion route. Hostile relations require at least a 1.6× strength advantage; neutral opportunistic campaigns require 2.2× and a larger treasury. Good relations, alliances, insufficient forces, instability and inadequate funds block war. Existing economic and defensive priorities continue to apply.

Focused verification: `npx vitest run src/nations-units.test.ts src/ai-defense.test.ts src/diplomatic-ai.test.ts`; desktop interaction check: `npx playwright test tests/nations-units.spec.ts`. The production build remains manual.


## Movement stability around crowded formations

Collision detours for moving units must advance along their current route direction. Blocked units wait instead of stepping backwards or snapping into a stack behind them; forward sidesteps still pass obstacles where space permits. Compatible formations may approach or leave one another within the clearance radius so full five-formation stacks can move together. Overflow still waits outside the five-formation cap. Idle overlap repair retains adjacent-slot placement. AI troops already beside a crowded destination, within the same strategic state, hold that capture/combat position instead of re-requesting the crowded centre. Focused regression check: `npx vitest run src/movement-stability.test.ts`.

### Strategy and command update (local)

- Navigation separates Economy (production, trade, budget and stock markets), Government (stability, ideology, formables), News, Forces, and campaign objectives. Opening an inspector closes other inspectors. Shortage messages and shortage actions remain unchanged.
- Select a stack to inspect its individual formations, personnel, strength, organization, commander, supply and current order. Merged members remain selected and commanded together until manually split; after splitting, click a formation to select it separately. Stacks still contain up to five formations; each full formation represents 1,000 personnel.
- Right-click moves; Shift + right-click queues up to 16 waypoints per formation. **J** selects attack-move, **H** holds position, **X** stops, **Ctrl + 1–9** saves a control group and **1–9** recalls it. Fallback line uses two map clicks, spreads selected troops between the endpoints, and only returns fire. Select an HQ, barracks or dock to set a rally point for new recruits.
- Organization is separate from casualties. Combat reduces readiness; below 15% formations recover locally, with a short withdrawal only while under fire. Rest restores organization. At least 50% supply, treasury, steel, army supplies and population reserves are required for daily casualty replacements. The reinforcement pool is 1% of controlled population per campaign. Ground capture also requires 30% organization and does not progress while retreating. Combat damage is reduced for longer engagements.
- Supply uses a static strategic-state adjacency graph, recomputed once per five ticks or ownership/diplomacy change. Controlled capitals supply connected owned/allied states. Supply depots (180 credits / 20 army supplies, two material-funded days), barracks and ports relay supply; unblocked owned ports connect across the same navigable sea. Hostile frigates within eight map units blockade a port. Depots do not generate supply while isolated. Supply affects movement, combat and reinforcement. Political, Military, Supply and Resources map modes share existing geography and preserve fog of war.
- Peace proposals can retain states actually occupied in the current war, demand up to 100 credits/day for ten days, and demilitarize retained states during a 30-day truce. Unclaimed occupied states return to their previous controller. Demands require military leverage; white peace is always available. Existing capital/city capitulation still annexes a defeated government. Retained treaty states develop resistance; garrisons reduce it and resistance above 50 costs funds. These systems are gameplay abstractions.
- Deterministic AI personalities (builder, diplomat, expansionist, guardian) adjust war confidence and alliance priorities. Diplomats seek neighbouring embassies; exhausted AI–AI wars can end in white peace. Diplomacy explains relationship thresholds, personality and active truces.
- Choose economic power (10,000 treasury and infrastructure 8), regional dominance (60% theatre land), or historical unification as the campaign objective. Completion is recorded without ending play. Routine reports use a timed feed and readable archive; significant reports concerning the player use draggable alerts with Locate actions.
- Changes remain local. Validation: focused strategy/movement/defence checks and a desktop browser smoke test; production builds and wider campaign balancing are left to the developer.


### Persistent stacks, hotkeys and political paths

- Proximity merging now creates persistent membership. A merged stack shares one position, route and tactical order at the speed of its slowest formation. Casualties and organization remain per formation. Movement, retreat, commander assignment, boarding and formation inspection cannot implicitly split a stack. Transport space must fit the whole stack in one ship.
- **Split (V)** separates the selected merged stack into legal adjacent positions and stops it. If nearby ground is blocked, the action is rejected without losing membership. Split formations remain separate until explicitly merged again with **Merge (G)**. Caps remain five formations and 1,000 personnel per full formation. Membership and the separated state survive saves.
- **Menu → Settings & hotkeys** (default F10) lists command, navigation, map, construction and recruitment shortcuts. Click a binding and press a key; Delete/Backspace clears it. Conflicts and camera/control-group keys are protected. Changes update button badges and persist on this device; Restore defaults resets them. The simulation pauses while Settings is open and resumes its previous pause state when closed.
- Flag → Government shows a Non aligned root above Democracy → Liberalism, Nationalism → Fascism, and Socialism → Communism. This groups available gameplay paths visually; changing a path retains the existing 100 PP, 10 stability and five-day cooldown rules. Existing governments keep their adopted ideology.
- Stability and political power show signed daily rates. Green means positive, red negative, and neutral zero. Hover or focus a rate for one second to see the shared simulation calculation: consumer supply, war, unrest, funded civic policy, ideology modifiers and caps. Stability forecasts use current consumption progress; one-time PP purchases are separate from income. Tooltip targets remain stable across ticks.
- Proclaiming any formable makes every state in its required countries a core of the founder, clears their resistance, integrates cities under that country, and retains only the founder's capital. German Reich requirements are the seven whole-country gameplay requirements listed above. Historic geography IDs remain available for requirements and population accounting; core ownership persists separately. The combined territory behaves as one country after save/reload.
- Map-mode controls now share the dark monochrome panel styling and white active selection used elsewhere. No production build or publishing is performed for this update.

### AI war advances, personnel strength and political fragmentation

- A declared war grants land access, but AI attack decisions also check available ground strength, organization, health, supplies, treasury and stability. The previous war-readiness behaviour forced every general to Defend indefinitely. Ready, funded armies can now choose an offensive and cross the enemy border; weak or exhausted armies retain defensive positions. Existing neutral-border restrictions remain.
- Combat firepower scales linearly with current personnel. Two full formations and one half-strength formation (2,500 personnel) contribute 2.5 full formations of base attack and combined health. Doctrine, organization, supply, funding and commander modifiers still apply. Stacking does not add free damage or multiply defence modifiers.
- After unrest/demonstrations, **30 continuous game days (150 ticks) below 50% stability** can cause a country with multiple controlled states to fragment. Recovering to 50% cancels the timer. The original government retains its capital state; each other controlled state becomes an independent government with its local units, cities, infrastructure and a proportional share of treasury, supplies and stockpiles. New governments begin at peace, have closed neutral borders, and can develop their economies, trade and field armies.
- Government shows the breakup countdown. State governments, cores, economic allocations and borders survive saving and deployment. New territory colours and state labels use existing map fields/canvases rather than additional land meshes. Annexing the rump government does not silently annex its independent successor states. One-state governments do not fragment further.
- Validation remains focused: AI border crossing, personnel-proportional attack/health, recovery cancellation, resource conservation, successor government access/supply, save restoration and a browser deployment check. Production builds and publishing are left to the developer.

Manual movement now overrides automatic morale retreat while its route is active. Automatic retreats require recent combat and can use nearby controlled states instead of always travelling to a city/capital. AI war objectives include uncaptured strategic states as well as cities; deeply unstable armies can press an overwhelming advantage instead of stopping solely at the former 25% stability threshold. Russia uses a muted red political fill (#a46063). Large builds remain developer-run.

### Congested unit routes

Moving formations no longer receive unrestricted idle-overlap repositioning while following an order. Collision stalls measure progress toward the next waypoint. After four stalled ticks, a formation can ask the existing pathfinding worker for a route around nearby visible non-hostile units, preserving land ownership, alliances and war-access rules. These requests are limited to two per tick, with a ten-tick cooldown per formation. The traffic mask is temporary and does not change geographic navigation. An impossible detour preserves the original route/destination so the formation waits and resumes when the passage clears. Terrain checks, stack caps and collision spacing remain in force.

### Deposit placement, mine upgrades and technology

Extractors snap to the nearest unclaimed owned deposit within 2.5 map units; preview and final placement use the same coordinates. Other structures cannot cover deposit markers. Clearance uses the rendered 0.672-unit building base and the dock pier's actual directional footprint, instead of a wide symmetric exclusion square. A shoreline fallback checks the visible land polygons where coarse navigation cells include water, while preserving ownership restrictions.

Select a completed mine to upgrade it to levels 2 and 3. Upgrades cost 150/300 credits plus 5/10 steel, take 15/30 ticks, and add 50%/100% mineral extraction relative to level 1. Existing output continues during upgrades. The inspector and map show progress; upgrades persist in saves.

Technology (default shortcut Y, configurable in Settings) offers three levels in five branches: infantry (+8% attack/+5% defence per level), navy (+10% attack/+5% defence), research methods (+20% research speed), economy (+5% base national income and +8% extraction/factory speed), and politics (+10% political power and +0.5 stability/day). One project progresses per tick. Costs are 150 credits per target level and base durations are 50 ticks per target level. Switching branches preserves paid progress. Research, bonuses and completed levels persist. Power ratings and AI military assessments include combat technology.

City-label priority is selected in world coordinates and cached per zoom density, with zoom hysteresis. Camera pans no longer reshuffle label selection at screen-grid boundaries. Spatial buckets keep decluttering work local, and higher zoom densities reveal more labels.


Automatic morale recovery no longer selects cities or capitals as destinations. After fighting, exhausted troops stay where they are and restore organization. While under active fire they may withdraw at most three map units along a directly legal local route, then recover. They return fire during this withdrawal. Frontline assignments are retained and can resume after recovery; active manual movement still takes priority. Long automatic retreat routes from earlier saves are cancelled.
