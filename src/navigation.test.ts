import { describe, expect, it } from "vitest";
import {
  cellAt,
  cellPoint,
  createGrid,
  findPath,
  pointInPolygon,
} from "./navigation";
import type { ContinentData, Grid } from "./types";

function testGrid(width: number, height: number, walls: number[] = []): Grid {
  const walkable = new Uint8Array(width * height).fill(1);
  walls.forEach((i) => (walkable[i] = 0));
  return {
    width,
    height,
    cell: 1,
    x: 0,
    z: 0,
    owners: new Int16Array(width * height),
    walkable,
  };
}
describe("land navigation", () => {
  it("routes around water and never visits an unwalkable cell", () => {
    const grid = testGrid(7, 7, [3, 10, 17, 24, 31, 38]);
    const path = findPath(grid, grid.walkable, 0, 6);
    expect(path.length).toBeGreaterThan(12);
    expect(path.at(-1)).toEqual(cellPoint(grid, 6));
    for (const p of path) expect(grid.walkable[cellAt(grid, ...p)]).toBe(1);
  });
  it("does not cut a diagonal corner or connect isolated islands", () => {
    const grid = testGrid(3, 3, [1, 3]);
    expect(findPath(grid, grid.walkable, 0, 4)).toEqual([]);
    expect(findPath(grid, grid.walkable, -1, 4)).toEqual([]);
  });
  it("rasterizes country holes and separate lakes as blocked water", () => {
    const data: ContinentData = {
      id: "test",
      bounds: [0, 0, 20, 20],
      countries: [
        {
          id: "TST",
          name: "Test",
          bounds: [0, 0, 20, 20],
          polygons: [
            [
              [
                [0, 0],
                [20, 0],
                [20, 20],
                [0, 20],
              ],
              [
                [4, 4],
                [8, 4],
                [8, 8],
                [4, 8],
              ],
            ],
          ],
        },
      ],
      lakes: [
        [
          [
            [12, 12],
            [16, 12],
            [16, 16],
            [12, 16],
          ],
        ],
      ],
    };
    const grid = createGrid(data, 84);
    expect(grid.owners[cellAt(grid, 6, 6)]).toBe(-1);
    expect(grid.owners[cellAt(grid, 14, 14)]).toBe(-1);
    expect(grid.walkable[cellAt(grid, 10, 10)]).toBe(1);
    expect(cellAt(grid, -50, -50)).toBe(-1);
    expect(pointInPolygon(6, 6, data.countries[0].polygons[0])).toBe(false);
  });
});
