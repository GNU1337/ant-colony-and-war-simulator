/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Gemini Initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API Routes
app.post("/api/briefing", async (req, res) => {
  try {
    const { stats } = req.body;
    
    const prompt = `You are a world-class Military Historian, Simulation Scientist, and one of the top 5 global experts in Medieval Military Operations, Tactics, and Computational Wargaming. 

Analyze the following tactical simulation results and provide a highly detailed, PhD-level strategic and historical briefing in clean, beautiful Markdown format.

Simulation Data:
${JSON.stringify(stats, null, 2)}

In your wargaming brief, you must address the following areas with intellectual rigor and vivid narrative style:
1. **EXECUTIVE SUMMARY**: A high-level military report summarizing the conflict, identifying the theater of war, and declaring the final outcome.
2. **HISTORICAL PARALLELS & COMBAT DOCTRINES**: Match each colony's performance, upgrades, and stats to real-world medieval military systems, e.g.:
   - High defensive/strength focus matches Byzantine defense networks, Swiss pike squares, or the English longbow defensive works at Agincourt.
   - High speed/aggressiveness matches Mongol light cavalry, Magyar raiding swarms, or Norman cavalry charges.
   - Resource mobilization and worker count matches feudal logistical networks, Roman road cohorts, or Genoese crossbow contract logistics.
3. **LOGISTICAL EFFICIENCY & FISCAL ANALYSIS**: Evaluate their Income-to-Expense ratio (Resource Efficiency Index). Express this as a wargame trade-off detail. Why did a colony fail or succeed based on its grain/resource supply lines?
4. **THE "PLAY OF THE BATTLE" (MVP COLONY & UNIT)**: Decide which colony demonstrated the most masterclass tactical play (mentioning specific stats (kills, upgrades, survival)), and declare the MVP Unit Type of the entire battle (e.g. Titan/Heavy Infantry, Acid Spitter/Siege artillery, Poisoner/Skirmisher) with tactical justification.
5. **RECOMMENDATIONS FOR FIELD COMMANDERS**: Provide 3 grand strategic maxims or defensive amendments based on the tactical lessons of this battle.

Keep the tone highly professional, deeply scholarly, evocative of medieval treatise manuals, and packed with military terminology (e.g., "mantelets", "logistical attrition", "eschelons", "martial hegemony", "chivalric vanguard", "foraging contingents"). Format beautifully with headers, rich bullet points, and highlight quotes.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ report: response.text });
  } catch (error: any) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Failed to generate AI briefing: " + error.message });
  }
});

// Vite Middleware
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
