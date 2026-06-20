/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2D } from '../types';

export class Vector {
  static add(v1: Vector2D, v2: Vector2D): Vector2D {
    return { x: v1.x + v2.x, y: v1.y + v2.y };
  }

  static sub(v1: Vector2D, v2: Vector2D): Vector2D {
    return { x: v1.x - v2.x, y: v1.y - v2.y };
  }

  static mul(v: Vector2D, scalar: number): Vector2D {
    return { x: v.x * scalar, y: v.y * scalar };
  }

  static div(v: Vector2D, scalar: number): Vector2D {
    return { x: v.x / scalar, y: v.y / scalar };
  }

  static mag(v: Vector2D): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  static normalize(v: Vector2D): Vector2D {
    const m = this.mag(v);
    if (m === 0) return { x: 0, y: 0 };
    return this.div(v, m);
  }

  static dist(v1: Vector2D, v2: Vector2D): number {
    return this.mag(this.sub(v1, v2));
  }

  static lerp(v1: Vector2D, v2: Vector2D, t: number): Vector2D {
    return this.add(v1, this.mul(this.sub(v2, v1), t));
  }
}
