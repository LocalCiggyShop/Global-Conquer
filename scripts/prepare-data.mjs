import {gzipSync} from "node:zlib";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  geoArea,
  geoAzimuthalEqualArea,
  geoCentroid,
  geoDistance,
  geoStream,
} from "d3-geo";
import sharp from "sharp";

const sources = {
  countries:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
  overview:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
  lakes:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson",
  earth:
    "https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74218/world.200412.3x5400x2700.jpg",
  places: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson",
  ports: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_ports.geojson",
  cities:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_populated_places_simple.geojson",
};
await mkdir(".cache", { recursive: true });
await mkdir("public/data", { recursive: true });
await mkdir("public/textures", { recursive: true });
await mkdir("public/maps", { recursive: true });
const manifest = {};
for (const [key, url] of Object.entries(sources)) {
  const path = `.cache/${key === "earth" ? "earth.jpg" : key + ".geojson"}`;
  try {
    await access(path);
  } catch {
    console.log(`Downloading ${key}…`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
  }
  manifest[key] = {
    url,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  };
}

const load = async (name) =>
  JSON.parse(await readFile(`.cache/${name}.geojson`, "utf8")).features;
const countries = await load("countries");
const lakes = await load("lakes");
const overview = await load("overview");
const cities = await load("cities");
const places = await load("places");
const ports = await load("ports");
const regionsOnly=process.argv.includes("--regions-only");
const settings = [
 ["europe","Europe",[18,53]],
 ["asia-pacific","Asia & Oceania",[115,10]],
 ["africa","Africa",[20,2]],
 ["americas","Americas",[-85,10]],
];
const round = (n) => Math.round(n * 10000) / 10000;
function orient(feature) {
  const result = structuredClone(feature);
  const polygons =
    result.geometry.type === "Polygon"
      ? [result.geometry.coordinates]
      : result.geometry.coordinates;
  for (const polygon of polygons) {
    if (geoArea({ type: "Polygon", coordinates: polygon }) > 2 * Math.PI)
      polygon.forEach((r) => r.reverse());
  }
  return result;
}

// Split Russia at 60°E for this prototype; both halves retain the same nation ID.
// This is a gameplay theatre boundary, not a political border.
function clipRussia(feature, east) {
  if (feature.properties.ADM0_A3 !== "RUS") return structuredClone(feature);
  const geometry = feature.geometry;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const result = [];
  for (const poly of polygons) {
    const clipped = [];
    for (const input of poly) {
      const ring = input
        .slice(0, -1)
        .map((p) => [east && p[0] < -150 ? p[0] + 360 : p[0], p[1]]);
      const output = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j],
          b = ring[i],
          ai = east ? a[0] >= 60 : a[0] <= 60,
          bi = east ? b[0] >= 60 : b[0] <= 60;
        if (ai !== bi)
          output.push([
            60,
            a[1] + ((b[1] - a[1]) * (60 - a[0])) / (b[0] - a[0]),
          ]);
        if (bi) output.push(b);
      }
      if (output.length >= 3) {
        output.push(output[0]);
        clipped.push(output);
      }
    }
    if (clipped.length) result.push(clipped);
  }
  return {
    type: "Feature",
    properties: feature.properties,
    geometry: { type: "MultiPolygon", coordinates: result },
  };
}

function contains(ring, p) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
const area = (ring) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2,
  );

function project(feature, projection) {
  const rings = [];
  let current = [];
  geoStream(
    orient(feature),
    projection.stream({
      polygonStart() {},
      polygonEnd() {},
      lineStart() {
        current = [];
      },
      lineEnd() {
        if (current.length >= 3 && area(current) > 0.0001) rings.push(current);
      },
      point(x, y) {
        current.push([round(x), round(y)]);
      },
      sphere() {},
    }),
  );
  rings.sort((a, b) => area(b) - area(a));
  const polygons = [];
  for (const ring of rings) {
    const parent = polygons.find((p) => contains(p[0], ring[0]));
    if (parent) parent.push(ring);
    else polygons.push([ring]);
  }
  return polygons;
}

const portNation=new Map();
for(const port of ports){
 const p=port.geometry.coordinates;
 const inside=countries.find((c)=>{const polys=c.geometry.type==="Polygon"?[c.geometry.coordinates]:c.geometry.coordinates;return polys.some((poly)=>contains(poly[0],p)&&!poly.slice(1).some((r)=>contains(r,p)));});
 if(inside){portNation.set(port.properties.ne_id,inside.properties.ADM0_A3);continue;}
 const c=Math.cos(p[1]*Math.PI/180);let nearest=null,best=Infinity;
 for(const city of places){let dx=Math.abs(city.geometry.coordinates[0]-p[0]);dx=Math.min(dx,360-dx);const dz=city.geometry.coordinates[1]-p[1],distance=dx*dx*c*c+dz*dz;if(distance<best){best=distance;nearest=city;}}
 if(nearest)portNation.set(port.properties.ne_id,nearest.properties.adm0_a3);
}
const counts = regionsOnly?JSON.parse(await readFile("public/data/overview.json","utf8")).counts:{};
for(const old of ["north-america","south-america","oceania","antarctica","asia"])delete counts[old];
for (const [id, continent, center] of settings) {
  if(regionsOnly&&id!=="asia-pacific"&&id!=="americas")continue;
  const selected = [];
  for (const feature of countries) {
    if (feature.properties.ADM0_A3 === "RUS") {
      if (id === "europe" || id === "asia-pacific")
        selected.push(clipRussia(feature, id === "asia-pacific"));
      continue;
    }
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    const selectedPolygons = polygons.filter((coordinates) => {
      let theatre = feature.properties.CONTINENT;
      const p = geoCentroid(
        orient({
          type: "Feature",
          geometry: { type: "Polygon", coordinates },
          properties: {},
        }),
      );
      if (theatre === "Europe" && (p[1] < 32 || p[0] < -30 || p[0] > 65)) {
        if (p[0] < -100 || p[0] > 90) theatre = "Oceania";
        else if (p[0] < -30)
          theatre = p[1] > 12 ? "North America" : "South America";
        else theatre = "Africa";
      }
      return theatre === continent || (id==="americas"&&["North America","South America"].includes(theatre)) || (id==="asia-pacific"&&["Asia","Oceania"].includes(theatre));
    });
    if (selectedPolygons.length)
      selected.push({
        type: "Feature",
        properties: feature.properties,
        geometry: { type: "MultiPolygon", coordinates: selectedPolygons },
      });
  }
  const features = selected.map(orient);
  const projection = geoAzimuthalEqualArea()
    .rotate([-center[0], -center[1]])
    .precision(0.15)
    .fitExtent(
      [
        [-130, -90],
        [130, 90],
      ],
      { type: "FeatureCollection", features },
    );
  const prepared = selected
    .map((f) => {
      const polygons = project(f, projection);
      const points = polygons.flat(2);
      return {
        id: f.properties.ADM0_A3,
        name: f.properties.ADMIN,
        flagCode: (f.properties.ISO_A2_EH || f.properties.ISO_A2 || "").toLowerCase(),
        population: Math.max(0, f.properties.POP_EST ?? 0),
        populationYear: f.properties.POP_YEAR,
        polygons,
        bounds: [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      };
    })
    .filter((c) => c.polygons.length)
    .sort((a, b) => a.name.localeCompare(b.name));
  const bounds = [
    Math.min(...prepared.map((c) => c.bounds[0])),
    Math.min(...prepared.map((c) => c.bounds[1])),
    Math.max(...prepared.map((c) => c.bounds[2])),
    Math.max(...prepared.map((c) => c.bounds[3])),
  ];
  const lakePolygons = lakes
    .filter((l) => geoDistance(center, geoCentroid(orient(l))) < Math.PI / 2.1)
    .flatMap((l) => project(l, projection))
    .filter((p) =>
      p[0].some(
        (v) =>
          v[0] >= bounds[0] &&
          v[0] <= bounds[2] &&
          v[1] >= bounds[1] &&
          v[1] <= bounds[3],
      ),
    );
  const prepareCity = (f) => {
    const nation = f.properties.adm0_a3,
      country = prepared.find((c) => c.id === nation);
    if (!country || geoDistance(center, f.geometry.coordinates) > Math.PI / 2)
      return [];
    const p = projection(f.geometry.coordinates);
    if (
      !country.polygons.some(
        (poly) =>
          contains(poly[0], p) && !poly.slice(1).some((r) => contains(r, p)),
      )
    )
      return [];
    return [
      {
        name: f.properties.name,
        nation,
        x: round(p[0]),
        z: round(p[1]),
        population: f.properties.pop_max ?? 0,
        capital: !!f.properties.adm0cap,
      },
    ];
  };
  const citySites = cities.flatMap(prepareCity);
  const detailedPlaces = places.flatMap(prepareCity);
  const distanceToRing = (ring,p) => {
    let best=Infinity;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[j],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
      const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
      best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));
    }
    return best;
  };
  const portSites = ports.flatMap((f) => {
    if(geoDistance(center,f.geometry.coordinates)>Math.PI/2)return [];
    const p=projection(f.geometry.coordinates);
    let country=null,best=1.5;
    for(const c of prepared) {
      if(c.id!==portNation.get(f.properties.ne_id))continue;
      const b=c.bounds;if(p[0]<b[0]-1.5||p[0]>b[2]+1.5||p[1]<b[1]-1.5||p[1]>b[3]+1.5)continue;
      if(c.polygons.some((poly)=>contains(poly[0],p)&&!poly.slice(1).some((r)=>contains(r,p)))){country=c;break;}
      for(const poly of c.polygons){const d=distanceToRing(poly[0],p);if(d<best){best=d;country=c;}}
    }
    if(!country)return [];
    const nearby=detailedPlaces.filter((c)=>c.nation===country.id).sort((a,b)=>Math.hypot(a.x-p[0],a.z-p[1])-Math.hypot(b.x-p[0],b.z-p[1]))[0];
    return [{id:String(f.properties.ne_id),name:f.properties.name,nation:country.id,city:nearby?.name??f.properties.name,x:round(p[0]),z:round(p[1])}];
  });
  const data = {
    kmPerUnit:6371/projection.scale(),
    id,
    places: detailedPlaces,
    ports: portSites,
    countries: prepared,
    lakes: lakePolygons,
    bounds,
    cities: citySites,
  };
  const json=JSON.stringify(data);
  await writeFile(`public/data/${id}.json`,json);
  await writeFile(`public/data/${id}.json.gz`,gzipSync(json,{level:9}));
  const paths = prepared.flatMap((c) =>
    c.polygons
      .filter((p) => area(p[0]) > 0.15)
      .map((p) =>
        p
          .map((r) => {
            const simple = r.filter(
              (v, i) =>
                !i ||
                Math.hypot(v[0] - r[i - 1][0], v[1] - r[i - 1][1]) > 0.5 ||
                i % 12 === 0,
            );
            return `M${simple.map((v) => v.map((n) => n.toFixed(1)).join(",")).join("L")}Z`;
          })
          .join(""),
      ),
  );
  await writeFile(
    `public/maps/${id}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-140 -100 280 200"><g fill="#b9c9bd" fill-rule="evenodd">${paths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`,
  );
  counts[id] = prepared.length;
  console.log(
    `${continent}: ${prepared.length} countries, ${lakePolygons.length} lakes`,
  );
}
await writeFile(
  "public/data/overview.json",
  JSON.stringify({
    countries: overview.map((f) => ({
      id: f.properties.ADM0_A3,
      continent: f.properties.CONTINENT,
      coordinates:
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates,
    })),
    counts,
  }),
);
if(!regionsOnly){
await sharp(".cache/earth.jpg")
  .resize(4096, 2048)
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile("public/textures/earth.jpg");
await writeFile(
  "public/data/sources.json",
  JSON.stringify(
    { generated: new Date().toISOString(), sources: manifest },
    null,
    2,
  ),
);
console.log("Map packages and 4K Earth texture ready.");

await import("./prepare-flags.mjs");

}
