/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2D } from '../types';

/**
 * SpatialGrid hjälper oss att snabbt hitta enheter nära en viss position.
 * Istället för O(n^2) får vi nästan O(1) vid sökning.
 */
export class SpatialGrid<T extends { position: Vector2D; id: string }> {
  private grid: Map<string, T[]> = new Map();
  private cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private getKey(pos: Vector2D): string {
    const gx = Math.floor(pos.x / this.cellSize);
    const gy = Math.floor(pos.y / this.cellSize);
    return `${gx},${gy}`;
  }

  clear() {
    this.grid.clear();
  }

  insert(entity: T) {
    const key = this.getKey(entity.position);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(entity);
  }

  getNearby(pos: Vector2D, radius: number): T[] {
    const results: T[] = [];
    const minX = Math.floor((pos.x - radius) / this.cellSize);
    const maxX = Math.floor((pos.x + radius) / this.cellSize);
    const minY = Math.floor((pos.y - radius) / this.cellSize);
    const maxY = Math.floor((pos.y + radius) / this.cellSize);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const cell = this.grid.get(`${x},${y}`);
        if (cell) {
          results.push(...cell);
        }
      }
    }
    return results;
  }
}
