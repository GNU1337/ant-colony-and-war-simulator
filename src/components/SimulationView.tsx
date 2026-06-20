/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera } from '../simulation/Camera';
import { World, getUpgradeCost } from '../simulation/World';
import { Vector } from '../simulation/Vector';
import { SIM_CONFIG } from '../types';

const SAVE_KEY = 'ant_kingdom_save';

import { Faction, WorldEvent } from '../types';
import { AreaChart, Area, BarChart, Bar, Cell, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  listWargameFiles, 
  saveReportFileToDrive, 
  saveStateFileToDrive, 
  loadWargameStateFile, 
  loadWargameTextFile, 
  deleteWargameFile, 
  DriveFile 
} from '../lib/drive';
import { User } from 'firebase/auth';

export const SimulationView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [briefingReport, setBriefingReport] = useState<string | null>(null);
  const [activeNotifications, setActiveNotifications] = useState<WorldEvent[]>([]);

  // Initialize World from localStorage or fresh
  const initWorld = () => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.factions && data.entities) {
          return new World(data);
        }
      }
    } catch (e) {
      console.error('Failed to load save:', e);
    }
    return new World();
  };

  const [dimensions, setDimensions] = useState(() => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const targetAspect = 16 / 9;
    const currentAspect = winW / winH;
    if (currentAspect > targetAspect) {
      return { width: Math.round(winH * targetAspect), height: winH };
    } else {
      return { width: winW, height: Math.round(winW / targetAspect) };
    }
  });

  const worldRef = useRef<World>(initWorld());
  const cameraRef = useRef<Camera>(new Camera(dimensions.width, dimensions.height));
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'ENTITY' | 'RESOURCE' | 'BASE' | null>(null);
  const [tick, setTick] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [endWinner, setEndWinner] = useState<Faction | null>(null);

  const isGameOverRef = useRef(false);

  const [panelPos, setPanelPos] = useState<{ x: number | null; y: number | null }>(() => {
    try {
      const saved = localStorage.getItem('ant_sim_inspector_pos_absolute');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return { x: null, y: null };
  });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const dragStartOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }
    
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const container = panelRef.current.parentElement;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const currentX = rect.left - containerRect.left;
        const currentY = rect.top - containerRect.top;
        
        dragStartOffset.current = {
          x: e.clientX - currentX,
          y: e.clientY - currentY
        };
        setIsDraggingPanel(true);
        panelRef.current.setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPanel) return;
    if (panelRef.current) {
      const container = panelRef.current.parentElement;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const nextX = e.clientX - dragStartOffset.current.x;
        const nextY = e.clientY - dragStartOffset.current.y;
        
        const rect = panelRef.current.getBoundingClientRect();
        const maxX = containerRect.width - rect.width;
        const maxY = containerRect.height - rect.height;
        const boundedX = Math.max(0, Math.min(maxX, nextX));
        const boundedY = Math.max(0, Math.min(maxY, nextY));

        const newPos = { x: boundedX, y: boundedY };
        setPanelPos(newPos);
        localStorage.setItem('ant_sim_inspector_pos_absolute', JSON.stringify(newPos));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingPanel) {
      setIsDraggingPanel(false);
      if (panelRef.current) {
        panelRef.current.releasePointerCapture(e.pointerId);
      }
    }
  };

  const [isPaused, setIsPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [globalSpeedMultiplier, setGlobalSpeedMultiplier] = useState(1);
  const [isLeaderboardExpanded, setIsLeaderboardExpanded] = useState(false);
  const [showPopulationChart, setShowPopulationChart] = useState(false);
  const [showPowerChart, setShowPowerChart] = useState(false);
  const [isFactionsExpanded, setIsFactionsExpanded] = useState(false);
  const [showHud, setShowHud] = useState(false);
  const [computedFps, setComputedFps] = useState(0);

  // Google Drive Integration State
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [showDrivePanel, setShowDrivePanel] = useState(false);
  const [driveStatus, setDriveStatus] = useState<string | null>(null);

  const isPausedRef = useRef(isPaused);
  const timeScaleRef = useRef(timeScale);
  const globalSpeedMultiplierRef = useRef(globalSpeedMultiplier);

  // Sync refs with state for the render loop
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    globalSpeedMultiplierRef.current = globalSpeedMultiplier;
  }, [globalSpeedMultiplier]);

  // Sync notifications from World simulation state to React state regularly
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;

    const now = Date.now();
    const freshEvents = world.events.filter(e => now - e.timestamp < 6000);

    setActiveNotifications(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const added = freshEvents.filter(e => !existingIds.has(e.id));
      if (added.length === 0) {
        return prev.filter(e => now - e.timestamp < 6000);
      }
      return [...prev, ...added].filter(e => now - e.timestamp < 6000);
    });
  }, [tick]);

  // Google Drive Handlers
  const refreshDriveFiles = async (token: string) => {
    setIsDriveLoading(true);
    try {
      const files = await listWargameFiles(token);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Failed to retrieve drive files:', err);
      setDriveStatus(`Error fetching files: ${err.message || err}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setDriveToken(token);
        refreshDriveFiles(token);
      },
      () => {
        setGoogleUser(null);
        setDriveToken(null);
        setDriveFiles([]);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    setIsDriveLoading(true);
    setDriveStatus('Connecting to Google Drive...');
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setDriveToken(result.accessToken);
        setDriveStatus('Google Drive authenticated successfully.');
        await refreshDriveFiles(result.accessToken);
      }
    } catch (err: any) {
      console.error('Sign in failed:', err);
      setDriveStatus(`Connection failed: ${err.message || err}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    setIsDriveLoading(true);
    try {
      await logout();
      setGoogleUser(null);
      setDriveToken(null);
      setDriveFiles([]);
      setDriveStatus('Disconnected from Google Drive.');
    } catch (err: any) {
      console.error('Sign out failed:', err);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const saveStateToGoogleDrive = async () => {
    if (!driveToken) return;
    setIsDriveLoading(true);
    setDriveStatus('Analyzing simulation timeline...');
    try {
      const stateObj = worldRef.current.serialize();
      const now = new Date();
      const dateStr = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const fileName = `ant_simulation_backup_${dateStr}.json`;
      
      await saveStateFileToDrive(driveToken, fileName, stateObj);
      setDriveStatus(`Simulation state successfully protected in Drive: ${fileName}`);
      await refreshDriveFiles(driveToken);
    } catch (err: any) {
      console.error('Save state failed:', err);
      setDriveStatus(`Save state failed: ${err.message || err}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const saveReportToGoogleDrive = async () => {
    if (!driveToken) return;
    setIsDriveLoading(true);
    setDriveStatus('Drafting medieval field records...');
    try {
      const data = getCollectionStats();
      let md = `# Ant Kingdom Medieval Biological Report\n\n`;
      md += `*Compiled at military chronometer: ${new Date().toLocaleString()}*\n\n`;
      md += `This record preserves the structural dynamics and logistics of the active ant colonies in combat space.\n\n`;

      data.factions.forEach(f => {
        md += `## 🛡️ Kingdom: ${f.name}\n`;
        md += `- **Combat Vanguard Rank**: Warrior Units Recruited: ${f.warriorsProduced} | Fallen Regiments: ${f.warriorsLost} | Kill Count: ${f.kills}\n`;
        md += `- **Sustenance & Logistics**: Working Ants Mobilized: ${f.workersProduced} | Losses: ${f.workersLost}\n`;
        md += `- **Inbound Logistical Output**: ${f.incomePerMin} resource gold coins/minute\n`;
        md += `- **Outbound Logistical Costs**: ${f.expensePerMin} resource gold coins/minute\n\n`;
      });

      md += `---\n### 📊 System-wide Operations Metrics\n\n`;
      md += `- **Total Active Population**: ${data.global.totalPop} ants\n`;
      md += `- **Vanguard Kill/Death Ratio**: ${data.global.warriorKDR}\n`;
      md += `- **Logistical Kill/Death Ratio**: ${data.global.workerKDR}\n`;

      const count = driveFiles.filter(f => f.name.startsWith('ant_report_') && f.name.endsWith('.md')).length + 1;
      const fileName = `ant_report_volume_${count.toString().padStart(3, '0')}.md`;

      await saveReportFileToDrive(driveToken, fileName, md);
      setDriveStatus(`Biological dispatch filed to Drive: ${fileName}`);
      await refreshDriveFiles(driveToken);
    } catch (err: any) {
      console.error('Save report failed:', err);
      setDriveStatus(`Report filing failed: ${err.message || err}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const loadStateFromGoogleDrive = async (fileId: string, name: string) => {
    if (!driveToken) return;
    const confirmed = window.confirm(`Load simulation state '${name}' from Drive? This will overwrite the current simulation.`);
    if (!confirmed) return;

    setIsDriveLoading(true);
    setDriveStatus('Re-constructing neural colony network...');
    try {
      const stateObj = await loadWargameStateFile(driveToken, fileId);
      if (stateObj && stateObj.factions && stateObj.entities) {
        localStorage.setItem(SAVE_KEY, JSON.stringify(stateObj));
        worldRef.current = new World(stateObj);
        
        setSelectedId(null);
        setSelectedType(null);
        setIsPaused(false);
        setTick(t => t + 1);
        
        setDriveStatus(`Simulation state successfully synched: ${name}`);
        setShowDrivePanel(false);
      } else {
        throw new Error('Save state data structure mismatch');
      }
    } catch (err: any) {
      console.error('Restore state failed:', err);
      setDriveStatus(`Restore failed: ${err.message || err}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const loadReportFromGoogleDrive = async (fileId: string, name: string) => {
    if (!driveToken) return;
    setIsDriveLoading(true);
    setDriveStatus('Translating parchment scroll...');
    try {
      const markdown = await loadWargameTextFile(driveToken, fileId);
      setBriefingReport(markdown);
      setDriveStatus(`Dispatched report loaded: ${name}`);
      setShowDrivePanel(false);
    } catch (err: any) {
      console.error('Load report failed:', err);
      setDriveStatus(`Load report failed: ${err.message || err}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const deleteFileFromGoogleDrive = async (fileId: string, name: string) => {
    if (!driveToken) return;
    const confirmed = window.confirm(`Trash file '${name}' from your Google Drive folder?`);
    if (!confirmed) return;

    setIsDriveLoading(true);
    setDriveStatus('Consuming file records...');
    try {
      await deleteWargameFile(driveToken, fileId);
      setDriveStatus(`Successfully eradicated: ${name}`);
      await refreshDriveFiles(driveToken);
    } catch (err: any) {
      console.error('Delete failed:', err);
      setDriveStatus(`Eradication failed: ${err.message || err}`);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const resetWorld = () => {
    localStorage.removeItem(SAVE_KEY);
    worldRef.current = new World();
    setSelectedId(null);
    setSelectedType(null);
    setIsPaused(false);
    setTimeScale(1);
    setTick(t => t + 1);
  };

  // Periodic Save
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (!isPausedRef.current) {
        const state = worldRef.current.serialize();
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      }
    }, 5000); // Save every 5 seconds

    return () => clearInterval(saveInterval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime: number | null = null;
    let frameCount = 0;
    let fpsInterval = 0;

    const render = (time: number) => {
      if (lastTime === null) {
        lastTime = time;
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // Update FPS UI every 30 frames
      fpsInterval++;
      if (fpsInterval >= 30) {
        setComputedFps(Math.round(1 / dt));
        fpsInterval = 0;
      }

      const world = worldRef.current;
      if (!world) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      const camera = cameraRef.current;
      
      // Update camera dimensions (safety check)
      camera.width = canvas.width;
      camera.height = canvas.height;
      
      // 1. Logic Update (Respect pause and speed)
      if (!isPausedRef.current && !isGameOverRef.current) {
        // Clamp dt to avoid huge jumps after tab inactivity
        const clampedDt = Math.min(dt, 0.1);
        world.update(clampedDt * timeScaleRef.current, globalSpeedMultiplierRef.current);

        // Check for victory condition
        const activeFactions = world.factions.filter(f => !f.isDead);
        if (activeFactions.length <= 1 && world.factions.length > 1) {
          setIsGameOver(true);
          setEndWinner(activeFactions[0] || null);
          isGameOverRef.current = true;
        }
      }
      
      // 2. Render setup
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      camera.applyTransform(ctx);

      // UI update trigger
      frameCount++;
      if (frameCount % 10 === 0) {
        setTick(t => t + 1);
      }

      // --- RITNING ---

      // 1. World Border
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.strokeRect(
        -SIM_CONFIG.WORLD_SIZE / 2, 
        -SIM_CONFIG.WORLD_SIZE / 2, 
        SIM_CONFIG.WORLD_SIZE, 
        SIM_CONFIG.WORLD_SIZE
      );

      // 1.5 Render Territory Influence
      const cellSize = SIM_CONFIG.TERRITORY_CELL_SIZE;
      const halfWorld = SIM_CONFIG.WORLD_SIZE / 2;
      world.influenceGrid.forEach((cell, i) => {
        if (!cell || !cell.factionId || cell.strength <= 0) return;
        
        const gx = i % world.gridDim;
        const gy = Math.floor(i / world.gridDim);
        const faction = world.factions.find(f => f.id === cell.factionId);
        if (!faction) return;

        ctx.fillStyle = faction.color + Math.floor(Math.min(cell.strength, 60)).toString(16).padStart(2, '0');
        ctx.fillRect(
          gx * cellSize - halfWorld,
          gy * cellSize - halfWorld,
          cellSize,
          cellSize
        );
      });

      // 2. Faction Bases (Mounds)
      world.factions.forEach((faction) => {
        if (faction.isDead || !faction.basePosition) return;
        
        const basePos = faction.basePosition;
        
        // Draw Mound
        ctx.fillStyle = faction.color;
        ctx.beginPath();
        // Create a slightly jagged circle for a 'mound' look
        for (let i = 0; i < 32; i++) {
          const angle = (i / 32) * Math.PI * 2;
          const r = 25 + Math.sin(angle * 4 + faction.age) * 3;
          const x = basePos.x + Math.cos(angle) * r;
          const y = basePos.y + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.stroke();

        // Inner detail
        ctx.beginPath();
        ctx.arc(basePos.x, basePos.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Mound Health Bar
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(basePos.x - 35, basePos.y - 45, 70, 8);
        const healthPercent = faction.health / faction.maxHealth;
        ctx.fillStyle = healthPercent > 0.5 ? '#4ade80' : healthPercent > 0.2 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(basePos.x - 35, basePos.y - 45, 70 * healthPercent, 8);
        // Border for health bar
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1 / camera.zoom;
        ctx.strokeRect(basePos.x - 35, basePos.y - 45, 70, 8);

        // Colony Name
        ctx.fillStyle = 'white';
        ctx.font = `bold ${14 / camera.zoom}px Inter`;
        ctx.textAlign = 'center';
        ctx.fillText(faction.name, basePos.x, basePos.y - 50);
      });

      // 3. Resources (Circles)
      ctx.fillStyle = '#4ade80'; // Emerald Green
      world.resources.forEach(res => {
        if (res.amount <= 0) return;
        ctx.beginPath();
        ctx.arc(res.position.x, res.position.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      // 4. Ants (Entities)
      world.entities.forEach(ant => {
        if (!ant || !ant.position) return;
        const faction = world.factions.find(f => f.id === ant.factionId);
        if (!faction) return;

        ctx.save();
        ctx.translate(ant.position.x, ant.position.y);
        ctx.rotate(Math.atan2(ant.velocity.y, ant.velocity.x));

        // Rita hälsa om skadad (smaller and green, displayed above)
        if (ant.health < ant.maxHealth) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(-8, -13, 16, 2.5);
          ctx.fillStyle = '#22c55e'; // Green health
          ctx.fillRect(-8, -13, 16 * Math.max(0, Math.min(1, ant.health / ant.maxHealth)), 2.5);
        }

        // Rita kroppen
        ctx.fillStyle = faction.color;
        if (ant.isDead) ctx.fillStyle = '#444'; // This shouldn't happen but just in case

        if (ant.type === 'QUEEN') {
          // Drottningen är en stor diamant
          ctx.beginPath();
          ctx.moveTo(12, 0);
          ctx.lineTo(0, 12);
          ctx.lineTo(-12, 0);
          ctx.lineTo(0, -12);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (ant.type === 'BERSERKER') {
          // Berserker has a segmented power body with dual red twin claws
          ctx.beginPath();
          ctx.arc(-6, 0, 4.5, 0, Math.PI * 2);
          ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ef4444'; // Hot red razor mandibles
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(3, -4);
          ctx.lineTo(10, -6);
          ctx.lineTo(6, -1);
          ctx.moveTo(3, 4);
          ctx.lineTo(10, 6);
          ctx.lineTo(6, 1);
          ctx.stroke();

          if (ant.state === 'ATTACKING') {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else if (ant.type === 'GUARDIAN') {
          // Guardian is chunky and has a bulky rear shielding plate
          ctx.beginPath();
          ctx.rect(-9, -6, 6, 12); // Shield block
          ctx.arc(1, 0, 4, 0, Math.PI * 2); // Thorax
          ctx.fill();

          // Steel white crest around head
          ctx.strokeStyle = '#f1f5f9';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(2, 0, 6, -Math.PI / 3, Math.PI / 3);
          ctx.stroke();
        } else if (ant.type === 'ACID_SPITTER') {
          // Acid spitter has an elongated bulbous tank and neon green mouth emitter
          ctx.beginPath();
          ctx.ellipse(-7, 0, 6, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Acid nozzle
          ctx.fillStyle = '#84cc16';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();

          // Spitter nozzle lines
          ctx.strokeStyle = '#84cc16';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(1, 0);
          ctx.lineTo(9, 0);
          ctx.stroke();
        } else if (ant.type === 'TITAN') {
          // Titan is a giant armored heavy unit
          ctx.scale(1.4, 1.4);

          ctx.beginPath();
          ctx.arc(-6, 0, 5.5, 0, Math.PI * 2);
          ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
          ctx.fill();

          // Massive crushing horns
          ctx.strokeStyle = faction.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(2, -3);
          ctx.quadraticCurveTo(8, -6, 10, -2);
          ctx.moveTo(2, 3);
          ctx.quadraticCurveTo(8, 6, 10, 2);
          ctx.stroke();
        } else if (ant.type === 'WARRIOR') {
          // Krigare är trianglar
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(-8, -6);
          ctx.lineTo(-8, 6);
          ctx.closePath();
          ctx.fill();
          
          if (ant.state === 'ATTACKING') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        } else if (ant.type === 'POISONER') {
          // oo> design!
          ctx.beginPath();
          ctx.arc(-8, 0, 4, 0, Math.PI * 2);
          ctx.arc(-1, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.beginPath();
          ctx.moveTo(3, 4);
          ctx.lineTo(9, 0);
          ctx.lineTo(3, -4);
          ctx.strokeStyle = faction.color;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#a855f7'; // Purple toxic core
          ctx.beginPath();
          ctx.arc(-1, 0, 1.5, 0, Math.PI * 2);
          ctx.fill();

          if (ant.state === 'ATTACKING') {
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(-1, 0, 9, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          // Arbetare är prickar/små cirklar
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          
          // Om den bär mat, rita en grön punkt
          if (ant.load > 0) {
            ctx.fillStyle = '#4ade80';
            ctx.beginPath();
            ctx.arc(3.5, 0, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Draw active buffs/debuffs overlays
        if (ant.shieldBuffRemaining && ant.shieldBuffRemaining > 0) {
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)'; // beautiful glowing cyan shield
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, 11, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (ant.stunDurationRemaining && ant.stunDurationRemaining > 0) {
          // Draw yellow dizzy star / stun effect
          ctx.fillStyle = '#eab308';
          ctx.beginPath();
          ctx.arc(3, -9, 1.5, 0, Math.PI * 2);
          ctx.arc(-3, -10, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (ant.poisonDurationRemaining && ant.poisonDurationRemaining > 0) {
          ctx.fillStyle = 'rgba(168, 85, 247, 0.3)'; // Purple haze
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#a855f7';
          ctx.beginPath();
          ctx.arc(-4, -6, 1.2, 0, Math.PI * 2);
          ctx.arc(4, 5, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        if (ant.acidDurationRemaining && ant.acidDurationRemaining > 0) {
          ctx.fillStyle = 'rgba(132, 204, 22, 0.3)'; // Lime/acid haze
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#84cc16';
          ctx.beginPath();
          ctx.arc(5, -4, 1.2, 0, Math.PI * 2);
          ctx.arc(-4, 5, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.restore();
      });

      // 5. Draw Selection Indicator
      if (selectedId) {
        let selPos = null;
        if (selectedType === 'ENTITY') {
          const ent = world.entities.find(e => e && e.id === selectedId);
          if (ent) selPos = ent.position;
        } else {
          const res = world.resources.find(r => r && r.id === selectedId);
          if (res) selPos = res.position;
        }

        if (selPos) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.setLineDash([5 / camera.zoom, 5 / camera.zoom]);
          ctx.beginPath();
          ctx.arc(selPos.x, selPos.y, 20, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };


    const handleResize = () => {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const targetAspect = 16 / 9;
      const currentAspect = winW / winH;

      let canvasW, canvasH;
      if (currentAspect > targetAspect) {
        canvasH = winH;
        canvasW = winH * targetAspect;
      } else {
        canvasW = winW;
        canvasH = winW / targetAspect;
      }

      canvas.width = Math.round(canvasW);
      canvas.height = Math.round(canvasH);
      cameraRef.current.width = canvas.width;
      cameraRef.current.height = canvas.height;
      setDimensions({ width: canvas.width, height: canvas.height });
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    // Click Detection
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const worldPos = cameraRef.current.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const world = worldRef.current;

      // 1. Check Entities
      const nearbyAnts = world.grid.getNearby(worldPos, 20);
      let found = false;
      for (const ant of nearbyAnts) {
        if (Vector.dist(ant.position, worldPos) < 15) {
          setSelectedId(ant.id);
          setSelectedType('ENTITY');
          found = true;
          break;
        }
      }

      // 2. Check Resources
      if (!found) {
        for (const res of world.resources) {
          if (Vector.dist(res.position, worldPos) < 15) {
            setSelectedId(res.id);
            setSelectedType('RESOURCE');
            found = true;
            break;
          }
        }
      }

      if (!found) {
        for (const faction of world.factions) {
          if (faction.isDead || !faction.basePosition) continue;
          if (Vector.dist(faction.basePosition, worldPos) < 30) {
            setSelectedId(faction.id);
            setSelectedType('BASE');
            found = true;
            break;
          }
        }
      }

      if (!found) {
        setSelectedId(null);
        setSelectedType(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const dx = (e.clientX - lastMousePos.current.x) / cameraRef.current.zoom;
    const dy = (e.clientY - lastMousePos.current.y) / cameraRef.current.zoom;
    
    cameraRef.current.position.x -= dx;
    cameraRef.current.position.y -= dy;
    
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
      lastTouchPos.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent scrolling
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1 && lastTouchPos.current) {
      const dx = (e.touches[0].clientX - lastTouchPos.current.x) / cameraRef.current.zoom;
      const dy = (e.touches[0].clientY - lastTouchPos.current.y) / cameraRef.current.zoom;
      
      cameraRef.current.position.x -= dx;
      cameraRef.current.position.y -= dy;
      
      lastTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastTouchDistance.current && lastTouchPos.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Zoom
      const zoomFactor = distance / lastTouchDistance.current;
      const oldZoom = cameraRef.current.zoom;
      const newZoom = Math.min(
        Math.max(oldZoom * zoomFactor, SIM_CONFIG.CAMERA_MIN_ZOOM),
        SIM_CONFIG.CAMERA_MAX_ZOOM
      );
      cameraRef.current.zoom = newZoom;
      lastTouchDistance.current = distance;

      // Pan while zooming
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      const pdx = (centerX - lastTouchPos.current.x) / cameraRef.current.zoom;
      const pdy = (centerY - lastTouchPos.current.y) / cameraRef.current.zoom;
      
      cameraRef.current.position.x -= pdx;
      cameraRef.current.position.y -= pdy;
      lastTouchPos.current = { x: centerX, y: centerY };
    }
  };

  const handleTouchEnd = () => {
    lastTouchDistance.current = null;
    lastTouchPos.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const oldZoom = cameraRef.current.zoom;
    const newZoom = Math.min(
      Math.max(oldZoom * (1 + delta * zoomSpeed), SIM_CONFIG.CAMERA_MIN_ZOOM),
      SIM_CONFIG.CAMERA_MAX_ZOOM
    );
    
    cameraRef.current.zoom = newZoom;
  };

  const getCollectionStats = () => {
    const world = worldRef.current;
    const factions = world.factions.map(f => {
      const minutes = Math.max(1, f.age / 60);
      return {
        name: f.name,
        warriorsProduced: f.stats.warriorsProduced,
        warriorsLost: f.stats.warriorsLost,
        workersProduced: f.stats.workersProduced,
        workersLost: f.stats.workersLost,
        incomePerMin: (f.stats.totalIncome / minutes).toFixed(2),
        expensePerMin: (f.stats.totalExpense / minutes).toFixed(2),
        kills: f.stats.kills
      };
    });

    const totalPop = world.entities.length;
    const totalWarriorKills = world.factions.reduce((sum, f) => sum + f.stats.kills, 0);
    const totalWarriorLosses = world.factions.reduce((sum, f) => sum + f.stats.warriorsLost, 0);
    const totalWorkerLosses = world.factions.reduce((sum, f) => sum + f.stats.workersLost, 0);

    return {
      factions,
      global: {
        totalPop,
        warriorKDR: (totalWarriorKills / Math.max(1, totalWarriorLosses)).toFixed(2),
        workerKDR: (0 / Math.max(1, totalWorkerLosses)).toFixed(2), // Workers don't kill
      }
    };
  };

  const downloadReport = () => {
    const data = getCollectionStats();
    let md = `# Ant Colony Simulation Report\n\n`;
    md += `Generated at: ${new Date().toLocaleString()}\n\n`;

    data.factions.forEach(f => {
      md += `## Kingdom: ${f.name}\n`;
      md += `**Combat Doctrine**: ${f.activeStrategy?.replace('_', ' ') || 'STANDARD'}\n`;
      md += `1. **Warrior Ants**: Produced: ${f.warriorsProduced} | Lost: ${f.warriorsLost} | Kills: ${f.kills}\n`;
      md += `2. **Working Ants**: Produced: ${f.workersProduced} | Lost: ${f.workersLost}\n`;
      md += `3. **Income p/m**: ${f.incomePerMin} resources\n`;
      md += `4. **Expenses p/m**: ${f.expensePerMin} resources\n\n`;
    });

    md += `---\n# Global Statistics\n\n`;
    md += `1. **Total Population**: ${data.global.totalPop}\n`;
    md += `2. **Warrior Kill/Death Ratio**: ${data.global.warriorKDR}\n`;
    md += `3. **Worker Kill/Death Ratio**: ${data.global.workerKDR}\n`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Attempt logic to find the next filename index, but since we're in browser, 
    // it's easier to just timestamp or suggest to user.
    // However, I can try to store a counter in localStorage.
    const count = parseInt(localStorage.getItem('report_count') || '0') + 1;
    localStorage.setItem('report_count', count.toString());
    const fileName = `data${count.toString().padStart(3, '0')}.md`;
    
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestBriefing = async () => {
    setIsBriefingLoading(true);
    try {
      const stats = getCollectionStats();
      const response = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats })
      });
      const data = await response.json();
      if (data.report) {
        setBriefingReport(data.report);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsBriefingLoading(false);
    }
  };

  const aliveFactions = worldRef.current?.factions.filter(f => !f.isDead) || [];
  const winner = (aliveFactions.length === 1 && tick > 100) ? aliveFactions[0] : null;

  const powerData = worldRef.current?.factions.map(f => {
    const pop = worldRef.current.entities.filter(e => e && e.factionId === f.id).length;
    const powerVal = f.isDead ? 0 : Math.round(
      f.resources + 
      pop * 15 + 
      (f.territoryCount || 0) * 8 + 
      ((f.upgrades?.strength || 0) + (f.upgrades?.speed || 0) + (f.upgrades?.coordination || 0)) * 5
    );
    return {
      name: f.name.split(' ')[0],
      fullName: f.name,
      power: powerVal,
      color: f.color
    };
  }) || [];

  return (
    <div className="w-full h-full bg-neutral-950 flex items-center justify-center overflow-hidden">
      <div 
        className="relative overflow-hidden cursor-grab active:cursor-grabbing shadow-[0_24px_70px_rgba(0,0,0,0.9)] border border-white/5 md:rounded-2xl flex-shrink-0"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
        }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        id="sim-canvas"
      />

      {/* Visual notification container */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-30 pointer-events-none max-w-sm md:max-w-md w-full px-4">
        <AnimatePresence>
          {activeNotifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: -25, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="flex items-center gap-3 px-4 py-2.5 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] w-full text-white pointer-events-auto"
            >
              <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full relative">
                <div className="absolute inset-0 rounded-full animate-ping opacity-75 animate-duration-1000" style={{ backgroundColor: notif.sourceFactionColor }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: notif.sourceFactionColor }} />
              </div>
              <div className="flex-grow text-[11px] leading-relaxed font-semibold">
                <span className="font-bold underline decoration-2 underline-offset-2" style={{ color: notif.sourceFactionColor }}>
                  {notif.sourceFactionName}
                </span>
                <span className="text-neutral-300">
                  {notif.type === 'RALLYING' ? (
                    <>
                      {' is mobilizing for war against '}
                      <span className="font-bold underline decoration-2 underline-offset-2" style={{ color: notif.targetFactionColor }}>
                        {notif.targetFactionName}
                      </span>
                      {' ⛺'}
                    </>
                  ) : notif.type === 'ATTACKING' ? (
                    <>
                      {' launched a strike wave to crush '}
                      <span className="font-bold underline decoration-2 underline-offset-2" style={{ color: notif.targetFactionColor }}>
                        {notif.targetFactionName}
                      </span>
                      {' ⚔️'}
                    </>
                  ) : (
                    <>
                      {notif.sourceFactionName === notif.targetFactionName ? (
                        <>
                          {' Queen has perished from starvation! 💀'}
                        </>
                      ) : (
                        <>
                          {' has been defeated by '}
                          <span className="font-bold underline decoration-2 underline-offset-2" style={{ color: notif.targetFactionColor }}>
                            {notif.targetFactionName}
                          </span>
                          {' 💀'}
                        </>
                      )}
                    </>
                  )}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>



      {/* Playback Controls */}
      <div className="absolute bottom-8 left-8 flex items-center gap-1 bg-black/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-2xl">
        <button
          onClick={resetWorld}
          className="p-3 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded-xl transition-all active:scale-95 group"
          title="Reset Simulation"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>

        <div className="w-[1px] h-8 bg-white/10 mx-1" />

        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`p-4 rounded-xl transition-all active:scale-90 ${isPaused ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'hover:bg-white/10 text-white'}`}
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
        </button>

        <div className="flex gap-1 ml-1 pr-1">
          {[1, 2, 3].map(speed => (
            <button
              key={speed}
              onClick={() => setTimeScale(speed)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${timeScale === speed ? 'bg-white text-black' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}
            >
              {speed}X
            </button>
          ))}
        </div>

        <div className="w-[1px] h-8 bg-white/10 mx-1" />

        {/* Global Unit Speed Factor Slider */}
        <div className="flex flex-col gap-1 px-3 py-1 min-w-[120px]">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-tighter">Kinetic Phasing</span>
            <span className="text-[10px] font-mono font-black text-amber-500">{(globalSpeedMultiplier * 100).toFixed(0)}%</span>
          </div>
          <input 
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={globalSpeedMultiplier}
            onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        <div className="w-[1px] h-8 bg-white/10 mx-1" />

        <button
          onClick={downloadReport}
          className="p-3 hover:bg-white/10 text-neutral-400 hover:text-white rounded-xl transition-all active:scale-95 group"
          title="Export Markdown Report"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>

        <div className="w-[1px] h-8 bg-white/10 mx-1" />

        <button
          onClick={() => setShowPopulationChart(!showPopulationChart)}
          className={`p-3 rounded-xl transition-all active:scale-95 group ${showPopulationChart ? 'bg-white/20 text-emerald-400' : 'hover:bg-white/10 text-neutral-400 hover:text-white'}`}
          title="Toggle Population History"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </button>

        <div className="w-[1px] h-8 bg-white/10 mx-1" />

        <button
          onClick={() => setShowPowerChart(!showPowerChart)}
          className={`p-3 rounded-xl transition-all active:scale-95 group ${showPowerChart ? 'bg-white/20 text-yellow-400' : 'hover:bg-white/10 text-neutral-400 hover:text-white'}`}
          title="Toggle Power Spectrum (Staplegram)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </button>

        <div className="w-[1px] h-8 bg-white/10 mx-1" />

        <button
          onClick={() => setShowDrivePanel(!showDrivePanel)}
          className={`p-3 rounded-xl transition-all active:scale-95 group relative ${showDrivePanel ? 'bg-white/20 text-amber-400 font-bold' : googleUser ? 'text-amber-400 hover:bg-amber-500/10' : 'hover:bg-white/10 text-neutral-400 hover:text-white'}`}
          title="Google Drive Cloud Sync & Backups"
        >
          {googleUser && (
            <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.5 19A5.5 5.5 0 0 0 18 8.02a1 1 0 0 0-.78-.84 8.5 8.5 0 0 0-16.1 2A5.5 5.5 0 0 0 1.5 19H17.5z" />
            <path d="M12 12v6M9 15l3 3 3-3" />
          </svg>
        </button>
      </div>

      {/* Graph Panels */}
      <AnimatePresence>
        {showPopulationChart && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="absolute bottom-24 left-8 w-72 h-40 bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl pointer-events-auto select-none z-20"
          >
            <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-2 flex justify-between items-center">
              <span className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Population History
              </span>
              <button 
                onClick={() => setShowPopulationChart(false)}
                className="hover:text-white transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="h-full w-full pb-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...worldRef.current.populationHistory]}>
                  {worldRef.current.factions.map(f => (
                    <Area 
                      key={f.id}
                      type="monotone" 
                      dataKey={f.id} 
                      stroke={f.color} 
                      fill={f.color} 
                      fillOpacity={0.15} 
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPowerChart && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={`absolute bottom-24 w-72 h-40 bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl pointer-events-auto select-none z-20 ${showPopulationChart ? 'left-[340px]' : 'left-8'}`}
          >
            <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-2 flex justify-between items-center">
              <span className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                Power Spectrum (Staplegram)
              </span>
              <button 
                onClick={() => setShowPowerChart(false)}
                className="hover:text-white transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="h-full w-full pb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={powerData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="#888888" fontSize={8} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={8} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ background: '#1c1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                    labelClassName="text-white font-bold"
                  />
                  <Bar dataKey="power" radius={[4, 4, 0, 0]}>
                    {powerData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Victory Screen */}
      <AnimatePresence>
        {isGameOver && (() => {
          const calculatedFactions = worldRef.current?.factions.map(f => {
            if (!f) return null;
            const totalLost = f.stats.warriorsLost + f.stats.workersLost + f.stats.poisonersLost + f.stats.elitesLost;
            const kd = f.stats.kills / Math.max(1, totalLost);
            const rpm = f.stats.totalIncome / Math.max(0.1, (f.age / 60));
            // Tactical simulation score
            const score = f.stats.kills * 15 + f.stats.totalIncome * 0.1 + (f.territoryCount || 0) * 8 + (f.upgrades?.strength + f.upgrades?.speed + f.upgrades?.coordination) * 5;
            return { ...f, kd, rpm, score };
          }) || [];

          const mvpFaction = [...calculatedFactions].filter(f => f !== null).sort((a, b) => (b?.score || 0) - (a?.score || 0))[0];

          // Establish MVP Unit based on overall simulation priorities
          const totalWarriors = calculatedFactions.reduce((sum, f) => sum + (f?.stats.warriorsProduced || 0), 0);
          const totalPoisoners = calculatedFactions.reduce((sum, f) => sum + (f?.stats.poisonersProduced || 0), 0);
          const totalElites = calculatedFactions.reduce((sum, f) => sum + (f?.stats.elitesProduced || 0), 0);

          let mvpUnitName = "Gladius Warrior (Frontline Vanguard)";
          let mvpUnitDesc = "With superior discipline and modular armor, these frontliners successfully absorbed heavy shock charges, maintaining defensive shell walls while protecting delicate foragers.";
          let mvpUnitIcon = "⚔️";
          let mvpUnitPower = "Combat Resilience: high shield rating";

          if (totalElites >= totalPoisoners && totalElites >= totalWarriors * 0.3) {
            mvpUnitName = "Titan Juggernaut (Chivalric Cataphract)";
            mvpUnitDesc = "Heavy bio-armored tanks with massive mandibles. Their tectonic ground slams and high health pools shattered enemy phalanxes, securing contested resource lanes under intensive skirmish fire.";
            mvpUnitIcon = "🛡️";
            mvpUnitPower = "Breaker of Lines: heavy area-stun & damage";
          } else if (totalPoisoners > totalWarriors * 0.5) {
            mvpUnitName = "Acid Spitter (Siege Artillery Guild)";
            mvpUnitDesc = "Operating as poisoners and acid siege teams. They dissolved opponent chitin armors and inflicted devastating area-of-effect damage, controlling vital defensive choke points.";
            mvpUnitIcon = "🧪";
            mvpUnitPower = "Attrition Master: toxic area-denial corrosion";
          }

          const barChartData = calculatedFactions.map(f => ({
            name: f.name.split(' ')[0], // abbreviation
            kd: parseFloat(f.kd.toFixed(2)),
            color: f.color
          }));

          const renderBoldText = (text: string) => {
            const parts = text.split(/\*\*([\s\S]*?)\*\*/g);
            return parts.map((part, index) => {
              if (index % 2 === 1) {
                return <strong key={index} className="text-[#f5cca2] font-semibold">{part}</strong>;
              }
              return part;
            });
          };

          const renderTreatiseText = (text: string) => {
            return text.split('\n').map((line, i) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('###')) {
                return <h4 key={i} className="text-[#fdd189] font-sans font-bold text-sm uppercase tracking-wider mt-4 mb-2">{trimmed.replace(/###/g, '').trim()}</h4>;
              }
              if (trimmed.startsWith('##')) {
                return <h3 key={i} className="text-[#f7b05b] font-serif font-black text-lg border-b border-orange-950/20 pb-1 mt-6 mb-3">{trimmed.replace(/##/g, '').trim()}</h3>;
              }
              if (trimmed.startsWith('#')) {
                return <h2 key={i} className="text-xl text-[#f39c12] font-serif font-black uppercase tracking-wider mb-4 border-l-4 border-[#f39c12] pl-3 py-1 bg-black/20">{trimmed.replace(/#/g, '').trim()}</h2>;
              }
              if (trimmed.startsWith('>') || trimmed.startsWith('* ">')) {
                return (
                  <blockquote key={i} className="border-l-4 border-orange-800/40 pl-4 py-2 my-4 italic text-[#dfcaa2] bg-white/5 rounded-r-lg font-serif">
                    {trimmed.replace(/^>\s*|^\*\s*">\s*|"\s*$/g, '')}
                  </blockquote>
                );
              }
              if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
                const bulletText = trimmed.replace(/^[\-*]\s*/, '');
                return (
                  <li key={i} className="list-disc ml-6 text-neutral-300 my-1 font-serif">
                    {renderBoldText(bulletText)}
                  </li>
                );
              }
              return <p key={i} className="text-neutral-300 leading-relaxed font-serif my-2 text-justify">{renderBoldText(line)}</p>;
            });
          };

          return (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-y-auto"
            >
              <div className="max-w-5xl w-full bg-neutral-900 border border-white/20 rounded-3xl p-6 md:p-10 my-auto shadow-2xl overflow-y-auto max-h-[92vh]">
                
                {/* Header */}
                <div className="text-center mb-8 border-b border-white/15 pb-6">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] bg-red-500/10 text-red-400 px-3 py-1 rounded-full border border-red-500/20">
                    ROYAL WARGAME COMPLETE
                  </span>
                  <h1 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter mt-3 mb-1">
                    SIMULATION CONCLUDED
                  </h1>
                  <p className="text-neutral-400 font-medium text-xs font-mono uppercase tracking-wider">
                    Post-Conflict Tactical & Command Report
                  </p>
                  {endWinner && (
                    <div className="mt-4 inline-flex items-center gap-3 px-5 py-2 bg-white/5 rounded-full border border-white/15">
                      <div className="w-3.5 h-3.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]" style={{ backgroundColor: endWinner.color }} />
                      <span className="text-lg font-black tracking-widest" style={{ color: endWinner.color }}>
                        {endWinner.name.toUpperCase()} HEGEMONY SECURED
                      </span>
                    </div>
                  )}
                </div>

                {/* Main Grid: Statistics & AI Advisors */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Section: Diagrams & MVPs (7 cols) */}
                  <div className="lg:col-span-7 space-y-6">
                    
                    {/* Bento Box 1: Battle MVPs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* MVP Colony */}
                      {mvpFaction && (
                        <div className="bg-gradient-to-br from-amber-500/10 via-black/40 to-black/20 border border-amber-500/30 p-5 rounded-2xl relative overflow-hidden shadow-xl">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/15 rounded-full blur-xl pointer-events-none" />
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">⭐</span>
                            <span className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-widest">
                              PLAY OF THE CONFLICT
                            </span>
                          </div>
                          <h3 className="text-xl font-black text-white" style={{ color: mvpFaction.color }}>
                            {mvpFaction.name}
                          </h3>
                          <p className="text-[10px] text-amber-200/80 font-mono mt-1 font-bold">
                            Strategic Dominance Award
                          </p>
                          <p className="text-xs text-neutral-300 mt-3 leading-relaxed">
                            A royal performance yielding <span className="font-bold text-white font-mono">{mvpFaction.stats.kills}</span> eliminations and peak territory command, maintaining ironclad supply routes.
                          </p>
                        </div>
                      )}

                      {/* MVP Unit Type */}
                      <div className="bg-gradient-to-br from-emerald-500/10 via-black/40 to-black/20 border border-emerald-500/30 p-5 rounded-2xl relative overflow-hidden shadow-xl">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/15 rounded-full blur-xl pointer-events-none" />
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">{mvpUnitIcon}</span>
                          <span className="text-[9px] font-mono font-black text-emerald-400 uppercase tracking-widest">
                            MVP MILITARY CLASS
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-white">
                          {mvpUnitName}
                        </h3>
                        <p className="text-[9px] text-emerald-300/80 font-mono mt-1 font-bold">
                          {mvpUnitPower}
                        </p>
                        <p className="text-xs text-neutral-300 mt-3 leading-relaxed">
                          {mvpUnitDesc}
                        </p>
                      </div>

                    </div>

                    {/* Bento Box 2: Kill/Death Ratio Diagram */}
                    <div className="bg-black/40 border border-white/10 p-5 rounded-2xl shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-mono font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                          <span>📊</span> KILL / DEATH RATIO SPECTRUM
                        </h3>
                        <span className="text-[9px] font-mono text-neutral-500">Kills / Total Battle Losses</span>
                      </div>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <XAxis dataKey="name" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                            <Tooltip 
                              contentStyle={{ background: '#1c1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                              labelClassName="text-white text-xs font-bold font-mono"
                            />
                            <Bar dataKey="kd" radius={[6, 6, 0, 0]}>
                              {barChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Bento Box 3: PhD Level Advisor Section */}
                    <div className="pt-2">
                      {!briefingReport && !isBriefingLoading ? (
                        <button
                          onClick={requestBriefing}
                          className="w-full py-5 px-6 rounded-2xl bg-gradient-to-r from-orange-900/60 to-red-950 border border-red-500/20 text-[#ebdcb9] font-serif font-bold text-sm tracking-wide shadow-xl active:scale-98 transition-all hover:brightness-110 flex items-center justify-center gap-3"
                        >
                          <span>📜</span> REQUEST PHD-LEVEL MEDIEVAL MILITARY ANALYSIS
                        </button>
                      ) : isBriefingLoading ? (
                        <div className="flex flex-col items-center justify-center p-8 bg-black/40 border border-white/5 rounded-2xl">
                          <div className="relative w-12 h-12">
                            <div className="absolute inset-0 rounded-full border-4 border-amber-500/10 border-t-amber-500 animate-spin" />
                            <div className="absolute inset-2 rounded-full border-4 border-yellow-500/10 border-b-yellow-500 animate-spin animate-reverse" style={{ animationDuration: '3s' }} />
                          </div>
                          <p className="mt-4 text-xs text-neutral-200 font-bold font-mono tracking-wide animate-pulse">📜 DRAFTING MILITARY TREATISE DISPATCH...</p>
                          <p className="text-[9px] text-neutral-400 font-mono mt-1 text-center max-w-md">"Comparing unit logistics to Byzantine border defense networks and French chivalry casualties..."</p>
                        </div>
                      ) : (
                        <div className="flex flex-col bg-[#14120f] border border-orange-950/40 rounded-2xl overflow-hidden shadow-2xl">
                          <div className="bg-[#241e17] border-b border-orange-950/40 px-5 py-3 flex justify-between items-center text-[#e8cda1]">
                            <div className="flex items-center gap-2">
                              <span className="text-base">📜</span>
                              <span className="font-serif font-black text-xs tracking-wider uppercase">PhD MILITARY TREATISE DISPATCH</span>
                            </div>
                            <button 
                              onClick={() => setBriefingReport(null)}
                              className="text-[9px] uppercase font-mono font-bold hover:text-white transition-colors tracking-wider px-2 py-0.5 bg-white/5 rounded border border-white/10"
                            >
                              Clear
                            </button>
                          </div>
                          <div className="p-6 md:p-8 max-h-[380px] overflow-y-auto font-serif text-[#ebdcb9] leading-relaxed text-xs space-y-4">
                            {renderTreatiseText(briefingReport)}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Right Section: Kingdoms Individual Reports (5 cols) */}
                  <div className="lg:col-span-5 space-y-4">
                    <h3 className="text-[10px] font-mono font-black text-neutral-400 uppercase tracking-widest pl-1 mb-2">
                      ⚔️ KINGDOMS INDIVIDUAL REGIMENTS
                    </h3>
                    
                    {calculatedFactions.map(f => (
                      <div 
                        key={f.id} 
                        className={`p-5 rounded-2xl border transition-all ${f.isDead ? 'bg-neutral-950/40 border-white/5 grayscale opacity-55' : 'bg-white/5 border-white/15'}`}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                            <span className="text-base font-bold text-white">{f.name}</span>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-black ${f.isDead ? 'bg-red-500/20 text-red-400 border border-red-500/10' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10'}`}>
                            {f.isDead ? 'ELIMINATED' : 'SURVIVED'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono border-b border-white/15 pb-3">
                          <div className="flex justify-between text-neutral-400">
                            <span>Vanguard Recruits:</span>
                            <span className="text-white font-bold">{f.stats.warriorsProduced + f.stats.poisonersProduced + f.stats.elitesProduced}</span>
                          </div>
                          <div className="flex justify-between text-neutral-400">
                            <span>Fallen Recruits:</span>
                            <span className="text-red-400 font-bold">{f.stats.warriorsLost + f.stats.poisonersLost + f.stats.elitesLost}</span>
                          </div>
                          <div className="flex justify-between text-neutral-400">
                            <span>Logistical Peons:</span>
                            <span className="text-white font-bold">{f.stats.workersProduced}</span>
                          </div>
                          <div className="flex justify-between text-neutral-400">
                            <span>Fallen Peons:</span>
                            <span className="text-red-400 font-bold">{f.stats.workersLost}</span>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="bg-white/5 p-2 rounded-xl text-center border border-white/5">
                            <div className="text-[8px] text-neutral-500 font-black uppercase mb-0.5 font-mono">Kill / Death Ratio</div>
                            <div className="text-base font-black font-mono text-white">{f.kd.toFixed(2)}</div>
                          </div>
                          <div className="bg-white/5 p-2 rounded-xl text-center border border-white/5">
                            <div className="text-[8px] text-neutral-500 font-black uppercase mb-0.5 font-mono">Logistical Intake / m</div>
                            <div className="text-base font-black font-mono text-emerald-400">{Math.round(f.rpm)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                  </div>

                </div>

                {/* Footer Restart Button */}
                <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-4 justify-between items-center bg-black/10 p-4 rounded-2xl">
                  <div className="text-left w-full sm:w-auto">
                    <p className="text-[10px] font-mono text-neutral-500">SESSION_DIAGNOSTICS_RECORD</p>
                    <p className="text-xs font-mono text-neutral-300">ID: {Math.floor(tick).toString(16).toUpperCase()}_{Date.now().toString(16).toUpperCase()}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <button 
                      onClick={downloadReport}
                      className="px-5 py-3 bg-neutral-800 hover:bg-neutral-700 border border-white/10 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                      title="Download Full Data Report"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      <span>Download Report</span>
                    </button>
                    <button 
                      onClick={() => {
                        localStorage.removeItem(SAVE_KEY);
                        window.location.reload();
                      }}
                      className="px-8 py-3 bg-white text-black font-black text-xs uppercase tracking-widest rounded-xl hover:bg-neutral-200 hover:scale-103 active:scale-97 transition-all shadow-xl"
                    >
                      🚀 Restart Simulation
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>


      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 items-end">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsFactionsExpanded(!isFactionsExpanded)}
          className="bg-black/60 backdrop-blur-md p-2 rounded-lg border border-white/10 text-neutral-400 hover:text-white transition-colors flex items-center gap-2 mb-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-widest">{isFactionsExpanded ? 'Collapse Stats' : 'View Colonies'}</span>
        </motion.button>

        {worldRef.current.factions.map(f => (
          <motion.div 
            key={f.id} 
            layout
            onClick={() => !isFactionsExpanded && setIsFactionsExpanded(true)}
            className={`bg-black/60 backdrop-blur-md rounded-lg border border-white/10 transition-colors cursor-pointer overflow-hidden ${isFactionsExpanded ? 'p-3 min-w-48' : 'p-2 w-max hover:bg-black/80'} ${f.isDead ? 'opacity-40 grayscale' : ''}`}
          >
            <motion.div layout className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: f.color }} />
              <AnimatePresence>
                {isFactionsExpanded && (
                  <motion.span 
                    key={`faction-title-${f.id}`}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -5 }}
                    className={`font-bold text-sm uppercase tracking-wider ${f.isDead ? 'line-through' : ''}`}
                  >
                    {f.name} {f.isDead ? '(DEAD)' : ''}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
            
            <AnimatePresence>
              {isFactionsExpanded && (
                <motion.div 
                  key={`faction-details-${f.id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="grid grid-cols-2 text-[10px] font-mono text-neutral-300 mt-2 border-t border-white/5 pt-2"
                >
                  <span className="opacity-70">Food Stored:</span>
                  <span className="text-right text-emerald-400 font-bold">{Math.floor(f.resources) || 0}</span>
                  <span className="opacity-70">Territory:</span>
                  <span className="text-right text-sky-400 font-bold">{(f.territoryCount || 0)}m²</span>
                  <span className="opacity-70">Ant Count:</span>
                  <span className="text-right">{worldRef.current.entities.filter(e => e && e.factionId === f.id).length || 0}</span>
                  <span className="opacity-70">Aggression:</span>
                  <span className="text-right">{((f.personality?.aggressiveness || 0) * 100).toFixed(0)}%</span>
                  <span className="opacity-70">Defense Focus:</span>
                  <span className="text-right">{((f.personality?.defenseFocus || 0) * 100).toFixed(0)}%</span>
                  <span className="opacity-70 text-amber-500 font-bold">Doctrine:</span>
                  <span className="text-right text-amber-400 font-black tracking-tighter truncate" title={f.activeStrategy}>
                    {f.activeStrategy?.replace('_', ' ') || 'NONE'}
                  </span>
                  <span className="opacity-70">Strategy:</span>
                  <span className={`text-right font-bold ${f.attackPlan ? (f.attackPlan.stage === 'RALLYING' ? 'text-amber-400' : 'text-rose-500 animate-pulse') : 'text-neutral-400'}`}>
                    {f.isDead ? 'NONE' : f.attackPlan ? (f.attackPlan.stage === 'RALLYING' ? 'RALLYING ⛺' : 'STRIKE WAVE ⚔️') : 'GUARD HOME 🛡️'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Inspector Panel */}
      {selectedId && (
        <div 
          ref={panelRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={panelPos.x !== null && panelPos.y !== null ? {
            left: `${panelPos.x}px`,
            top: `${panelPos.y}px`,
            bottom: 'auto',
            transform: 'none'
          } : undefined}
          className={`absolute bottom-8 left-1/2 -translate-x-1/2 w-80 bg-black/85 backdrop-blur-xl border border-white/20 rounded-2xl p-5 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2 select-none touch-none ${
            isDraggingPanel ? 'cursor-grabbing border-emerald-500/50' : 'cursor-grab hover:border-white/40'
          } transition-all duration-100`}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Inspector</h2>
                <span className="text-[9px] px-1 bg-white/10 rounded text-neutral-400 font-mono scale-90">DRAG ME</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                {selectedType === 'ENTITY' ? (
                  worldRef.current.entities.find(e => e.id === selectedId)?.type || 'Unknown'
                ) : 'Food Source'}
              </h3>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setSelectedId(null); setSelectedType(null); }}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors pointer-events-auto cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div className="space-y-3 font-mono text-[11px]">
            {selectedType === 'ENTITY' ? (() => {
              const ant = worldRef.current?.entities.find(e => e && e.id === selectedId);
              const faction = worldRef.current?.factions.find(f => f && f.id === ant?.factionId);
              if (!ant) return <p className="text-red-400">Target Lost</p>;

              const age = Math.floor(faction?.age ? faction.age - (ant as any).birthTime || 0 : 0);
              
              const descriptions: Record<string, string> = {
                'WORKER': "A diligent harvester, specialized in identifying and transporting vital resources to ensure the colony's survival. Its life is one of constant motion and sacrifice.",
                'WARRIOR': "A formidable protector of the swarm. Engineered for combat, its primary directive is high-threat elimination and perimeter security. Fearless in the face of death.",
                'POISONER': "A venomous support vanguard. Formed to attack and infect targets with toxic damage-over-time payloads, before seeking protection in the company of allies.",
                'BERSERKER': "A hyper-aggressive elite of Crimson Faction. Sacrifices durability when wounded to enter an unstoppable rage state, multiplying its damage and movement speed.",
                'GUARDIAN': "An armored shield-bearer of Azure Faction. Uses heavy plating to deflect incoming threats and periodically projects defensive shield fields onto nearby swarm allies.",
                'ACID_SPITTER': "A ranged chemical sprayer of Emerald Faction. Fires long-range sticky acid spray that deals damage-over-time and slows targets' speed in half.",
                'TITAN': "The ultimate heavy behemoth of Golden Faction. Deals massive crushing damage, with heavy cleaving swings that can stun and sweep multiple target units at once.",
                'QUEEN': "The biological heart of the colony. Her sole existence ensures the continuity of the faction. Highly protected and stationary, she is the ultimate strategic asset."
              };

              return (
                <>
                  <div className="flex justify-between p-2 bg-white/5 rounded">
                    <span className="text-neutral-400">FACTION</span>
                    <span style={{ color: faction?.color || '#fff' }}>{faction?.name || 'Unknown'}</span>
                  </div>
                  
                  <div className="text-[10px] text-neutral-400 italic mb-2 leading-relaxed">
                    "{descriptions[ant.type] || "A member of the colony fulfilling its biological directive."}"
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">HEALTH</span>
                      <span>{Math.floor(ant.health || 0)} / {ant.maxHealth || 100}</span>
                    </div>
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500" style={{ width: `${((ant.health || 0) / (ant.maxHealth || 100)) * 100}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/10">
                    <div>
                      <span className="text-neutral-500 block">LEVEL</span>
                      <span className="text-emerald-400 font-bold">{ant.level || 1}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">KILLS</span>
                      <span className="text-white">{(ant as any).kills || 0}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">HARVESTS</span>
                      <span className="text-white">{(ant as any).harvests || 0}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">AGE</span>
                      <span className="text-white">{age}s</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">STATE</span>
                      <span className="text-sky-400">{ant.state || 'IDLE'}</span>
                    </div>
                  </div>

                  {(ant.load || 0) > 0 && (
                    <div className="flex justify-between mt-2">
                      <span className="text-neutral-400">CARGO</span>
                      <span className="text-emerald-400">{(ant.load || 0).toFixed(1)} units</span>
                    </div>
                  )}

                  {ant.poisonDurationRemaining && ant.poisonDurationRemaining > 0 ? (
                    <div className="flex justify-between mt-2 p-2 bg-purple-950/40 rounded border border-purple-500/30 text-[10px]">
                      <span className="text-purple-300 font-bold">POISON INFECTION</span>
                      <span className="text-purple-400 text-right font-bold">{ant.poisonDurationRemaining.toFixed(1)}s remaining</span>
                    </div>
                  ) : null}

                  {ant.acidDurationRemaining && ant.acidDurationRemaining > 0 ? (
                    <div className="flex justify-between mt-2 p-2 bg-lime-950/40 rounded border border-lime-500/30 text-[10px]">
                      <span className="text-lime-300 font-bold">ACID INFECTION</span>
                      <span className="text-lime-400 text-right font-bold">{ant.acidDurationRemaining.toFixed(1)}s remaining</span>
                    </div>
                  ) : null}

                  {ant.stunDurationRemaining && ant.stunDurationRemaining > 0 ? (
                    <div className="flex justify-between mt-2 p-2 bg-yellow-950/40 rounded border border-yellow-500/30 text-[10px]">
                      <span className="text-yellow-300 font-bold">STUNNED / PARALYZED</span>
                      <span className="text-yellow-400 text-right font-bold">{ant.stunDurationRemaining.toFixed(1)}s remaining</span>
                    </div>
                  ) : null}

                  {ant.shieldBuffRemaining && ant.shieldBuffRemaining > 0 ? (
                    <div className="flex justify-between mt-2 p-2 bg-cyan-950/40 rounded border border-cyan-500/30 text-[10px]">
                      <span className="text-cyan-300 font-bold">CYAN SHIELD ACTIVE</span>
                      <span className="text-cyan-400 text-right font-bold">{ant.shieldBuffRemaining.toFixed(1)}s remaining</span>
                    </div>
                  ) : null}

                  <div className="pt-2 border-t border-white/10">
                    <span className="text-neutral-500 block mb-1">COORD: {(ant.position?.x || 0).toFixed(0)}, {(ant.position?.y || 0).toFixed(0)}</span>
                  </div>
                </>
              );
            })() : selectedType === 'BASE' ? (() => {
              const faction = worldRef.current.factions.find(f => f.id === selectedId);
              if (!faction) return <p className="text-red-400">Colony Destroyed</p>;
              
              const pop = worldRef.current.entities.filter(e => e && e.factionId === faction.id).length;

              return (
                <>
                  <div className="flex justify-between p-2 bg-white/5 rounded">
                    <span className="text-neutral-400">STATUS</span>
                    <span className="text-emerald-400 font-bold">OPERATIONAL</span>
                  </div>

                  <div className="text-[10px] text-neutral-400 italic mb-2 leading-relaxed">
                    "The primary command node for the {faction.name}. It coordinates the swarm intelligence and handles nutrient distribution. Its destruction would mean the absolute end of this lineage."
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">INTEGRITY</span>
                      <span>{Math.floor(faction.health)} / {faction.maxHealth}</span>
                    </div>
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${(faction.health / faction.maxHealth) * 100}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/10 text-neutral-400">
                    <div>
                      <span className="text-neutral-500 block">POPULATION</span>
                      <span className="text-white">{pop}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">RESOURCES</span>
                      <span className="text-emerald-400 font-bold">{Math.floor(faction.resources)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">EXPANSION</span>
                      <span className="text-white">{(faction.personality.expansionism * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">DOCTRINE</span>
                      <span className="text-amber-500 font-black">{faction.activeStrategy?.replace('_', ' ') || 'STANDARD'}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <span className="text-[11px] font-bold text-neutral-400 block mb-2 uppercase tracking-wider">Colony Swarm Research</span>
                    <div className="space-y-2.5">
                      {(['speed', 'strength', 'coordination'] as const).map((category) => {
                        const level = (faction.upgrades ? faction.upgrades[category] : 0) || 0;
                        const cost = getUpgradeCost(level);
                        const isMax = level >= 3;
                        const canAfford = faction.resources >= cost;
                        
                        let name = '';
                        let description = '';
                        let bonusText = '';
                        
                        if (category === 'speed') {
                          name = 'Neural Speedways';
                          description = 'Boosts worker and warrior move speed';
                          bonusText = `+${level * 15}% Speed (Next: +${(level + 1) * 15}%)`;
                          if (isMax) bonusText = '+45% Max Speed';
                        } else if (category === 'strength') {
                          name = 'Chitin Hardening';
                          description = 'Enhances ant maximum health and strike damage';
                          bonusText = `+${level * 15}% HP, +${level * 20}% Damage`;
                          if (isMax) bonusText = '+45% HP, +60% Damage (MAX)';
                        } else if (category === 'coordination') {
                          name = 'Pheromone Synergy';
                          description = 'Swarms march tighter, coordinate further, and rally faster';
                          bonusText = `+${level * 20}% Scan Range, Better Swarming`;
                          if (isMax) bonusText = '+60% Scan Range, Maximum Coordination';
                        }
                        
                        return (
                          <div key={category} className="p-2 rounded bg-white/5 border border-white/5 flex flex-col gap-1.5 hover:border-white/10 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-[11px] font-bold text-neutral-200 block">{name}</span>
                                <span className="text-[9px] text-neutral-400 block leading-tight">{description}</span>
                              </div>
                              <div className="flex gap-0.5 mt-0.5">
                                {[1, 2, 3].map((star) => (
                                  <svg 
                                    key={star} 
                                    width="10" 
                                    height="10" 
                                    viewBox="0 0 24 24" 
                                    fill={star <= level ? faction.color : 'none'} 
                                    stroke={star <= level ? faction.color : 'rgba(255,255,255,0.2)'} 
                                    strokeWidth="2"
                                  >
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                  </svg>
                                ))}
                              </div>
                            </div>
                            
                            <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-white/5">
                              <span className="text-[9px] font-medium text-sky-400">{bonusText}</span>
                              {isMax ? (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded uppercase tracking-wider">MAX LEVEL</span>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (!faction.upgrades) {
                                      faction.upgrades = { speed: 0, strength: 0, coordination: 0 };
                                    }
                                    faction.resources -= cost;
                                    faction.stats.totalExpense += cost;
                                    faction.upgrades[category] = level + 1;
                                    setTick(t => t + 1);
                                  }}
                                  disabled={!canAfford}
                                  className={`text-[9px] font-bold px-2.5 py-1 rounded transition-all flex items-center gap-1 border ${
                                    canAfford 
                                      ? 'bg-neutral-800 text-white hover:bg-neutral-700 active:scale-95 cursor-pointer border-white/10' 
                                      : 'bg-neutral-900/40 text-neutral-500 border-white/5 cursor-not-allowed'
                                  }`}
                                >
                                  <span>Upgrade</span>
                                  <span className={canAfford ? 'text-emerald-400 font-extrabold' : 'text-neutral-500'}>({cost}🍃)</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/10 text-neutral-500">
                    <span>COLONY ESTABLISHED {Math.floor(faction.age)}s AGO</span>
                  </div>
                </>
              );
            }) : (() => {
              const res = worldRef.current.resources.find(r => r.id === selectedId);
              if (!res) return <p className="text-red-400">Resource Depleted</p>;
              return (
                <>
                  <div className="text-[10px] text-neutral-400 italic mb-4 leading-relaxed">
                    "{res.description || "A naturally occurring resource high in nutrients, essential for colony growth and unit production."}"
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">AMOUNT</span>
                      <span>{Math.floor(res.amount || 0)} / {res.maxAmount || 0}</span>
                    </div>
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${((res.amount || 0) / (res.maxAmount || 1)) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">TYPE</span>
                    <span className="text-emerald-400">{res.type || 'FOOD'}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}



      {/* Google Drive Cloud Sync Panel Overlay */}
      <AnimatePresence>
        {showDrivePanel && (
          <motion.div 
            key="drive-overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-black/75 backdrop-blur-md pointer-events-auto"
          >
            <motion.div 
              key="drive-overlay-container"
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              className="bg-neutral-900 border border-white/15 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              {/* Modal Banner Header */}
              <div className="bg-black/30 border-b border-white/10 px-6 py-4 flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                  <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest ml-2">DRIVE_CLOUD_INTEGRATION_V2</span>
                </div>
                <button 
                  onClick={() => setShowDrivePanel(false)}
                  className="p-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs font-mono font-bold text-neutral-400 hover:text-white"
                >
                  ESC
                </button>
              </div>

              {/* Status Banner */}
              {driveStatus && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between text-[11px] font-mono text-amber-300">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>SYSTEM_LOG: {driveStatus}</span>
                  </div>
                  <button onClick={() => setDriveStatus(null)} className="opacity-60 hover:opacity-100 font-bold ml-2">×</button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {!googleUser ? (
                  /* Authentication Step */
                  <div className="text-center py-10 px-4 space-y-6">
                    <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 mx-auto shadow-inner shadow-amber-500/5">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.5 19A5.5 5.5 0 0 0 18 8.02a1 1 0 0 0-.78-.84 8.5 8.5 0 0 0-16.1 2A5.5 5.5 0 0 0 1.5 19H17.5z" />
                        <path d="M12 12v6M9 15l3 3 3-3" />
                      </svg>
                    </div>
                    <div className="max-w-xs mx-auto space-y-2">
                      <h3 className="text-lg font-bold text-white tracking-tight">Sync Simulation with Google Drive</h3>
                      <p className="text-xs text-neutral-400 leading-relaxed font-mono">
                        Connect with permission to list historical dispatch battle logs and manage system simulation backup states directly inside your Drive closet.
                      </p>
                    </div>

                    <div className="flex justify-center pt-2">
                      <button 
                        onClick={handleGoogleLogin}
                        disabled={isDriveLoading}
                        className="flex items-center gap-3 px-5 py-3.5 bg-white text-black font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-neutral-250 transition-all active:scale-97 shadow-xl disabled:opacity-50"
                      >
                        <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.514 5.514 0 0 1 8.5 13a5.514 5.514 0 0 1 5.491-5.514c2.233 0 4.213 1.257 5.176 3.124l3.72-2.89A11.458 11.458 0 0 0 13.991 2C7.922 2 3 6.922 3 13s4.922 11 10.991 11c6.33 0 10.45-4.444 10.45-10.614 0-.743-.066-1.42-.191-2.101H12.24Z"/>
                        </svg>
                        <span>{isDriveLoading ? 'Authenticating...' : 'Sign In with Google'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Connected Step */
                  <div className="space-y-6">
                    {/* Active Session Header */}
                    <div className="flex items-center justify-between bg-white/5 border border-white/10 p-4 rounded-2xl">
                      <div className="flex items-center gap-3">
                        {googleUser.photoURL ? (
                          <img src={googleUser.photoURL} alt={googleUser.displayName || 'User'} className="w-10 h-10 rounded-full border border-white/20" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 bg-amber-500/20 text-amber-400 font-bold text-sm uppercase rounded-full flex items-center justify-center border border-amber-500/30">
                            {googleUser.displayName?.charAt(0) || googleUser.email?.charAt(0) || 'U'}
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-mono font-black text-white leading-tight uppercase">{googleUser.displayName || 'Authorized Agent'}</p>
                          <p className="text-[10px] font-mono text-neutral-400 leading-none mt-1">{googleUser.email}</p>
                        </div>
                      </div>

                      <button 
                        onClick={handleGoogleLogout}
                        disabled={isDriveLoading}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 hover:text-red-400 border border-white/10 text-neutral-400 font-mono text-[9px] uppercase tracking-wider rounded-lg transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>

                    {/* Quick Database Backup Triggers Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={saveStateToGoogleDrive}
                        disabled={isDriveLoading}
                        className="p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:scale-101 active:scale-99 group select-none whitespace-normal"
                      >
                        <div className="w-10 h-10 bg-amber-500/20 border border-amber-500/20 rounded-xl flex items-center justify-center mb-2.5 transition-all group-hover:bg-amber-500/30">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-black font-mono text-white tracking-wide uppercase mb-1">Backup Simulation State</span>
                        <span className="text-[9px] text-neutral-400 leading-tight font-mono">Save backup for later restore</span>
                      </button>

                      <button
                        onClick={saveReportToGoogleDrive}
                        disabled={isDriveLoading}
                        className="p-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:scale-101 active:scale-99 group select-none whitespace-normal"
                      >
                        <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-2.5 transition-all group-hover:bg-emerald-500/30">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-black font-mono text-white tracking-wide uppercase mb-1">Export Battle Dispatch</span>
                        <span className="text-[9px] text-neutral-400 leading-tight font-mono">Store Markdown briefing in Drive</span>
                      </button>
                    </div>

                    {/* Google Drive Files List section */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="block w-2 h-2 rounded-full bg-amber-400" />
                          <h4 className="text-[10px] font-mono font-black text-neutral-400 uppercase tracking-widest">📁 CLOUD WORKSPACE CABINET ('Ant Colony Wargame')</h4>
                        </div>
                        <button 
                          onClick={() => refreshDriveFiles(driveToken)}
                          disabled={isDriveLoading}
                          className="flex items-center gap-1.5 p-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-mono uppercase text-neutral-400 hover:text-white transition-all disabled:opacity-50"
                        >
                          <svg className={`w-3.5 h-3.5 ${isDriveLoading ? 'animate-spin' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                          </svg>
                          <span>Sync Files</span>
                        </button>
                      </div>

                      {/* File Directory Scroll Container */}
                      <div className="border border-white/10 rounded-2xl max-h-56 overflow-y-auto bg-black/25 divide-y divide-white/5 font-mono">
                        {isDriveLoading && driveFiles.length === 0 ? (
                          <div className="text-center py-10 space-y-2">
                            <div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto" />
                            <p className="text-[9px] text-neutral-500 uppercase tracking-widest font-black">Scanning encrypted sectors...</p>
                          </div>
                        ) : driveFiles.length === 0 ? (
                          <div className="text-center py-10 px-4 text-neutral-500 text-[10px] uppercase tracking-wider space-y-1">
                            <p>No compatible scrolls or snapshots found.</p>
                            <p className="text-[9px] text-neutral-600 lowercase font-mono">Click 'Backup Simulation State' or 'Export Battle Dispatch' above to create files.</p>
                          </div>
                        ) : (
                          driveFiles.map((file) => {
                            const isStateBackup = file.name.endsWith('.json');
                            return (
                              <div key={file.id} className="flex justify-between items-center p-3.5 hover:bg-white/5 transition-all text-neutral-300">
                                <div className="space-y-1 pr-4 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isStateBackup ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]'}`} />
                                    <span className="text-[11px] font-bold text-white uppercase truncate block leading-tight">{file.name}</span>
                                  </div>
                                  <div className="flex gap-3 text-[8px] text-neutral-500 text-left">
                                    <span>MODIFIED: {new Date(file.modifiedTime).toLocaleString()}</span>
                                    {file.size && <span>SIZE: {(parseInt(file.size) / 1024).toFixed(1)} KB</span>}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isStateBackup ? (
                                    <button 
                                      onClick={() => loadStateFromGoogleDrive(file.id, file.name)}
                                      disabled={isDriveLoading}
                                      className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black font-black uppercase text-[9px] rounded-lg transition-all"
                                      title="Restore backup from Google Drive"
                                    >
                                      LOAD
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => loadReportFromGoogleDrive(file.id, file.name)}
                                      disabled={isDriveLoading}
                                      className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-black font-black uppercase text-[9px] rounded-lg transition-all"
                                      title="Load battle markdown report overview"
                                    >
                                      VIEW
                                    </button>
                                  )}
                                  
                                  <button 
                                    onClick={() => deleteFileFromGoogleDrive(file.id, file.name)}
                                    disabled={isDriveLoading}
                                    className="p-1.5 bg-red-500/10 hover:bg-red-500/30 text-neutral-500 hover:text-red-400 border border-red-500/10 hover:border-red-500/20 rounded-lg transition-all"
                                    title="Eradicate file from Drive storage"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom footer bar */}
              <div className="bg-black/40 border-t border-white/5 py-3 px-6 flex justify-between items-center text-[9px] font-mono text-neutral-600 uppercase tracking-widest flex-shrink-0">
                <span>FOLDER_ROOT // SECURE LOCKDOWN</span>
                <span>STATUS_OK</span>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Briefing Overlay */}
      <AnimatePresence>
        {briefingReport && (
          <motion.div 
            key="briefing-overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              key="briefing-overlay-container"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">AI Biological Briefing</h2>
                    <p className="text-xs text-emerald-400/70 font-mono">STRATEGIC ANALYSIS COMPLETED</p>
                  </div>
                </div>
                <button 
                  onClick={() => setBriefingReport(null)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors text-neutral-400 hover:text-white"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-10 prose prose-invert max-w-none prose-emerald prose-sm">
                <div className="whitespace-pre-wrap font-sans leading-relaxed text-neutral-300">
                  {briefingReport}
                </div>
              </div>

              <div className="p-6 border-t border-white/10 bg-black/20 flex justify-end">
                <button 
                  onClick={() => setBriefingReport(null)}
                  className="px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-colors"
                >
                  Return to Simulation
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};
