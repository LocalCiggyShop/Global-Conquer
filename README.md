# Global Conquer

Beta · v0.1.0

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

**Global trade** offers a shared world market within each continent campaign, plus direct trade with other active peaceful nations. Import/export 1–500 units per order, once or every five days; inventories and credits transfer on the next game tick. Warehouse stocks affect prices, which include a spread; allies receive a smaller spread. Bulk quotes average the prices before and after the order, preventing immediate buy/sell price pumping. Direct trades require actual stock and buyer funds, and stop during war. The world market represents outside trade with bounded stock replenishment, without loading or simulating inactive continents. Campaign markets are independent; no multiplayer or physical trade ships are required.

AI nations build a limited civilian factory network, import missing inputs while preserving treasury reserves, and export surplus stocks. Civilian production runs once per simulation second; AI market decisions run every 15 seconds. UI inventory updates run only while the window is open. Existing saves retain inventories, recipe/progress, paused lines, recent player trades, and market stocks. Capitulation transfers factories with their territory and national stockpiles to the victor.

Unit models now use 50% of their previous scale; building models use 0.32 rather than 0.42 (about 24% smaller). City models retain their size. Small units have a 12-pixel selection tolerance, while movement, combat, and diplomatic access retain their prior rules.

## Shared game clock and recurring orders

**One real second = one game tick. Five ticks = one day.** The resource bar shows the current day, the active tick (1–5), and a progress bar through that day. Pausing, opening a pausing dialog, returning to overview, or switching away from the tab stops game time. Saves preserve the unfinished tick, calendar position, and pending commands. The browser renders smoothly between authoritative unit positions; movement, combat, recruitment, economy, occupation, intelligence, and AI update only on full ticks. Existing per-second rates retain the same real-time meaning, applied once per tick. Combat carries weapon cooldowns across ticks to retain their average firing rate.

Construction, recruitment, one-off trades, factory settings, diplomacy, intelligence and embark/disembark actions queue for the next tick. Orders can be planned while paused; resume to execute them. Costs and legality are checked again on execution, and unsuccessful commands report an error. Saved commands use data records, so a reload preserves pending work.

In **Industry & trade → Global trade**, choose **Once · next tick** or **Every 5 days**. Recurring imports and exports first run 25 ticks after scheduling, then every 25 ticks. Each delivery uses current prices, stock, diplomatic relations, warehouse capacity, and available credits. Orders reserve no funds or goods. Missing stock, insufficient funds, full warehouses, or war skip that delivery; the order tries again at its next five-day interval. The order list shows the next due day/tick and the last result. Pause/resume or cancel any recurring order; resuming starts a fresh five-day interval. Pending trades and recurring settlement results are saved after their complete simulation tick, preventing partial tick saves or duplicate deliveries on reload. No inactive-continent or offline catch-up simulation is introduced.
