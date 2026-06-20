/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Entity types available in the simulation.
 */
export enum EntityType {
  WORKER = 'WORKER',
  WARRIOR = 'WARRIOR',
  POISONER = 'POISONER',
  BERSERKER = 'BERSERKER', // Crimson Legion unique elite
  GUARDIAN = 'GUARDIAN', // Azure Swarm unique elite
  ACID_SPITTER = 'ACID_SPITTER', // Emerald Hive unique elite
  TITAN = 'TITAN', // Golden Monarchs unique elite
  SHADOW_STRIKER = 'SHADOW_STRIKER', // Obsidian Vanguard unique elite
  VOID_TUNNELER = 'VOID_TUNNELER', // Violet Void unique elite
  SHIELD_BEARER = 'SHIELD_BEARER', // Ivory Templars unique elite
  SAPPER = 'SAPPER', // Iron Forge unique elite
  BLOOD_PRIEST = 'BLOOD_PRIEST', // Sanguine Zealots unique elite
  QUEEN = 'QUEEN',
  BASE = 'BASE'
}

/**
 * Global Simulation Configurations
 * Centralized settings for fine-tuning the ant kingdom balance.
 */
export const SIM_CONFIG = {
  // World geometry settings
  WORLD_SIZE: 4000,
  TERRITORY_CELL_SIZE: 50,
  
  // Starting parameters
  INITIAL_RESOURCES: 1800,
  BASE_MAX_HEALTH: 5000, // Main base health points
  
  // Costs for producing new units
  WORKER_COST: 30,
  WARRIOR_COST: 45,
  POISONER_COST: 55,
  BERSERKER_COST: 80,
  GUARDIAN_COST: 100,
  ACID_SPITTER_COST: 90,
  TITAN_COST: 120,
  SHADOW_STRIKER_COST: 110,
  VOID_TUNNELER_COST: 105,
  SHIELD_BEARER_COST: 115,
  SAPPER_COST: 130,
  BLOOD_PRIEST_COST: 125,
  
  // Hunger and survival rates
  HUNGER_RATE: 0.1,
  DIE_HUNGER_THRESHOLD: 100,
  BASE_CONSUMPTION: 0.05, // Maintenance resource cost per second over time
  
  // Physics & Sensing fields
  COLLISION_RADIUS: 10,
  SCAN_RADIUS: 150,
  
  // Territory influence multipliers
  INFLUENCE_DECAY: 0.1,
  WARRIOR_INFLUENCE: 2.0,
  WORKER_INFLUENCE: 0.5,
  
  // Camera zoom thresholds
  CAMERA_MIN_ZOOM: 0.05,
  CAMERA_MAX_ZOOM: 5,
  
  // experience & Level scaling for Warrior Ants
  LEVEL_UP_THRESHOLDS: [2, 5, 10], // Kills required to level up to Lv 2, 3, and 4
  LEVEL_STAT_BONUS: 0.1,           // 10% stat boost (health, speed, dmg) per level
  
  // Balancing variables
  RESOURCE_REGEN_THRESHOLD: 40,    // Below this count, resources start regenerating
  RESOURCE_REGEN_CHANCE: 0.12,     // Chance per frame to spawn new food
  BASE_HEAL_RATE: 5,               // HP per second when resting at base
  HUNGER_HEAL_RATE: 10,            // Hunger reduction per second when resting
  SPAWN_CHANCE_WORKER: 0.12,       // Base spawn chance multipliers
  SPAWN_CHANCE_WARRIOR: 0.08,
  SPAWN_CHANCE_POISONER: 0.08,
  SPAWN_CHANCE_ELITE: 0.06,
  INCOME_BONUS_THRESHOLD: 1.3,     // income/expense ratio to trigger personality shift
  UPGRADE_SPEED_BONUS: 0.15,       // 15% speed boost per upgrade level
  UPGRADE_STRENGTH_BONUS: 0.20,    // 20% dmg boost per upgrade level
  UPGRADE_HEALTH_BONUS: 0.15,      // 15% HP boost per upgrade level
  UPGRADE_COORD_BONUS: 0.20,       // 20% scan range boost per upgrade level
};

/**
 * Combat & Movement statistics by unit type
 */
export const UNIT_STATS = {
  [EntityType.WORKER]: {
    speed: 120,
    health: 50,
    capacity: 10,
    damage: 2,
    color: '#ffffff'
  },
  [EntityType.WARRIOR]: {
    speed: 160,
    health: 108,
    capacity: 0,
    damage: 32.2,
    color: '#ff0000'
  },
  [EntityType.POISONER]: {
    speed: 110,
    health: 90,
    capacity: 0,
    damage: 11.5,
    color: '#a855f7'
  },
  [EntityType.BERSERKER]: {
    speed: 180,
    health: 126,
    capacity: 0,
    damage: 39.1,
    color: '#ef4444'
  },
  [EntityType.GUARDIAN]: {
    speed: 130,
    health: 234,
    capacity: 0,
    damage: 20.7,
    color: '#3b82f6'
  },
  [EntityType.ACID_SPITTER]: {
    speed: 140,
    health: 117,
    capacity: 0,
    damage: 25.3,
    color: '#10b981'
  },
  [EntityType.TITAN]: {
    speed: 145,
    health: 189,
    capacity: 0,
    damage: 48.3,
    color: '#facc15'
  },
  [EntityType.SHADOW_STRIKER]: {
    speed: 190,
    health: 80,
    capacity: 0,
    damage: 45,
    color: '#333333'
  },
  [EntityType.VOID_TUNNELER]: {
    speed: 150,
    health: 100,
    capacity: 0,
    damage: 30,
    color: '#8b5cf6'
  },
  [EntityType.SHIELD_BEARER]: {
    speed: 110,
    health: 300,
    capacity: 0,
    damage: 15,
    color: '#cbd5e1'
  },
  [EntityType.SAPPER]: {
    speed: 135,
    health: 110,
    capacity: 0,
    damage: 20,
    color: '#ea580c'
  },
  [EntityType.BLOOD_PRIEST]: {
    speed: 130,
    health: 140,
    capacity: 0,
    damage: 28,
    color: '#991b1b'
  },
  [EntityType.QUEEN]: {
    speed: 0,
    health: 500,
    capacity: 0,
    damage: 10,
    color: '#ff00ff'
  },
  [EntityType.BASE]: { // Fallback profile
    speed: 0,
    health: 1000,
    capacity: 0,
    damage: 0,
    color: '#000000'
  }
};
