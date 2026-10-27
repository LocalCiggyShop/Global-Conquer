export class SpatialIndex<T extends { x: number; z: number }> {
  private cells = new Map<string, T[]>();
  constructor(readonly size = 12) {}
  rebuild(items: Iterable<T>) {
    this.cells.clear();
    for (const item of items) {
      const k =
        Math.floor(item.x / this.size) + "," + Math.floor(item.z / this.size);
      const cell = this.cells.get(k) ?? [];
      cell.push(item);
      this.cells.set(k, cell);
    }
  }
  *near(x: number, z: number, radius: number): Iterable<T> {
    for (
      let row = Math.floor((z - radius) / this.size);
      row <= Math.floor((z + radius) / this.size);
      row++
    )
      for (
        let col = Math.floor((x - radius) / this.size);
        col <= Math.floor((x + radius) / this.size);
        col++
      )
        yield* this.cells.get(col + "," + row) ?? [];
  }
}
