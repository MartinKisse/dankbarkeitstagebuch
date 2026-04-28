import "dotenv/config";

import express from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const host = "0.0.0.0";
const entriesPath = path.join(__dirname, "entries.json");
const uploadsDir = path.join(__dirname, "uploads");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());

app.get("/api/config", (req, res) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Supabase-Konfiguration fehlt." });
  }

  res.json({
    supabaseUrl,
    supabaseAnonKey,
  });
});

app.use(express.static(path.join(__dirname, "public")));

async function ensureStorage() {
  await fsp.mkdir(uploadsDir, { recursive: true });

  try {
    await fsp.access(entriesPath);
  } catch {
    await fsp.writeFile(entriesPath, "[]\n", "utf8");
  }
}

async function readEntries() {
  await ensureStorage();
  const raw = await fsp.readFile(entriesPath, "utf8");
  return JSON.parse(raw || "[]");
}

async function writeEntries(entries) {
  await fsp.writeFile(entriesPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return null;
}

function normalizeBullets(bullets) {
  if (Array.isArray(bullets)) {
    return bullets.map((bullet) => String(bullet).trim()).filter(Boolean).slice(0, 5);
  }

  if (typeof bullets === "string") {
    return bullets
      .split("\n")
      .map((bullet) => bullet.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  return [];
}

function normalizeEntry(entry) {
  const dateValue = entry.date || entry.createdAt;

  return {
    id: String(entry.id || randomUUID()),
    date: dateValue ? new Date(dateValue).toISOString() : new Date().toISOString(),
    originalText: String(entry.originalText || "").trim(),
    bullets: normalizeBullets(entry.bullets),
    ...(entry.updatedAt ? { updatedAt: new Date(entry.updatedAt).toISOString() } : {}),
  };
}

function normalizeImportedEntry(entry) {
  if (!entry || typeof entry !== "object" || !entry.id || !(entry.date || entry.createdAt)) {
    return null;
  }

  const date = new Date(entry.date || entry.createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const bullets = normalizeBullets(entry.bullets);
  if (!bullets.length) {
    return null;
  }

  return {
    id: String(entry.id),
    date: date.toISOString(),
    originalText: String(entry.originalText || "").trim(),
    bullets,
  };
}

function markdownEscape(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+\-.!|<>])/g, "\\$1")
    .trim();
}

function formatMarkdownDate(dateValue) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(dateValue));
}

function createMarkdownExport(entries) {
  const groupedEntries = new Map();
  const sortedEntries = [...entries]
    .filter((entry) => entry?.date && !Number.isNaN(new Date(entry.date).getTime()))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const entry of sortedEntries) {
    const dayKey = entry.date.slice(0, 10);
    if (!groupedEntries.has(dayKey)) {
      groupedEntries.set(dayKey, []);
    }
    groupedEntries.get(dayKey).push(entry);
  }

  const lines = ["# Dankbarkeitstagebuch", ""];

  for (const [, dayEntries] of groupedEntries) {
    lines.push(`## ${formatMarkdownDate(dayEntries[0].date)}`, "");

    for (const entry of dayEntries) {
      const date = new Date(entry.date);
      const hasTime = /T\d{2}:\d{2}/.test(entry.date);
      const time = hasTime ? new Intl.DateTimeFormat("de-DE", { timeStyle: "short" }).format(date) : "";
      lines.push(`### ${time || "Eintrag"}`, "");

      for (const bullet of entry.bullets || []) {
        lines.push(`- ${markdownEscape(bullet)}`);
      }

      if (entry.originalText) {
        lines.push("", "**Originaltext**", "", markdownEscape(entry.originalText));
      }

      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

async function saveEntry({ originalText, bullets }) {
  const entry = normalizeEntry({ originalText, bullets });

  const entries = await readEntries();
  entries.unshift(entry);
  await writeEntries(entries);

  return entry;
}

function parseBulletResponse(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }

    if (Array.isArray(parsed.bullets)) {
      return parsed.bullets.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall back to parsing normal bullet text below.
  }

  return cleaned
    .split("\n")
    .map((line) => line.replace(/^[-*"\d.)\s]+/, "").replace(/",?$/, "").trim())
    .filter(Boolean);
}

async function createGratitudeBullets(text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Du erstellst einen strukturierten Dankbarkeitstagebuch-Eintrag. Entferne Fuellwoerter, Versprecher und Wiederholungen. Erzeuge 1 bis 5 kurze Stichpunkte. Jeder Stichpunkt muss konkret, positiv, natuerlich, warm und knapp formuliert sein. Nutze nur Inhalte aus dem gesprochenen Text und erfinde nichts hinzu. Fasse aehnliche Inhalte zusammen. Wenn der Text nur ein Test oder kein echter Tagebuchinhalt ist, gib genau einen passenden Stichpunkt wie 'Testeintrag ohne konkreten Dankbarkeitsmoment' aus. Antworte als JSON-Objekt im Format {\"bullets\":[\"...\"]}.",
      },
      {
        role: "user",
        content: text,
      },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  return normalizeBullets(parseBulletResponse(completion.choices[0]?.message?.content || "[]"));
}

async function createDraftFromAudio(file) {
  const audioFile = await toFile(
    fs.createReadStream(file.path),
    file.originalname,
    { type: file.mimetype },
  );

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "gpt-4o-transcribe",
  });

  const originalText = transcription.text?.trim() || "";
  const bullets = await createGratitudeBullets(originalText);

  return { originalText, bullets };
}

app.get("/api/entries", async (req, res) => {
  try {
    const entries = await readEntries();
    res.json(entries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Eintraege konnten nicht geladen werden." });
  }
});

app.get("/api/export/json", async (req, res) => {
  try {
    const entries = await readEntries();
    const today = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="entries-backup-${today}.json"`);
    res.send(`${JSON.stringify(entries, null, 2)}\n`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Backup konnte nicht exportiert werden." });
  }
});

app.get("/api/export/markdown", async (req, res) => {
  try {
    const entries = await readEntries();
    const today = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="dankbarkeitstagebuch-${today}.md"`);
    res.send(createMarkdownExport(entries));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Markdown konnte nicht exportiert werden." });
  }
});

app.post("/api/import/json", async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: "Bitte waehle ein gueltiges JSON-Backup als Array aus." });
    }

    const importedEntries = req.body;
    const entries = await readEntries();
    const existingIds = new Set(entries.map((entry) => entry.id));
    const normalizedEntries = [];
    let skippedDuplicates = 0;
    let invalid = 0;

    for (const rawEntry of importedEntries) {
      const entry = normalizeImportedEntry(rawEntry);

      if (!entry) {
        invalid += 1;
        continue;
      }

      if (existingIds.has(entry.id)) {
        skippedDuplicates += 1;
        continue;
      }

      existingIds.add(entry.id);
      normalizedEntries.push(entry);
    }

    await writeEntries([...normalizedEntries, ...entries].sort((a, b) => new Date(b.date) - new Date(a.date)));

    res.json({
      imported: normalizedEntries.length,
      skippedDuplicates,
      invalid,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Backup konnte nicht importiert werden." });
  }
});

app.post("/api/drafts", upload.single("audio"), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY fehlt in der .env-Datei." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Bitte lade eine Audio-Datei hoch." });
  }

  try {
    const draft = await createDraftFromAudio(req.file);
    res.json(draft);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error?.message
        ? `Audio konnte nicht verarbeitet werden: ${error.message}`
        : "Audio konnte nicht verarbeitet werden.",
    });
  } finally {
    await fsp.rm(req.file.path, { force: true });
  }
});

app.delete("/api/entries/:id", async (req, res) => {
  try {
    const entries = await readEntries();
    const nextEntries = entries.filter((entry) => entry.id !== req.params.id);

    if (nextEntries.length === entries.length) {
      return res.status(404).json({ error: "Eintrag wurde nicht gefunden." });
    }

    await writeEntries(nextEntries);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Eintrag konnte nicht geloescht werden." });
  }
});

app.patch("/api/entries/:id", async (req, res) => {
  const originalText = String(req.body?.originalText || "").trim();
  const bullets = normalizeBullets(req.body?.bullets);

  if (!bullets.length) {
    return res.status(400).json({ error: "Bitte speichere mindestens einen Stichpunkt." });
  }

  try {
    const entries = await readEntries();
    const entryIndex = entries.findIndex((entry) => entry.id === req.params.id);

    if (entryIndex === -1) {
      return res.status(404).json({ error: "Eintrag wurde nicht gefunden." });
    }

    const updatedEntry = {
      ...entries[entryIndex],
      originalText: originalText || entries[entryIndex].originalText || "",
      bullets,
      updatedAt: new Date().toISOString(),
    };

    entries[entryIndex] = updatedEntry;
    await writeEntries(entries);

    res.json(updatedEntry);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error?.message
        ? `Eintrag konnte nicht bearbeitet werden: ${error.message}`
        : "Eintrag konnte nicht bearbeitet werden.",
    });
  }
});

app.post("/api/entries", async (req, res) => {
  try {
    const originalText = String(req.body?.originalText || "").trim();
    const bullets = normalizeBullets(req.body?.bullets);

    if (!originalText) {
      return res.status(400).json({ error: "Der Originaltext darf nicht leer sein." });
    }

    if (!bullets.length) {
      return res.status(400).json({ error: "Bitte speichere mindestens einen Stichpunkt." });
    }

    const entry = await saveEntry({ originalText, bullets });
    res.status(201).json(entry);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error?.message
        ? `Eintrag konnte nicht gespeichert werden: ${error.message}`
        : "Eintrag konnte nicht gespeichert werden.",
    });
  }
});

await ensureStorage();

app.listen(port, host, () => {
  const localIp = getLocalNetworkIp();

  console.log("Dankbarkeitstagebuch laeuft:");
  console.log(`Local:   http://localhost:${port}`);

  if (localIp) {
    console.log(`Network: http://${localIp}:${port}`);
  } else {
    console.log("Network: Lokale IP konnte nicht ermittelt werden. Pruefe deine WLAN-/Netzwerkverbindung.");
  }
});
