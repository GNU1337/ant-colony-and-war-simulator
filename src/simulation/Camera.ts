/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2D } from '../types';

export class Camera {
  position: Vector2D = { x: 0, y: 0 };
  zoom: number = 1.0;
  width: number = 0;
  height: number = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    // Start centered
    this.position = { x: 0, y: 0 };
  }

  screenToWorld(screenX: number, screenY: number): Vector2D {
    return {
      x: (screenX - this.width / 2) / this.zoom + this.position.x,
      y: (screenY - this.height / 2) / this.zoom + this.position.y
    };
  }

  applyTransform(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.position.x, -this.position.y);
  }
}
