/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EntityType, SIM_CONFIG, UNIT_STATS } from './config';

export { EntityType, SIM_CONFIG, UNIT_STATS };

export interface Vector2D {
  x: number;
  y: number;
}

export interface FactionPersonality {
  aggressiveness: number;
  expansionism: number;
  defenseFocus: number;
  resourcePrioritization: number; 
  fertility: number; // Hur snabbt de vill producera nya enheter
}

export interface FactionAttackPlan {
  targetFactionId: string;
  rallyPoint: Vector2D;
  stage: 'RALLYING' | 'ATTACKING';
  lastSpawnTime: number;
}

export interface FactionUpgrades {
  speed: number;
  strength: number;
  coordination: number;
}

export type FactionStrategy = 
  // Crimson Legion
  | 'BLOOD_RUSH' | 'SCORCHED_EARTH' | 'SIEGE_VANGUARD'
  // Azure Swarm
  | 'RECURSIVE_SPAWNING' | 'COLLECTIVE_MIND' | 'DEEP_FORAGING'
  // Emerald Hive
  | 'TOXIC_SPORES' | 'ROOTED_DEFENSE' | 'MIMICRY'
  // Golden Monarchs
  | 'GILDED_ARMOR' | 'MERCENARY_CONTRACT' | 'ROYAL_PRESENCE'
  // Obsidian Vanguard
  | 'SHADOW_VEIL' | 'NIGHT_TERROR' | 'ECLIPSE_ASSAULT'
  // Violet Void
  | 'VOID_STEP' | 'DIMENSIONAL_SPIKE' | 'SINGULARITY_REACH'
  // Ivory Templars
  | 'PHALANX_WALL' | 'DIVINE_INTERVENTION' | 'HALLOWED_GROUND'
  // Iron Forge
  | 'DEMOLITION_FOCUS' | 'REINFORCED_PLATING' | 'ENGINEER_SURGE'
  // Sanguine Zealots
  | 'LIFE_DRAIN' | 'VAMPIRIC_FRENZY' | 'BLOOD_RITUAL';

export interface Faction {
  id: string;
  name: string;
  color: string;
  resources: number;
  basePosition: Vector2D;
  borderPoints: Vector2D[];
  personality: FactionPersonality;
  activeStrategy: FactionStrategy;
  territoryCount: number;
  isDead: boolean;
  age: number;
  health: number;
  maxHealth: number;
  attackPlan?: FactionAttackPlan;
  upgrades: FactionUpgrades;
  stats: {
    warriorsProduced: number;
    warriorsLost: number;
    workersProduced: number;
    workersLost: number;
    poisonersProduced: number;
    poisonersLost: number;
    elitesProduced: number;
    elitesLost: number;
    totalIncome: number;
    totalExpense: number;
    kills: number;
  };
}

export interface EntityState {
  id: string;
  factionId: string;
  type: EntityType;
  position: Vector2D;
  velocity: Vector2D;
  health: number;
  maxHealth: number;
  hunger: number;
  rotation: number;
  load: number; // Hur mycket mat den bär
  state: 'FORAGING' | 'GATHERING' | 'RETURNING' | 'ATTACKING' | 'RESTING';
  targetId?: string;
  escortId?: string; // For workers: ID of the warrior escorting them
  workerId?: string; // For warriors: ID of the worker they are escorting
  birthTime: number;
  kills: number;
  harvests: number;
  level: number;
  poisonDurationRemaining?: number;
  poisonDamagePerSecond?: number;
  poisonSourceFactionId?: string;
  acidDurationRemaining?: number;
  acidDamagePerSecond?: number;
  acidSourceFactionId?: string;
  stunDurationRemaining?: number;
  shieldBuffRemaining?: number;
}


export interface ResourceNode {
  id: string;
  position: Vector2D;
  amount: number;
  maxAmount: number;
  type: 'FOOD';
  description?: string;
}

export interface WorldEvent {
  id: string;
  sourceFactionName: string;
  sourceFactionColor: string;
  targetFactionName: string;
  targetFactionColor: string;
  type: 'RALLYING' | 'ATTACKING' | 'ELIMINATED';
  timestamp: number;
  age: number;
  message: string;
}

