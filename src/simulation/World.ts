/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EntityState, EntityType, Faction, FactionPersonality, ResourceNode, SIM_CONFIG, UNIT_STATS, Vector2D, WorldEvent } from '../types';
import { SpatialGrid } from './SpatialGrid';
import { Vector } from './Vector';

export function getUpgradeCost(level: number): number {
  if (level === 0) return 150;
  if (level === 1) return 300;
  if (level === 2) return 500;
  return Infinity; // max level is 3
}

export class World {
  factions: Faction[] = [];
  entities: EntityState[] = [];
  resources: ResourceNode[] = [];
  events: WorldEvent[] = [];
  grid: SpatialGrid<EntityState>;
  influenceGrid: { factionId: string | null; strength: number }[] = [];
  gridDim: number;

  addEvent(sourceFaction: Faction, targetFaction: Faction, type: 'RALLYING' | 'ATTACKING' | 'ELIMINATED', message: string) {
    const id = `${sourceFaction.id}-${targetFaction.id}-${type}-${Date.now()}-${Math.random()}`;
    const newEvent: WorldEvent = {
      id,
      sourceFactionName: sourceFaction.name,
      sourceFactionColor: sourceFaction.color,
      targetFactionName: targetFaction.name,
      targetFactionColor: targetFaction.color,
      type,
      timestamp: Date.now(),
      age: sourceFaction.age,
      message
    };
    this.events.push(newEvent);
    if (this.events.length > 40) {
      this.events.shift();
    }
  }

  constructor(savedState?: any) {
    this.grid = new SpatialGrid(SIM_CONFIG.COLLISION_RADIUS * 4);
    this.gridDim = SIM_CONFIG.WORLD_SIZE / SIM_CONFIG.TERRITORY_CELL_SIZE;
    this.influenceGrid = Array.from({ length: this.gridDim * this.gridDim }, () => ({ factionId: null, strength: 0 }));
    
    if (savedState && Array.isArray(savedState.factions) && savedState.factions.length > 0) {
      // Validate factions and ensure critical properties like basePosition exist
      const factionsValid = savedState.factions.every((f: any) => f && f.basePosition && typeof f.basePosition.x === 'number');
      
      if (factionsValid) {
        this.factions = savedState.factions.map((f: any) => ({
          ...f,
          activeStrategy: f.activeStrategy || this.getDefaultStrategyForFaction(f.name),
          health: f.health ?? SIM_CONFIG.BASE_MAX_HEALTH,
          maxHealth: f.maxHealth ?? SIM_CONFIG.BASE_MAX_HEALTH,
          upgrades: f.upgrades || { speed: 0, strength: 0, coordination: 0 },
          stats: f.stats || {
            warriorsProduced: 0,
            warriorsLost: 0,
            workersProduced: 0,
            workersLost: 0,
            totalIncome: 0,
            totalExpense: 0,
            kills: 0
          }
        }));
        this.entities = (savedState.entities || []).filter((e: any) => 
          e && e.position && typeof e.position.x === 'number' && typeof e.position.y === 'number'
        );
        this.resources = (savedState.resources || []).filter((r: any) => 
          r && r.position && typeof r.position.x === 'number' && typeof r.position.y === 'number'
        );
        this.influenceGrid = savedState.influenceGrid || this.influenceGrid;
      } else {
        console.warn('Incompatible save data detected. Falling back to default initialization.');
        this.initDemoFactions();
        this.initResources();
      }
    } else {
      this.initDemoFactions();
      this.initResources();
    }
  }

  private getDefaultStrategyForFaction(name: string): any {
    if (name === 'Crimson Legion') return 'BLOOD_RUSH';
    if (name === 'Azure Swarm') return 'RECURSIVE_SPAWNING';
    if (name === 'Emerald Hive') return 'TOXIC_SPORES';
    if (name === 'Golden Monarchs') return 'GILDED_ARMOR';
    if (name === 'Obsidian Vanguard') return 'SHADOW_VEIL';
    if (name === 'Violet Void') return 'VOID_STEP';
    if (name === 'Ivory Templars') return 'PHALANX_WALL';
    if (name === 'Iron Forge') return 'DEMOLITION_FOCUS';
    if (name === 'Sanguine Zealots') return 'LIFE_DRAIN';
    return 'BLOOD_RUSH';
  }

  private isEntityVisible(observer: EntityState, target: EntityState): boolean {
    if (!observer || !target) return false;
    if (observer.factionId === target.factionId) return true;
    
    // If target is a base/faction (unlikely from grid, but for safety in other calls)
    const targetFactionId = target.factionId || (target as any).id;
    if (!targetFactionId) return true;

    const targetFaction = this.factions.find(f => f.id === targetFactionId);
    if (!targetFaction) return true;

    // Strategies and Units that alter visibility
    const dist = Vector.dist(observer.position, target.position);
    
    // Shadow Striker and Shadow Veil: Harder to see
    if (target.type === EntityType.SHADOW_STRIKER || targetFaction.activeStrategy === 'SHADOW_VEIL') {
      if (dist > 80) return false;
    }

    // Mimicry: Harder to see from far away
    if (targetFaction.activeStrategy === 'MIMICRY' && dist > 120) {
      return false;
    }

    return true;
  }

  serialize() {
    return {
      factions: this.factions,
      entities: this.entities,
      resources: this.resources,
      influenceGrid: this.influenceGrid
    };
  }

  private initDemoFactions() {
    const names = [
      { name: 'Crimson Legion', color: '#ef4444', strategies: ['BLOOD_RUSH', 'SCORCHED_EARTH', 'SIEGE_VANGUARD'] },
      { name: 'Azure Swarm', color: '#3b82f6', strategies: ['RECURSIVE_SPAWNING', 'COLLECTIVE_MIND', 'DEEP_FORAGING'] },
      { name: 'Emerald Hive', color: '#10b981', strategies: ['TOXIC_SPORES', 'ROOTED_DEFENSE', 'MIMICRY'] },
      { name: 'Golden Monarchs', color: '#facc15', strategies: ['GILDED_ARMOR', 'MERCENARY_CONTRACT', 'ROYAL_PRESENCE'] },
      { name: 'Obsidian Vanguard', color: '#333333', strategies: ['SHADOW_VEIL', 'NIGHT_TERROR', 'ECLIPSE_ASSAULT'] },
      { name: 'Violet Void', color: '#7c3aed', strategies: ['VOID_STEP', 'DIMENSIONAL_SPIKE', 'SINGULARITY_REACH'] },
      { name: 'Ivory Templars', color: '#cbd5e1', strategies: ['PHALANX_WALL', 'DIVINE_INTERVENTION', 'HALLOWED_GROUND'] },
      { name: 'Iron Forge', color: '#ea580c', strategies: ['DEMOLITION_FOCUS', 'REINFORCED_PLATING', 'ENGINEER_SURGE'] },
      { name: 'Sanguine Zealots', color: '#991b1b', strategies: ['LIFE_DRAIN', 'VAMPIRIC_FRENZY', 'BLOOD_RITUAL'] }
    ];

    const spawnPoints = [
      { x: -1400, y: -1400 },
      { x: 1400, y: 1400 },
      { x: 1400, y: -1400 },
      { x: -1400, y: 1400 },
      { x: 0, y: 0 },
      { x: 0, y: -1400 },
      { x: 0, y: 1400 },
      { x: -1400, y: 0 },
      { x: 1400, y: 0 }
    ];

    this.factions = names.map((f, i) => ({
      id: `faction-${i}`,
      name: f.name,
      color: f.color,
      resources: SIM_CONFIG.INITIAL_RESOURCES,
      basePosition: spawnPoints[i],
      borderPoints: this.generateBorder(spawnPoints[i], 150),
      activeStrategy: f.strategies[Math.floor(Math.random() * f.strategies.length)] as any,
      territoryCount: 0,
      isDead: false,
      age: 0,
      health: SIM_CONFIG.BASE_MAX_HEALTH,
      maxHealth: SIM_CONFIG.BASE_MAX_HEALTH,
      upgrades: {
        speed: 0,
        strength: 0,
        coordination: 0
      },
      stats: {
        warriorsProduced: 0,
        warriorsLost: 0,
        workersProduced: 0,
        workersLost: 0,
        poisonersProduced: 0,
        poisonersLost: 0,
        elitesProduced: 0,
        elitesLost: 0,
        totalIncome: 0,
        totalExpense: 0,
        kills: 0
      },
      personality: {
        aggressiveness: i === 0 ? 0.9 : Math.random(),
        expansionism: i === 1 ? 0.9 : Math.random(),
        defenseFocus: i === 2 ? 0.9 : Math.random(),
        resourcePrioritization: i === 3 ? 0.9 : Math.random(),
        fertility: 0.5 + Math.random() * 0.5
      }
    }));

    // Spawn initial workers and Queen
    this.factions.forEach((f) => {
      this.spawnEntity(f.id, EntityType.QUEEN, f.basePosition);
      for (let j = 0; j < 8; j++) {
        this.spawnEntity(f.id, EntityType.WORKER, f.basePosition);
      }
    });
  }

  spawnEntity(factionId: string, type: EntityType, pos: Vector2D) {
    const stats = UNIT_STATS[type as keyof typeof UNIT_STATS];
    if (!stats) return;

    const faction = this.factions.find(f => f.id === factionId);
    if (faction) {
      if (type === EntityType.WORKER) faction.stats.workersProduced++;
      if (type === EntityType.WARRIOR) faction.stats.warriorsProduced++;
      if (type === EntityType.POISONER) faction.stats.poisonersProduced++;
      if (type === EntityType.BERSERKER || type === EntityType.GUARDIAN || type === EntityType.ACID_SPITTER || 
          type === EntityType.TITAN || type === EntityType.SHADOW_STRIKER || type === EntityType.VOID_TUNNELER ||
          type === EntityType.SHIELD_BEARER || type === EntityType.SAPPER || type === EntityType.BLOOD_PRIEST) {
        faction.stats.elitesProduced++;
      }
    }

    let maxHealth = stats.health;
    if (faction?.activeStrategy === 'BLOOD_RUSH') maxHealth *= 0.75;
    if (faction?.activeStrategy === 'GILDED_ARMOR') maxHealth *= 2.0;

    this.entities.push({
      id: Math.random().toString(36).substr(2, 9),
      factionId,
      type,
      position: { ...pos },
      velocity: { x: (Math.random() - 0.5) * 50, y: (Math.random() - 0.5) * 50 },
      health: maxHealth,
      maxHealth: maxHealth,
      hunger: 0,
      rotation: Math.random() * Math.PI * 2,
      load: 0,
      state: 'FORAGING',
      birthTime: faction?.age || 0,
      kills: 0,
      harvests: 0,
      level: 1
    });
  }

  private checkLevelUp(ant: EntityState) {
    if (
      ant.type !== EntityType.WARRIOR &&
      ant.type !== EntityType.POISONER &&
      ant.type !== EntityType.BERSERKER &&
      ant.type !== EntityType.GUARDIAN &&
      ant.type !== EntityType.ACID_SPITTER &&
      ant.type !== EntityType.TITAN
    ) return;
    
    const nextThresh = SIM_CONFIG.LEVEL_UP_THRESHOLDS[ant.level - 1];
    if (nextThresh && ant.kills >= nextThresh) {
      ant.level++;
      // Apply stat bonuses (health increases current and max)
      const bonus = 1 + SIM_CONFIG.LEVEL_STAT_BONUS;
      ant.maxHealth *= bonus;
      ant.health = Math.min(ant.maxHealth, ant.health * bonus);
      // Note: speed and damage bonuses are applied during behavior updates using ant.level
    }
  }

  private generateBorder(center: Vector2D, radius: number): Vector2D[] {
    const points: Vector2D[] = [];
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push({
        x: center.x + Math.cos(angle) * (radius + Math.random() * 20),
        y: center.y + Math.sin(angle) * (radius + Math.random() * 20)
      });
    }
    return points;
  }

  private initResources() {
    const descriptions = [
      "A cluster of nutrient-rich fungi growing in the shade.",
      "Sugar-heavy secretions from a nearby plant.",
      "High-energy sap crystalline deposits.",
      "Organic debris perfect for colony expansion."
    ];

    for (let i = 0; i < 110; i++) {
      this.resources.push({
        id: `food-${i}`,
        position: {
          x: (Math.random() - 0.5) * SIM_CONFIG.WORLD_SIZE * 0.9,
          y: (Math.random() - 0.5) * SIM_CONFIG.WORLD_SIZE * 0.9
        },
        amount: 80 + Math.random() * 140,
        maxAmount: 250,
        type: 'FOOD',
        description: descriptions[Math.floor(Math.random() * descriptions.length)]
      });
    }
  }

  update(dt: number, globalSpeedMultiplier: number = 1.0) {
    this.grid.clear();
    
    // Check for base destruction
    this.factions.forEach(f => {
      if (!f.isDead && f.health <= 0) {
        f.isDead = true;
        const attacker = this.factions.find(rf => rf.id !== f.id && rf.attackPlan && rf.attackPlan.targetFactionId === f.id) || f;
        this.addEvent(attacker, f, 'ELIMINATED', `${f.name} has been defeated!`);
      }
    });

    // 1. Update Entities
    const survivingEntities: EntityState[] = [];

    for (const ant of this.entities) {
      if (!ant) continue;
      const faction = this.factions.find(f => f.id === ant.factionId);
      if (!faction || faction.isDead) continue;

      // Apply Poison DoT if affected
      if (ant.poisonDurationRemaining && ant.poisonDurationRemaining > 0) {
        ant.poisonDurationRemaining -= dt;
        let poisonDmg = (ant.poisonDamagePerSecond || 5) * dt;
        if (ant.shieldBuffRemaining && ant.shieldBuffRemaining > 0) {
          poisonDmg *= 0.5; // Shield reduces Poison damage
        }
        // Toxic Spores: Spread poison to nearby enemies if killed by or affected by Emerald Hive
        const sourceFaction = this.factions.find(f => f.id === ant.poisonSourceFactionId);
        if (sourceFaction?.activeStrategy === 'TOXIC_SPORES' && Math.random() < 0.3 * dt) {
          const nearby = this.grid.getNearby(ant.position, 50).filter(e => e && e.factionId !== sourceFaction.id && e.id !== ant.id);
          nearby.forEach(e => {
            e.poisonDurationRemaining = 4.0;
            e.poisonDamagePerSecond = ant.poisonDamagePerSecond || 5;
            e.poisonSourceFactionId = sourceFaction.id;
          });
        }

        ant.health -= poisonDmg;
        
        // If poison kills the ant, credit goes to the attacker faction
        if (ant.health <= 0 && ant.poisonSourceFactionId) {
          const sourceFaction = this.factions.find(f => f.id === ant.poisonSourceFactionId);
          if (sourceFaction) {
            this.handleKill(sourceFaction, ant);
          }
        }
        
        if (ant.poisonDurationRemaining <= 0) {
          ant.poisonDurationRemaining = 0;
          ant.poisonDamagePerSecond = 0;
          ant.poisonSourceFactionId = undefined;
        }
      }

      // Apply Acid DoT if affected
      if (ant.acidDurationRemaining && ant.acidDurationRemaining > 0) {
        ant.acidDurationRemaining -= dt;
        let acidDmg = (ant.acidDamagePerSecond || 8) * dt;
        if (ant.shieldBuffRemaining && ant.shieldBuffRemaining > 0) {
          acidDmg *= 0.5; // Shield reduces Acid damage
        }
        ant.health -= acidDmg;

        // If acid kills the ant, credit goes to the attacker faction
        if (ant.health <= 0 && ant.acidSourceFactionId) {
          const sourceFaction = this.factions.find(f => f.id === ant.acidSourceFactionId);
          if (sourceFaction) {
            this.handleKill(sourceFaction, ant);
          }
        }

        if (ant.acidDurationRemaining <= 0) {
          ant.acidDurationRemaining = 0;
          ant.acidDamagePerSecond = 0;
          ant.acidSourceFactionId = undefined;
        }
      }

      // Apply Stun remaining duration
      if (ant.stunDurationRemaining && ant.stunDurationRemaining > 0) {
        ant.stunDurationRemaining -= dt;
        if (ant.stunDurationRemaining <= 0) {
          ant.stunDurationRemaining = 0;
        }
      }

      // Apply Shield Buff remaining duration
      if (ant.shieldBuffRemaining && ant.shieldBuffRemaining > 0) {
        ant.shieldBuffRemaining -= dt;
        if (ant.shieldBuffRemaining <= 0) {
          ant.shieldBuffRemaining = 0;
        }
      }

      // Metabolism
      if (ant.type !== EntityType.QUEEN) {
        ant.hunger += SIM_CONFIG.HUNGER_RATE * dt;
      }

      if (ant.hunger > SIM_CONFIG.DIE_HUNGER_THRESHOLD || ant.health <= 0) {
        if (ant.type === EntityType.WORKER) {
          faction.stats.workersLost++;
          if (ant.escortId) {
            const escort = this.entities.find(e => e && e.id === ant.escortId);
            if (escort) escort.workerId = undefined;
          }
        } else if (ant.type === EntityType.WARRIOR) {
          faction.stats.warriorsLost++;
          if (ant.workerId) {
            const worker = this.entities.find(e => e && e.id === ant.workerId);
            if (worker) worker.escortId = undefined;
          }
        } else if (ant.type === EntityType.POISONER) {
          faction.stats.poisonersLost++;
        } else if ([EntityType.BERSERKER, EntityType.GUARDIAN, EntityType.ACID_SPITTER, EntityType.TITAN].includes(ant.type)) {
          faction.stats.elitesLost++;
        }

        // Drop food upon death
        this.resources.push({
          id: `remains-${ant.id}`,
          position: { ...ant.position },
          amount: 20,
          maxAmount: 20,
          type: 'FOOD'
        });

        if (ant.type === EntityType.QUEEN) {
          if (!faction.isDead) {
            faction.isDead = true;
            faction.health = 0;
            this.addEvent(faction, faction, 'ELIMINATED', `${faction.name} Queen has been destroyed!`);
          }
        }

        // Strategy Death Triggers
        if (faction.activeStrategy === 'SCORCHED_EARTH') {
          const deathExplosionDamage = 50;
          const nearbyEnemies = this.grid.getNearby(ant.position, 70).filter(e => e && e.factionId !== faction.id);
          nearbyEnemies.forEach(enemy => {
            enemy.health -= deathExplosionDamage;
            if (enemy.health <= 0) {
              this.handleKill(faction, enemy);
            }
          });
        }

        continue; // RIP
      }

      // AI Decision Logic
      if (ant.stunDurationRemaining && ant.stunDurationRemaining > 0) {
        ant.velocity = { x: 0, y: 0 };
      } else {
        this.updateAntBehavior(ant, faction, dt, globalSpeedMultiplier);
      }

      // Physics
      ant.position = Vector.add(ant.position, Vector.mul(ant.velocity, dt));
      
      // Update Grid
      this.grid.insert(ant);
      survivingEntities.push(ant);
    }

    this.entities = survivingEntities;
    
    // 1.5 Regenerate Resources if low
    const totalFoodCount = this.resources.filter(r => r.amount > 0).length;
    if (totalFoodCount < SIM_CONFIG.RESOURCE_REGEN_THRESHOLD && Math.random() < SIM_CONFIG.RESOURCE_REGEN_CHANCE) {
      this.resources.push({
        id: `food-regen-${Date.now()}`,
        position: {
          x: (Math.random() - 0.5) * SIM_CONFIG.WORLD_SIZE * 0.9,
          y: (Math.random() - 0.5) * SIM_CONFIG.WORLD_SIZE * 0.9
        },
        amount: 100 + Math.random() * 150,
        maxAmount: 250,
        type: 'FOOD'
      });
    }
    this.resources = this.resources.filter(r => r.amount > 0 || r.id.startsWith('food-')); // Keep some empty food markers or clean up

    // 2. Update Influence Grid
    this.updateInfluence(dt);

    // 3. Resource Regeneration & Faction Economy
    this.factions.forEach(f => {
      this.updateFactionAI(f, dt);
    });

    // 4. Update Population History (every few seconds)
    if (!this._lastHistoryUpdate || Date.now() - this._lastHistoryUpdate > 2000) {
      this.updatePopulationHistory();
      this._lastHistoryUpdate = Date.now();
    }
  }

  private _lastHistoryUpdate: number = 0;
  populationHistory: { timestamp: number; [factionId: string]: number }[] = [];

  private updatePopulationHistory() {
    const entry: { timestamp: number; [factionId: string]: number } = {
      timestamp: Date.now()
    };
    this.factions.forEach(f => {
      entry[f.id] = this.entities.filter(e => e && e.factionId === f.id).length;
    });
    this.populationHistory.push(entry);
    if (this.populationHistory.length > 100) this.populationHistory.shift();
  }

  private applyDamage(attacker: EntityState | null, victim: EntityState, baseDamage: number, faction: Faction) {
    if (!victim || !faction) return;
    let finalDamage = baseDamage;
    const victimFactionId = victim.factionId || (victim as any).id;
    const victimFaction = this.factions.find(f => f.id === victimFactionId); 
    const victimPos = victim.position || (victim as any).basePosition;

    // Gilded Armor: Heavy damage reduction
    if (victimFaction?.activeStrategy === 'GILDED_ARMOR') {
      finalDamage *= 0.6;
    }

    // Phalanx Wall: Defense bonus if near allies
    if (victimFaction?.activeStrategy === 'PHALANX_WALL' && victimPos) {
      const nearbyAllies = this.grid.getNearby(victimPos, 60).filter(e => e && e.factionId === victimFactionId && e.id !== victim.id);
      if (nearbyAllies.length >= 2) finalDamage *= 0.7;
    }

    // Shield Buff
    if (victim.shieldBuffRemaining && victim.shieldBuffRemaining > 0) {
      finalDamage *= 0.5;
    }

    // Dimensional Spike: Damage bonus if target < 50% health
    if (faction.activeStrategy === 'DIMENSIONAL_SPIKE' && victim.health < victim.maxHealth * 0.5) {
      finalDamage *= 1.4;
    }

    // Reinforced Plating: passive handled by healthMultiplier usually, but we could add flat reduction here if needed
    if (victimFaction?.activeStrategy === 'REINFORCED_PLATING') {
      finalDamage *= 0.85;
    }

    victim.health -= finalDamage;

    // Divine Intervention: 15% chance to survive lethal blow with 1hp
    if (victim.health <= 0 && victimFaction?.activeStrategy === 'DIVINE_INTERVENTION' && Math.random() < 0.15 && victim.type !== EntityType.BASE) {
      victim.health = 1;
    }

    // Lifesteal logic
    if (attacker && victim.health > 0) {
      let lifestealMult = 0;
      if (attacker.type === EntityType.BLOOD_PRIEST) lifestealMult += 0.4;
      if (faction.activeStrategy === 'LIFE_DRAIN') lifestealMult += 0.15;
      
      if (lifestealMult > 0) {
        attacker.health = Math.min(attacker.maxHealth, attacker.health + finalDamage * lifestealMult);
      }
    }

    if (victim.health <= 0) {
      this.handleKill(faction, victim);
      if (attacker) {
        attacker.kills++;
        this.checkLevelUp(attacker);
      }
    }
  }

  private handleKill(killerFaction: Faction, victim: EntityState) {
    killerFaction.stats.kills++;

    // Strategy: Recursive Spawning (Azure Swarm)
    if (killerFaction.activeStrategy === 'RECURSIVE_SPAWNING' && Math.random() < 0.25) {
      this.spawnEntity(killerFaction.id, EntityType.WORKER, victim.position);
    }

    // Strategy: Mercenary Contract (Golden Monarchs)
    if (killerFaction.activeStrategy === 'MERCENARY_CONTRACT' && Math.random() < 0.15) {
      this.spawnEntity(killerFaction.id, victim.type, victim.position);
    }
  }

  private updateFactionAI(f: Faction, dt: number) {
    if (f.isDead) return;
    f.age += dt;

    // Basic maintenance
    const cost = SIM_CONFIG.BASE_CONSUMPTION * dt;
    f.resources = Math.max(0, f.resources - cost);
    f.stats.totalExpense += cost;

    f.territoryCount = this.influenceGrid.filter(c => c && c.factionId === f.id).length;

    const myUnits = this.entities.filter(e => e && e.factionId === f.id);
    const workerCount = myUnits.filter(e => e.type === EntityType.WORKER).length;
    const warriorCount = myUnits.filter(e => e.type === EntityType.WARRIOR).length;
    const poisonerCount = myUnits.filter(e => e.type === EntityType.POISONER).length;
    const queenAlive = myUnits.some(e => e.type === EntityType.QUEEN);

    if (!queenAlive && f.health > 0) {
      f.health -= 5 * dt;
    }

    // --- STRATEGIC ANALYSIS ---
    // Analyze simulation state before decision
    const enemiesNearBase = this.grid.getNearby(f.basePosition, 500).filter(e => e && e.factionId !== f.id);
    const threatLevel = enemiesNearBase.length / 10; // 0 to 1+
    const resourceStrain = (workerCount * 0.5 + warriorCount * 1.0 + poisonerCount * 0.8) / Math.max(1, f.resources / 10);
    const otherFactions = this.factions.filter(of => of.id !== f.id && !of.isDead);
    const relativePower = warriorCount / Math.max(1, ...otherFactions.map(of => this.entities.filter(e => e && e.factionId === of.id && e.type === EntityType.WARRIOR).length));

    // Determine Strategy
    let currentStrategy: 'EXPANSION' | 'DEFENSE' | 'AGGRESSION' | 'RECOVERY' = 'EXPANSION';
    
    if (threatLevel > 0.3 || f.health < f.maxHealth * 0.7) currentStrategy = 'DEFENSE';
    else if (f.resources < 100 && workerCount < 10) currentStrategy = 'RECOVERY';
    else if (relativePower > 1.5 && f.resources > 200) currentStrategy = 'AGGRESSION';
    else if (workerCount > 15) currentStrategy = 'EXPANSION';

    // Personality Mutation (Adaptive Learning)
    if (Math.random() < 0.005) {
      const keys = Object.keys(f.personality) as (keyof FactionPersonality)[];
      const key = keys[Math.floor(Math.random() * keys.length)];
      // Bias mutation towards current needs
      const adjustment = currentStrategy === 'DEFENSE' && key === 'defenseFocus' ? 0.1 : (Math.random() - 0.5) * 0.05;
      f.personality[key] = Math.max(0, Math.min(1, f.personality[key] + adjustment));
    }

    // Thresholds influenced by personality AND current strategy
    let targetWorkerCount = 15 + Math.floor(f.personality.expansionism * 20);
    let targetWarriorCount = 15 + Math.floor(f.personality.defenseFocus * 30);
    let targetPoisonerCount = 6 + Math.floor(f.personality.aggressiveness * 12);

    if (currentStrategy === 'RECOVERY') targetWorkerCount += 10;
    if (currentStrategy === 'DEFENSE') {
      targetWarriorCount += 25;
      targetPoisonerCount += 4;
    }
    if (currentStrategy === 'AGGRESSION') {
      targetWarriorCount += 35;
      targetPoisonerCount += 8;
    }

    // Decision Logic
    const canAffordWarrior = f.resources > SIM_CONFIG.WARRIOR_COST;
    const canAffordWorker = f.resources > SIM_CONFIG.WORKER_COST;
    const canAffordPoisoner = f.resources > SIM_CONFIG.POISONER_COST;

    const eliteType = this.getEliteType(f.name);
    const eliteCost = this.getEliteCost(eliteType);
    const eliteCount = myUnits.filter(e => e.type === eliteType).length;
    const canAffordElite = f.resources > eliteCost;

    let targetEliteCount = 2 + Math.floor(f.personality.aggressiveness * 4);
    if (currentStrategy === 'AGGRESSION') targetEliteCount += 2;
    if (currentStrategy === 'DEFENSE') targetEliteCount += 1;

    let spawned = false;
    if (canAffordWorker && workerCount < targetWorkerCount && Math.random() < SIM_CONFIG.SPAWN_CHANCE_WORKER * f.personality.fertility) {
      f.resources -= SIM_CONFIG.WORKER_COST;
      f.stats.totalExpense += SIM_CONFIG.WORKER_COST;
      this.spawnEntity(f.id, EntityType.WORKER, f.basePosition);
      spawned = true;
    }

    if (!spawned && canAffordPoisoner && poisonerCount < targetPoisonerCount && Math.random() < SIM_CONFIG.SPAWN_CHANCE_POISONER * f.personality.fertility) {
      f.resources -= SIM_CONFIG.POISONER_COST;
      f.stats.totalExpense += SIM_CONFIG.POISONER_COST;
      this.spawnEntity(f.id, EntityType.POISONER, f.basePosition);
      spawned = true;
    }

    if (!spawned && canAffordElite && eliteCount < targetEliteCount && Math.random() < SIM_CONFIG.SPAWN_CHANCE_ELITE * f.personality.fertility) {
      f.resources -= eliteCost;
      f.stats.totalExpense += eliteCost;
      this.spawnEntity(f.id, eliteType, f.basePosition);
      spawned = true;
    }

    if (!spawned && canAffordWarrior && (warriorCount < targetWarriorCount || f.personality.aggressiveness > 0.8) && Math.random() < SIM_CONFIG.SPAWN_CHANCE_WARRIOR * f.personality.fertility) {
      f.resources -= SIM_CONFIG.WARRIOR_COST;
      f.stats.totalExpense += SIM_CONFIG.WARRIOR_COST;
      this.spawnEntity(f.id, EntityType.WARRIOR, f.basePosition);
      spawned = true;
    }

    // Dynamic Personality Shifts based on success
    if (f.stats.kills > (f.stats.warriorsLost + 5)) f.personality.aggressiveness += 0.01;
    if (f.stats.totalIncome > f.stats.totalExpense * SIM_CONFIG.INCOME_BONUS_THRESHOLD) f.personality.expansionism += 0.01;

    // Adaptive Swarm Research (Auto-upgrade for AI colonies)
    if (f.resources > 350) {
      const upgradeTypes: ('speed' | 'strength' | 'coordination')[] = ['speed', 'strength', 'coordination'];
      const affordableMap = upgradeTypes.filter(cat => {
        const lv = (f.upgrades ? f.upgrades[cat] : 0) || 0;
        return lv < 3 && f.resources >= getUpgradeCost(lv);
      });

      if (affordableMap.length > 0) {
        // AI selects upgrade depending on personality/strategy
        let selectedUpgrade: 'speed' | 'strength' | 'coordination' = affordableMap[0];
        if (currentStrategy === 'AGGRESSION' || currentStrategy === 'DEFENSE') {
          selectedUpgrade = affordableMap.find(c => c === 'strength') || affordableMap.find(c => c === 'speed') || affordableMap[0];
        } else if (currentStrategy === 'EXPANSION') {
          selectedUpgrade = affordableMap.find(c => c === 'speed') || affordableMap.find(c => c === 'coordination') || affordableMap[0];
        } else {
          // Default: lowest leveled upgrade
          selectedUpgrade = affordableMap.reduce((prev, curr) => ((f.upgrades ? f.upgrades[curr] : 0) < (f.upgrades ? f.upgrades[prev] : 0)) ? curr : prev);
        }

        const level = (f.upgrades ? f.upgrades[selectedUpgrade] : 0) || 0;
        const cost = getUpgradeCost(level);
        if (f.resources >= cost) {
          f.resources -= cost;
          f.stats.totalExpense += cost;
          if (!f.upgrades) {
            f.upgrades = { speed: 0, strength: 0, coordination: 0 };
          }
          f.upgrades[selectedUpgrade] = level + 1;
        }
      }
    }

    // --- ESCORT MANAGEMENT ---
    // Pair warriors with workers that need protection
    const availableWarriors = myUnits.filter(e => e.type === EntityType.WARRIOR && !e.workerId);
    const workersNeedingEscort = myUnits.filter(e => e.type === EntityType.WORKER && !e.escortId);

    if (availableWarriors.length > 0 && workersNeedingEscort.length > 0) {
      // Limit escorts based on defensive focus or total warrior availability
      const maxEscorts = Math.min(availableWarriors.length, Math.floor(warriorCount * 0.7));
      for (let i = 0; i < maxEscorts && i < workersNeedingEscort.length; i++) {
        const warrior = availableWarriors[i];
        const worker = workersNeedingEscort[i];
        warrior.workerId = worker.id;
        worker.escortId = warrior.id;
      }
    }

    // Centralized Coordinated Strike (Attack Planning)
    const activeWarriors = myUnits.filter(e => e.type === EntityType.WARRIOR);
    const coordLevel = (f.upgrades?.coordination || 0);
    
    if (!f.attackPlan) {
      const otherFactionsActive = this.factions.filter(rf => rf.id !== f.id && !rf.isDead);
      const minWarriorsToPlan = Math.max(3, Math.floor(5 + f.personality.defenseFocus * 4) - coordLevel);
      if (activeWarriors.length >= minWarriorsToPlan && otherFactionsActive.length > 0 && f.resources > 100) {
        // Target weakest active rival base
        const target = otherFactionsActive.reduce((prev, curr) => (curr.health < prev.health) ? curr : prev);
        
        // Calculate a rally point towards the enemy base (about 120 units out)
        const dir = Vector.normalize(Vector.sub(target.basePosition, f.basePosition));
        const rallyPoint = Vector.add(f.basePosition, Vector.mul(dir, 120));

        f.attackPlan = {
          targetFactionId: target.id,
          rallyPoint,
          stage: 'RALLYING',
          lastSpawnTime: f.age
        };
        this.addEvent(f, target, 'RALLYING', `${f.name} is preparing to attack ${target.name}! ⛺`);
      }
    } else {
      const targetFaction = this.factions.find(rf => rf.id === f.attackPlan!.targetFactionId);
      if (!targetFaction || targetFaction.isDead) {
        f.attackPlan = undefined;
      } else {
        if (f.attackPlan.stage === 'RALLYING') {
          // Coordination upgrade broadens rally range
          const rallyCheckRadius = 130 + coordLevel * 25;
          const ralliedCount = activeWarriors.filter(w => Vector.dist(w.position, f.attackPlan!.rallyPoint) < rallyCheckRadius).length;
          const timeSpent = f.age - f.attackPlan.lastSpawnTime;
          const minRequiredToLaunch = Math.max(4, Math.floor(4 + f.personality.defenseFocus * 4) - coordLevel);

          if (ralliedCount >= minRequiredToLaunch || (timeSpent > 25 && activeWarriors.length >= 4)) {
            f.attackPlan.stage = 'ATTACKING';
            f.attackPlan.lastSpawnTime = f.age;
            this.addEvent(f, targetFaction, 'ATTACKING', `${f.name} has launched a strike wave against ${targetFaction.name}! ⚔️`);
          }
        } else if (f.attackPlan.stage === 'ATTACKING') {
          if (activeWarriors.length < 2) {
            f.attackPlan = undefined; // Retrench/retreat if squad is decimated
          }
        }
      }
    }
  }

  private getEliteType(factionName: string): EntityType {
    if (factionName.includes('Crimson')) return EntityType.BERSERKER;
    if (factionName.includes('Azure')) return EntityType.GUARDIAN;
    if (factionName.includes('Emerald')) return EntityType.ACID_SPITTER;
    if (factionName.includes('Golden')) return EntityType.TITAN;
    if (factionName.includes('Obsidian')) return EntityType.SHADOW_STRIKER;
    if (factionName.includes('Violet')) return EntityType.VOID_TUNNELER;
    if (factionName.includes('Ivory')) return EntityType.SHIELD_BEARER;
    if (factionName.includes('Iron')) return EntityType.SAPPER;
    if (factionName.includes('Sanguine')) return EntityType.BLOOD_PRIEST;
    return EntityType.WARRIOR;
  }

  private getEliteCost(type: EntityType): number {
    if (type === EntityType.BERSERKER) return SIM_CONFIG.BERSERKER_COST;
    if (type === EntityType.GUARDIAN) return SIM_CONFIG.GUARDIAN_COST;
    if (type === EntityType.ACID_SPITTER) return SIM_CONFIG.ACID_SPITTER_COST;
    if (type === EntityType.TITAN) return SIM_CONFIG.TITAN_COST;
    if (type === EntityType.SHADOW_STRIKER) return SIM_CONFIG.SHADOW_STRIKER_COST;
    if (type === EntityType.VOID_TUNNELER) return SIM_CONFIG.VOID_TUNNELER_COST;
    if (type === EntityType.SHIELD_BEARER) return SIM_CONFIG.SHIELD_BEARER_COST;
    if (type === EntityType.SAPPER) return SIM_CONFIG.SAPPER_COST;
    if (type === EntityType.BLOOD_PRIEST) return SIM_CONFIG.BLOOD_PRIEST_COST;
    return 100;
  }

  private updateInfluence(dt: number) {
    const decay = SIM_CONFIG.INFLUENCE_DECAY * dt;
    const cellSize = SIM_CONFIG.TERRITORY_CELL_SIZE;
    const halfWorld = SIM_CONFIG.WORLD_SIZE / 2;

    // Apply Decay
    for (let i = 0; i < this.influenceGrid.length; i++) {
      const cell = this.influenceGrid[i];
      if (cell && cell.strength > 0) {
        cell.strength = Math.max(0, cell.strength - decay);
        if (cell.strength === 0) cell.factionId = null;
      }
    }

    // Add Influence from Ants
    for (const ant of this.entities) {
      if (!ant || !ant.position) continue;
      const gx = Math.floor((ant.position.x + halfWorld) / cellSize);
      const gy = Math.floor((ant.position.y + halfWorld) / cellSize);

      if (gx >= 0 && gx < this.gridDim && gy >= 0 && gy < this.gridDim) {
        const idx = gy * this.gridDim + gx;
        const cell = this.influenceGrid[idx];
        if (!cell) continue;
        
        const influenceValue = ant.type === EntityType.WARRIOR ? SIM_CONFIG.WARRIOR_INFLUENCE : SIM_CONFIG.WORKER_INFLUENCE;

        if (cell.factionId === null || cell.factionId === ant.factionId) {
          cell.factionId = ant.factionId;
          cell.strength = Math.min(100, cell.strength + influenceValue * dt * 10);
        } else {
          // Fight for influence
          cell.strength -= influenceValue * dt * 10;
          if (cell.strength < 0) {
            cell.factionId = ant.factionId;
            cell.strength = Math.abs(cell.strength);
          }
        }
      }
    }
  }

  private updateAntBehavior(ant: EntityState, faction: Faction, dt: number, globalSpeedMultiplier: number = 1.0) {
    const basePos = faction.basePosition;
    const stats = UNIT_STATS[ant.type as keyof typeof UNIT_STATS];
    const upgrades = faction.upgrades || { speed: 0, strength: 0, coordination: 0 };

    // Formulate upgrade multipliers
    const speedMultiplier = 1 + upgrades.speed * SIM_CONFIG.UPGRADE_SPEED_BONUS;
    const damageMultiplier = 1 + upgrades.strength * SIM_CONFIG.UPGRADE_STRENGTH_BONUS;
    const healthMultiplier = 1 + upgrades.strength * SIM_CONFIG.UPGRADE_HEALTH_BONUS;
    const scanRadiusMultiplier = 1 + upgrades.coordination * SIM_CONFIG.UPGRADE_COORD_BONUS;

    // Dynamically adjust ant maxHealth and scale health proportionally
    const baseMaxHealth = stats.health * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS);
    const upgradedMaxHealth = baseMaxHealth * healthMultiplier;
    if (ant.maxHealth !== upgradedMaxHealth) {
      const prevMax = ant.maxHealth || baseMaxHealth;
      ant.maxHealth = upgradedMaxHealth;
      ant.health = Math.min(upgradedMaxHealth, (ant.health / prevMax) * upgradedMaxHealth);
    }

    let activePenalty = 1.0;
    if (ant.acidDurationRemaining && ant.acidDurationRemaining > 0) {
      activePenalty = 0.5; // Corrosive acid slows the ant down by 50%
    }
    let strategySpeedMod = 1.0;
    let strategyDamageMod = 1.0;

    if (faction.activeStrategy === 'BLOOD_RUSH') {
      strategySpeedMod = 1.5;
    }
    if (faction.activeStrategy === 'DEEP_FORAGING' && ant.type === EntityType.WORKER && ant.load > 0) {
      strategySpeedMod = 0.6;
    }
    if (faction.activeStrategy === 'COLLECTIVE_MIND') {
      const unitsNearby = this.grid.getNearby(ant.position, 60).filter(e => e && e.factionId === faction.id && e.id !== ant.id);
      if (unitsNearby.length >= 3) {
        strategyDamageMod = 1.3;
        strategySpeedMod = 1.1;
      }
    }
    if (faction.activeStrategy === 'ROOTED_DEFENSE') {
      const distToBase = Vector.dist(ant.position, faction.basePosition);
      if (distToBase < 400) {
        ant.health = Math.min(ant.maxHealth, ant.health + dt * 10); // Active regen near base
        strategyDamageMod = 1.4;
      }
    }
    if (faction.activeStrategy === 'GILDED_ARMOR') {
      // Handled during damage taking: usually handled in update loop physics section
      // But we can apply it to the health directly or damage reduction later
    }
    if (faction.activeStrategy === 'ROYAL_PRESENCE') {
      const queen = this.entities.find(e => e && e.factionId === faction.id && e.type === EntityType.QUEEN);
      if (queen) {
        const distToQueen = Vector.dist(ant.position, queen.position);
        if (distToQueen < 500) {
          strategyDamageMod = 1.25;
          strategySpeedMod = 1.1;
        }
      }
    }
    if (faction.activeStrategy === 'ECLIPSE_ASSAULT') {
      const distToBase = Vector.dist(ant.position, faction.basePosition);
      if (distToBase > 1000) strategySpeedMod = 1.4;
    }
    if (faction.activeStrategy === 'NIGHT_TERROR') {
      const nearbyEnemies = this.grid.getNearby(ant.position, 100).filter(e => e && e.factionId !== faction.id);
      if (nearbyEnemies.length > 0) strategyDamageMod = 1.2;
    }
    if (faction.activeStrategy === 'VAMPIRIC_FRENZY' && ant.health < ant.maxHealth * 0.4) {
      strategySpeedMod = 1.5;
      strategyDamageMod = 1.3;
    }
    if (faction.activeStrategy === 'HALLOWED_GROUND') {
      const distToBase = Vector.dist(ant.position, faction.basePosition);
      if (distToBase < 400) ant.health = Math.min(ant.maxHealth, ant.health + dt * 15);
    }

    if (faction.activeStrategy === 'VOID_STEP') {
      const enemiesNearby = this.grid.getNearby(ant.position, 120).filter(e => this.isEntityVisible(ant, e));
      if (enemiesNearby.length > 0 && Math.random() < 0.05) strategySpeedMod *= 2.0;
    }
    if (faction.activeStrategy === 'REINFORCED_PLATING') {
      // Handled by applyDamage reduction and healthMultiplier
    }
    if (faction.activeStrategy === 'ENGINEER_SURGE' && ant.type === EntityType.WORKER) {
      // Handled in gathering logic
    }

    const upgradedSpeed = (ant.escortId ? (UNIT_STATS[EntityType.WARRIOR].speed * speedMultiplier) : (stats.speed * speedMultiplier)) * activePenalty * globalSpeedMultiplier * strategySpeedMod;
    let upgradedDamage = stats.damage * damageMultiplier * strategyDamageMod;
    let upgradedScanRadius = SIM_CONFIG.SCAN_RADIUS * scanRadiusMultiplier;
    
    if (faction.activeStrategy === 'SINGULARITY_REACH') upgradedScanRadius *= 1.6;
    if (faction.activeStrategy === 'SHADOW_VEIL') upgradedScanRadius *= 0.7; // Harder to see for self too? No, usually it's others can't see YOU.

    // Siege Vanguard & Demolition Focus: Massive damage vs bases
    let siegeBonus = 1.0;
    if (faction.activeStrategy === 'SIEGE_VANGUARD') {
      siegeBonus = 3.5;
      upgradedDamage *= 0.5;
    }
    if (faction.activeStrategy === 'DEMOLITION_FOCUS') {
      siegeBonus = 3.0;
    }

    if (ant.state === 'RESTING') {
      ant.velocity = Vector.lerp(ant.velocity, { x: 0, y: 0 }, dt * 5);
      ant.hunger = Math.max(0, ant.hunger - SIM_CONFIG.HUNGER_HEAL_RATE * dt);
      ant.health = Math.min(ant.maxHealth, ant.health + SIM_CONFIG.BASE_HEAL_RATE * dt);
      
      // Stop resting after a while or if fully recovered
      if (ant.hunger <= 0 && ant.health >= ant.maxHealth) {
        ant.state = 'FORAGING';
      }
      return;
    }

    // Escort logic for workers: stay close to warrior
    if (ant.type === EntityType.WORKER && ant.escortId) {
      const escort = this.entities.find(e => e && e.id === ant.escortId);
      if (escort) {
        const distToEscort = Vector.dist(ant.position, escort.position);
        if (distToEscort > 40) {
          // Move towards escort if too far
          const dirToEscort = Vector.normalize(Vector.sub(escort.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToEscort, upgradedSpeed), dt * 3);
          // If we are significantly far, don't perform other actions
          if (distToEscort > 80) return;
        }
      } else {
        ant.escortId = undefined;
      }
    }

    if (ant.state === 'RETURNING') {
      const dirToBase = Vector.normalize(Vector.sub(basePos, ant.position));
      ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, upgradedSpeed), dt * 2);
      
      if (Vector.dist(ant.position, basePos) < 30) {
        faction.resources += ant.load;
        faction.stats.totalIncome += ant.load;
        ant.load = 0;
        ant.state = 'RESTING'; // Rest after returning
      }
    } else {
      // Look for food
      let nearestRes: ResourceNode | null = null;
      let minDist = upgradedScanRadius;

      if (ant.type === EntityType.WORKER) {
        for (const res of this.resources) {
          if (res.amount <= 0) continue;
          const d = Vector.dist(ant.position, res.position);
          if (d < minDist) {
            minDist = d;
            nearestRes = res;
          }
        }

        if (nearestRes) {
          const dirToRes = Vector.normalize(Vector.sub(nearestRes.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToRes, upgradedSpeed), dt * 2);

          if (Vector.dist(ant.position, nearestRes.position) < 15) {
            let take = Math.min(nearestRes.amount, stats.capacity);
            if (faction.activeStrategy === 'ENGINEER_SURGE') take *= 1.25;
            nearestRes.amount -= Math.min(nearestRes.amount, take);
            ant.load = take;
            ant.harvests++;
            ant.state = 'RETURNING';
          }
          return;
        }
      }

      if (ant.type === EntityType.POISONER) {
        const scanRadius = upgradedScanRadius * 1.5;
        const nearbyEnemies = this.grid.getNearby(ant.position, scanRadius).filter(e => this.isEntityVisible(ant, e));
        const myAllies = this.grid.getNearby(ant.position, scanRadius * 1.5).filter(e => e && e.factionId === faction.id && e.id !== ant.id);

        let targetEnemy: EntityState | null = null;
        if (nearbyEnemies.length > 0) {
          const unpoisoned = nearbyEnemies.filter(e => !e.poisonDurationRemaining || e.poisonDurationRemaining < 1);
          targetEnemy = unpoisoned.length > 0 ? unpoisoned[0] : nearbyEnemies[0];
        }

        // Defence / survival: if health is low or target is poisoned, retreat to comrades
        const needsSurvival = ant.health < ant.maxHealth * 0.5 || (targetEnemy && targetEnemy.poisonDurationRemaining && targetEnemy.poisonDurationRemaining > 3);

        if (needsSurvival && myAllies.length > 0) {
          const closestAlly = myAllies.reduce((prev, curr) => Vector.dist(ant.position, curr.position) < Vector.dist(ant.position, prev.position) ? curr : prev);
          const dirToAlly = Vector.normalize(Vector.sub(closestAlly.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToAlly, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 3);
          ant.state = 'RETURNING';
          return;
        }

        if (targetEnemy) {
          const dir = Vector.normalize(Vector.sub(targetEnemy.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 2.5);
          
          if (Vector.dist(ant.position, targetEnemy.position) < 20) {
            // Direct bite strike
            const directDmg = upgradedDamage * 0.5 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
            this.applyDamage(ant, targetEnemy, directDmg, faction);
            
            // Deliver poison payload
            targetEnemy.poisonDurationRemaining = 5.0;
            targetEnemy.poisonDamagePerSecond = upgradedDamage * 0.6 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS);
            targetEnemy.poisonSourceFactionId = faction.id;

            ant.velocity = Vector.mul(dir, -upgradedSpeed * 0.6); // recoil to safety
          }
          ant.state = 'ATTACKING';
          return;
        }

        const rivalFactions = this.factions.filter(f => f.id !== faction.id && !f.isDead);
        if (rivalFactions.length > 0) {
          const targetBase = rivalFactions.reduce((prev, curr) => (curr.health < prev.health) ? curr : prev);
          const distToTargetBase = Vector.dist(ant.position, targetBase.basePosition);
          
          if (distToTargetBase < 60) {
            const damage = upgradedDamage * 0.8 * dt * siegeBonus;
            this.applyDamage(ant, targetBase as any, damage, faction);
            ant.velocity = { x: 0, y: 0 };
            return;
          } else if (faction.personality.aggressiveness > 0.4) {
            const dirToBase = Vector.normalize(Vector.sub(targetBase.basePosition, ant.position));
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt);
            return;
          }
        }
      }

      if (ant.type === EntityType.BERSERKER) {
        let currentSpeed = upgradedSpeed;
        let currentDamage = upgradedDamage;
        
        // Under 50% health, rage state active!
        const isEnraged = ant.health < ant.maxHealth * 0.5;
        if (isEnraged) {
          currentSpeed *= 1.3;
          currentDamage *= 1.5;
        }

        const nearbyEnemies = this.grid.getNearby(ant.position, upgradedScanRadius * 1.5).filter(e => this.isEntityVisible(ant, e));
        if (nearbyEnemies.length > 0) {
          const enemy = nearbyEnemies[0];
          const dir = Vector.normalize(Vector.sub(enemy.position, ant.position));
          // Speed charge!
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, currentSpeed * 1.2 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 3);
          
          if (Vector.dist(ant.position, enemy.position) < 20) {
            // High damage strike!
            const damage = currentDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
            this.applyDamage(ant, enemy, damage, faction);
            ant.velocity = { x: 0, y: 0 };
          }
          ant.state = 'ATTACKING';
          return;
        }
        
        // Attack Enemy base
        const rivalFactions = this.factions.filter(f => f.id !== faction.id && !f.isDead);
        if (rivalFactions.length > 0) {
          const targetBase = rivalFactions.reduce((prev, curr) => (curr.health < prev.health) ? curr : prev);
          const distToTargetBase = Vector.dist(ant.position, targetBase.basePosition);
          if (distToTargetBase < 60) {
            const damage = currentDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt * 0.8 * siegeBonus;
            this.applyDamage(ant, targetBase as any, damage, faction);
            ant.velocity = { x: 0, y: 0 };
            return;
          } else if (faction.personality.aggressiveness > 0.3) {
            const dirToBase = Vector.normalize(Vector.sub(targetBase.basePosition, ant.position));
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, currentSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt);
            return;
          }
        }
      }

      if (ant.type === EntityType.GUARDIAN) {
        // Periodically shield nearby allies
        const shieldCandidateRadius = 110;
        const localAllies = this.grid.getNearby(ant.position, shieldCandidateRadius).filter(e => e && e.factionId === faction.id && e.id !== ant.id);
        
        for (const ally of localAllies) {
          if (!ally.shieldBuffRemaining || ally.shieldBuffRemaining < 1.0) {
            ally.shieldBuffRemaining = 3.0; // 3 seconds shield
          }
        }

        // Guardian prioritizes defending the home base or the Queen, then nearby allies
        const distToBase = Vector.dist(ant.position, basePos);
        const enemiesNearBase = this.grid.getNearby(basePos, 500).filter(e => this.isEntityVisible(ant, e));

        if (enemiesNearBase.length > 0) {
          const target = enemiesNearBase[0];
          const dir = Vector.normalize(Vector.sub(target.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * 1.1 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 2.5);
          
          if (Vector.dist(ant.position, target.position) < 22) {
            const damage = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
            this.applyDamage(ant, target, damage, faction);
            ant.velocity = { x: 0, y: 0 };
          }
          ant.state = 'ATTACKING';
          return;
        }

        // If base is clear but allies are in danger: seek nearby combat
        const nearbyEnemies = this.grid.getNearby(ant.position, upgradedScanRadius).filter(e => this.isEntityVisible(ant, e));
        if (nearbyEnemies.length > 0) {
          const target = nearbyEnemies[0];
          const dir = Vector.normalize(Vector.sub(target.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 2);
          
          if (Vector.dist(ant.position, target.position) < 22) {
            const damage = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
            this.applyDamage(ant, target, damage, faction);
            ant.velocity = { x: 0, y: 0 };
          }
          ant.state = 'ATTACKING';
          return;
        }

        // Return or tether to base if too far (Guardian stays home to protect)
        if (distToBase > 200) {
          const dirToBase = Vector.normalize(Vector.sub(basePos, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, upgradedSpeed), dt * 1.5);
          return;
        }
      }

      if (ant.type === EntityType.ACID_SPITTER) {
        const attackRange = 120; // Ranged spit!
        const nearbyEnemies = this.grid.getNearby(ant.position, upgradedScanRadius * 1.3).filter(e => this.isEntityVisible(ant, e));
        
        let targetEnemy: EntityState | null = null;
        if (nearbyEnemies.length > 0) {
          const unacidified = nearbyEnemies.filter(e => !e.acidDurationRemaining || e.acidDurationRemaining < 1);
          targetEnemy = unacidified.length > 0 ? unacidified[0] : nearbyEnemies[0];
        }

        if (targetEnemy) {
          const distToEnemy = Vector.dist(ant.position, targetEnemy.position);
          const dir = Vector.normalize(Vector.sub(targetEnemy.position, ant.position));

          if (distToEnemy > attackRange - 20) {
            // Chase to spit range
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * 1.1 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 2);
          } else if (distToEnemy < attackRange - 50) {
            // Keep length distance, backpedal slightly to kite enemies!
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, -upgradedSpeed * 0.7), dt * 1.5);
          } else {
            // Stay stationary & focus aim spit
            ant.velocity = Vector.lerp(ant.velocity, { x: 0, y: 0 }, dt * 4);
          }

          if (distToEnemy <= attackRange) {
            const sprayDmg = upgradedDamage * 0.4 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
            this.applyDamage(ant, targetEnemy, sprayDmg, faction);

            // Apply Sticky Corrosive Acid
            targetEnemy.acidDurationRemaining = 4.0; 
            targetEnemy.acidDamagePerSecond = upgradedDamage * 0.8 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS);
            targetEnemy.acidSourceFactionId = faction.id;
          }
          ant.state = 'ATTACKING';
          return;
        }

        // attack base fallback
        const rivalFactions = this.factions.filter(f => f.id !== faction.id && !f.isDead);
        if (rivalFactions.length > 0) {
          const targetBase = rivalFactions.reduce((prev, curr) => (curr.health < prev.health) ? curr : prev);
          const distToTargetBase = Vector.dist(ant.position, targetBase.basePosition);
          if (distToTargetBase < attackRange) {
            const damage = upgradedDamage * 0.6 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt * siegeBonus;
            this.applyDamage(ant, targetBase as any, damage, faction);
            ant.velocity = { x: 0, y: 0 };
            return;
          } else if (faction.personality.aggressiveness > 0.3) {
            const dirToBase = Vector.normalize(Vector.sub(targetBase.basePosition, ant.position));
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt);
            return;
          }
        }
      }

      if (ant.type === EntityType.TITAN) {
        const nearbyEnemies = this.grid.getNearby(ant.position, upgradedScanRadius).filter(e => this.isEntityVisible(ant, e));
        if (nearbyEnemies.length > 0) {
          const target = nearbyEnemies[0];
          const dir = Vector.normalize(Vector.sub(target.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 2);
          
          if (Vector.dist(ant.position, target.position) < 25) {
            // Mega slash with SPLASH DAMAGE to all enemies in 40px radius!
            const hitRadius = 40;
            const splashTargets = this.grid.getNearby(ant.position, hitRadius).filter(e => this.isEntityVisible(ant, e));
            
            for (const splashTarget of splashTargets) {
              const dmg = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
              this.applyDamage(ant, splashTarget, dmg, faction);

              // 20% Chance to stun on titan crash landing!
              if (Math.random() < 0.20 && splashTarget.type !== EntityType.QUEEN) {
                splashTarget.stunDurationRemaining = 1.0; 
              }
            }
            ant.velocity = { x: 0, y: 0 };
          }
          ant.state = 'ATTACKING';
          return;
        }

        // Titan heavy base breaker
        const rivalFactions = this.factions.filter(f => f.id !== faction.id && !f.isDead);
        if (rivalFactions.length > 0) {
          const targetBase = rivalFactions.reduce((prev, curr) => (curr.health < prev.health) ? curr : prev);
          const distToTargetBase = Vector.dist(ant.position, targetBase.basePosition);
          if (distToTargetBase < 60) {
            const damage = upgradedDamage * 1.5 * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt * 0.8 * siegeBonus;
            this.applyDamage(ant, targetBase as any, damage, faction);
            ant.velocity = { x: 0, y: 0 };
            return;
          } else if (faction.personality.aggressiveness > 0.3) {
            const dirToBase = Vector.normalize(Vector.sub(targetBase.basePosition, ant.position));
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt);
            return;
          }
        }
      }

      if (ant.type === EntityType.SHADOW_STRIKER) {
        const nearbyEnemies = this.grid.getNearby(ant.position, upgradedScanRadius).filter(e => this.isEntityVisible(ant, e));
        if (nearbyEnemies.length > 0) {
          const enemy = nearbyEnemies[0];
          const dir = Vector.normalize(Vector.sub(enemy.position, ant.position));
          // Fast assassin movement
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * 1.4), dt * 3.5);
          if (Vector.dist(ant.position, enemy.position) < 20) {
            const damage = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
            this.applyDamage(ant, enemy, damage, faction);
          }
          ant.state = 'ATTACKING';
          return;
        }
      }

      if (ant.type === EntityType.VOID_TUNNELER) {
        const nearbyEnemies = this.grid.getNearby(ant.position, 100).filter(e => this.isEntityVisible(ant, e));
        if (nearbyEnemies.length > 0 && Math.random() < 0.02) {
          // Blink/Tunnel away!
          ant.position.x += (Math.random() - 0.5) * 350;
          ant.position.y += (Math.random() - 0.5) * 350;
        }
        const scanRadius = upgradedScanRadius * 1.3;
        const enemies = this.grid.getNearby(ant.position, scanRadius).filter(e => this.isEntityVisible(ant, e));
        if (enemies.length > 0) {
          const target = enemies[0];
          const dir = Vector.normalize(Vector.sub(target.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed), dt * 2);
          if (Vector.dist(ant.position, target.position) < 25) {
            this.applyDamage(ant, target, upgradedDamage * dt, faction);
          }
          ant.state = 'ATTACKING';
          return;
        }
      }

      if (ant.type === EntityType.SHIELD_BEARER) {
        // Buff nearby allies
        const pulseRadius = 150;
        const allies = this.grid.getNearby(ant.position, pulseRadius).filter(e => e && e.factionId === faction.id && e.id !== ant.id);
        allies.forEach(a => {
          if (!a.shieldBuffRemaining || a.shieldBuffRemaining < 2) a.shieldBuffRemaining = 4;
        });

        const targets = this.grid.getNearby(ant.position, upgradedScanRadius).filter(e => this.isEntityVisible(ant, e));
        if (targets.length > 0) {
          const enemy = targets[0];
          const dir = Vector.normalize(Vector.sub(enemy.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed), dt * 2);
          if (Vector.dist(ant.position, enemy.position) < 20) {
            this.applyDamage(ant, enemy, upgradedDamage * dt, faction);
          }
          ant.state = 'ATTACKING';
          return;
        }
      }

      if (ant.type === EntityType.SAPPER) {
        const rivalFactions = this.factions.filter(f => f.id !== faction.id && !f.isDead);
        if (rivalFactions.length > 0) {
          const targetBase = rivalFactions.reduce((prev, curr) => (curr.health < prev.health) ? curr : prev);
          const distToTargetBase = Vector.dist(ant.position, targetBase.basePosition);
          if (distToTargetBase < 50) {
            this.applyDamage(ant, targetBase as any, upgradedDamage * 2.5 * dt * siegeBonus, faction);
            ant.velocity = { x: 0, y: 0 };
            return;
          } else {
            const dirToBase = Vector.normalize(Vector.sub(targetBase.basePosition, ant.position));
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, upgradedSpeed * 1.2), dt * 2);
            return;
          }
        }
      }

      if (ant.type === EntityType.BLOOD_PRIEST) {
        const enemies = this.grid.getNearby(ant.position, upgradedScanRadius).filter(e => this.isEntityVisible(ant, e));
        if (enemies.length > 0) {
          const target = enemies[0];
          const dir = Vector.normalize(Vector.sub(target.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed), dt * 2);
          if (Vector.dist(ant.position, target.position) < 20) {
            this.applyDamage(ant, target, upgradedDamage * dt, faction);
          }
          ant.state = 'ATTACKING';
          return;
        }
      }
      if (ant.type === EntityType.WARRIOR) {
        const isBaseUnderAttack = faction.health < faction.maxHealth;
        const defensePriority = isBaseUnderAttack ? 0.9 : faction.personality.defenseFocus;

        // 0. ESCORT DUTY: Stay with worker and defend it
        if (ant.workerId) {
          const worker = this.entities.find(e => e && e.id === ant.workerId);
          if (worker) {
            const distToWorker = Vector.dist(ant.position, worker.position);
            
            // Defend worker if enemy is nearby
            const targetsNearWorker = this.grid.getNearby(worker.position, 100).filter(e => this.isEntityVisible(ant, e));
            if (targetsNearWorker.length > 0) {
              const target = targetsNearWorker[0];
              const dir = Vector.normalize(Vector.sub(target.position, ant.position));
              ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 3);
              if (Vector.dist(ant.position, target.position) < 20) {
                const damage = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
                this.applyDamage(ant, target, damage, faction);
                ant.velocity = { x: 0, y: 0 };
              }
              return;
            }

            // Follow worker
            if (distToWorker > 30) {
              const dirToWorker = Vector.normalize(Vector.sub(worker.position, ant.position));
              ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToWorker, upgradedSpeed), dt * 2);
              return;
            } else {
              // If very close, just match worker direction but slower to avoid jitter
              ant.velocity = Vector.lerp(ant.velocity, worker.velocity, dt);
              return;
            }
          } else {
            ant.workerId = undefined;
          }
        }

        // 1. Warriors check for defense first if base is under threat or high defense focus
        if (defensePriority > 0.4) {
          const enemiesNearBase = this.grid.getNearby(basePos, 400).filter(e => this.isEntityVisible(ant, e));
          if (enemiesNearBase.length > 0) {
            const target = enemiesNearBase[0];
            const dir = Vector.normalize(Vector.sub(target.position, ant.position));
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 2);
            if (Vector.dist(ant.position, target.position) < 20) {
              const damage = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
              this.applyDamage(ant, target, damage, faction);
              ant.velocity = { x: 0, y: 0 };
            }
            return;
          }
          
          // Return to base to guard if nothing nearby but base was hit
          if (isBaseUnderAttack && Vector.dist(ant.position, basePos) > 150) {
            const dirToBase = Vector.normalize(Vector.sub(basePos, ant.position));
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, upgradedSpeed), dt);
            return;
          }
        }

        // 2. Scan and fight nearby enemies to protect territory/movement
        const nearbyEnemies = this.grid.getNearby(ant.position, upgradedScanRadius).filter(e => this.isEntityVisible(ant, e));
        if (nearbyEnemies.length > 0) {
          const enemy = nearbyEnemies[0];
          const dir = Vector.normalize(Vector.sub(enemy.position, ant.position));
          ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dir, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt * 2);
          if (Vector.dist(ant.position, enemy.position) < 20) {
            const damage = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt;
            this.applyDamage(ant, enemy, damage, faction);
            ant.velocity = { x: 0, y: 0 };
          }
          return;
        }

        // 3. Centralized Coordinated Strike Behavior
        if (faction.attackPlan) {
          const plan = faction.attackPlan;
          if (plan.stage === 'RALLYING') {
            const distToRally = Vector.dist(ant.position, plan.rallyPoint);
            if (distToRally > 85) {
              // March to rally point
              const dirToRally = Vector.normalize(Vector.sub(plan.rallyPoint, ant.position));
              ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToRally, upgradedSpeed), dt * 1.5);
            } else {
              // Wait and patrol/wander in the rally zone
              ant.rotation += (Math.random() - 0.5) * 0.5;
              const wanderVel = { x: Math.cos(ant.rotation), y: Math.sin(ant.rotation) };
              const toRally = Vector.sub(plan.rallyPoint, ant.position);
              const dist = Vector.mag(toRally);
              const steer = dist > 70 ? Vector.normalize(toRally) : wanderVel;
              ant.velocity = Vector.lerp(ant.velocity, Vector.mul(steer, upgradedSpeed * 0.4), dt);
            }
            ant.state = 'ATTACKING';
            return;
          } else if (plan.stage === 'ATTACKING') {
            const targetBase = this.factions.find(rf => rf.id === plan.targetFactionId);
            if (targetBase && !targetBase.isDead) {
              const distToTargetBase = Vector.dist(ant.position, targetBase.basePosition);
              
              if (distToTargetBase < 60) {
                // Attacking the base
                const damage = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt * 0.8 * siegeBonus;
                this.applyDamage(ant, targetBase as any, damage, faction);
                ant.velocity = { x: 0, y: 0 };
              } else {
                // March to target, with cohesion/formation force
                let marchDir = Vector.normalize(Vector.sub(targetBase.basePosition, ant.position));
                
                // Get other allied warriors closely marching
                const allies = this.grid.getNearby(ant.position, 180).filter(e => e && e.factionId === faction.id && e.type === EntityType.WARRIOR && e.id !== ant.id);
                if (allies.length > 0) {
                  let sumX = 0, sumY = 0;
                  for (const ally of allies) {
                    sumX += ally.position.x;
                    sumY += ally.position.y;
                  }
                  const avgPos = { x: sumX / allies.length, y: sumY / allies.length };
                  const cohesionDir = Vector.normalize(Vector.sub(avgPos, ant.position));
                  // Coordination level enhances pheromone alignment & marching cohesion
                  const cohesionWeight = Math.min(0.70, 0.25 + upgrades.coordination * 0.12);
                  const targetWeight = 1 - cohesionWeight;
                  marchDir = Vector.normalize(Vector.add(Vector.mul(marchDir, targetWeight), Vector.mul(cohesionDir, cohesionWeight)));
                }
                
                ant.velocity = Vector.lerp(ant.velocity, Vector.mul(marchDir, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt);
              }
              ant.state = 'ATTACKING';
              return;
            }
          }
        }

        // 4. Default Fallback behavior if no central plan
        const rivalFactions = this.factions.filter(f => f.id !== faction.id && !f.isDead);
        if (rivalFactions.length > 0) {
          const targetBase = rivalFactions.reduce((prev, curr) => (curr.health < prev.health) ? curr : prev);
          const distToTargetBase = Vector.dist(ant.position, targetBase.basePosition);
          
          if (distToTargetBase < 60) {
            const damage = upgradedDamage * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS) * dt * 0.8 * siegeBonus;
            this.applyDamage(ant, targetBase as any, damage, faction);
            ant.velocity = { x: 0, y: 0 };
            return;
          } else if (faction.personality.aggressiveness > 0.3) {
            const dirToBase = Vector.normalize(Vector.sub(targetBase.basePosition, ant.position));
            ant.velocity = Vector.lerp(ant.velocity, Vector.mul(dirToBase, upgradedSpeed * (1 + (ant.level - 1) * SIM_CONFIG.LEVEL_STAT_BONUS)), dt);
            return;
          }
        }
      }

      // Default: Wander/Forage with a slight centering bias to prevent clustering at edges
      ant.rotation += (Math.random() - 0.5) * 0.5;
      const wanderVel = { x: Math.cos(ant.rotation), y: Math.sin(ant.rotation) };
      
      // Calculate a centering force that gets stronger as ants move away from the origin
      const toCenter = Vector.normalize(Vector.sub({ x: 0, y: 0 }, ant.position));
      const distFromCenter = Vector.mag(ant.position);
      const centeringBias = Math.min(0.6, (distFromCenter / (SIM_CONFIG.WORLD_SIZE / 2)) * 0.5);
      
      const mixedDir = Vector.normalize(Vector.add(
        Vector.mul(wanderVel, 1 - centeringBias),
        Vector.mul(toCenter, centeringBias)
      ));
      
      ant.velocity = Vector.lerp(ant.velocity, Vector.mul(mixedDir, upgradedSpeed), dt);
      ant.state = 'FORAGING';
    }

    // decisive boundary avoidance
    const halfSize = SIM_CONFIG.WORLD_SIZE / 2;
    const margin = 40;
    if (Math.abs(ant.position.x) > halfSize - margin || Math.abs(ant.position.y) > halfSize - margin) {
      const toCenter = Vector.normalize(Vector.sub({ x: 0, y: 0 }, ant.position));
      // Forcefully redirect towards center if too close to the "edge of the world"
      ant.velocity = Vector.lerp(ant.velocity, Vector.mul(toCenter, upgradedSpeed), dt * 10);
      
      // Clamp position to ensure they don't escape
      ant.position.x = Math.max(-halfSize, Math.min(halfSize, ant.position.x));
      ant.position.y = Math.max(-halfSize, Math.min(halfSize, ant.position.y));
    }
  }
}

