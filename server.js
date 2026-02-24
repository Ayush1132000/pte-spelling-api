import express from "express";
import cors from "cors";
import { neon } from "@neondatabase/serverless";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const port = process.env.PORT || 3000;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing in environment variables");
  }
  return neon(process.env.DATABASE_URL);
}

// Test route
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "PTE Spelling Practice API is running",
    by: "Aayush Patel"
  });
});

// GET all sections with words
app.get("/api/sections", async (req, res) => {
  try {
    const sql = getSql();

    const sections = await sql`
      SELECT id, name
      FROM sections
      ORDER BY name ASC
    `;

    const words = await sql`
      SELECT section_id, word
      FROM words
      ORDER BY word ASC
    `;

    const map = new Map();

    for (const s of sections) {
      map.set(s.id, { name: s.name, words: [] });
    }

    for (const w of words) {
      const sec = map.get(w.section_id);
      if (sec) sec.words.push(w.word);
    }

    const result = Array.from(map.entries()).map(([id, obj]) => ({
      id: String(id),
      name: obj.name,
      words: obj.words
    }));

    res.json({ sections: result });

  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Admin: Add / Update section
app.post("/api/admin/section-upsert", async (req, res) => {
  try {
    const token = req.header("x-admin-token");

    if (!token || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, words } = req.body || {};

    if (!name || !Array.isArray(words)) {
      return res.status(400).json({ error: "name + words[] required" });
    }

    const cleanWords = words
      .map((w) => String(w).trim())
      .filter(Boolean);

    if (cleanWords.length === 0) {
      return res.status(400).json({ error: "At least 1 word required" });
    }

    const sql = getSql();

    const inserted = await sql`
      INSERT INTO sections (name)
      VALUES (${name})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;

    const sectionId = inserted[0].id;

    await sql`DELETE FROM words WHERE section_id = ${sectionId}`;

    for (const w of cleanWords) {
      await sql`
        INSERT INTO words (section_id, word)
        VALUES (${sectionId}, ${w})
        ON CONFLICT DO NOTHING
      `;
    }

    res.json({ ok: true, sectionId: String(sectionId) });

  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Simple admin save via query params (easy for beginner)
// Example:
// /api/admin/save?token=YOURTOKEN&section=Section%20Name&words=word1,word2,word3
app.get("/api/admin/save", async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const name = String(req.query.section || "").trim();
    const wordsCsv = String(req.query.words || "").trim();

    if (!name || !wordsCsv) {
      return res.status(400).json({ error: "section and words are required" });
    }

    const cleanWords = wordsCsv
      .split(",")
      .map(w => w.trim())
      .filter(Boolean);

    if (cleanWords.length === 0) {
      return res.status(400).json({ error: "No valid words found" });
    }

    const sql = getSql();

    const inserted = await sql`
      INSERT INTO sections (name)
      VALUES (${name})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    const sectionId = inserted[0].id;

    await sql`DELETE FROM words WHERE section_id = ${sectionId}`;

    for (const w of cleanWords) {
      await sql`
        INSERT INTO words (section_id, word)
        VALUES (${sectionId}, ${w})
        ON CONFLICT DO NOTHING
      `;
    }

    res.json({ ok: true, sectionId: String(sectionId), savedWords: cleanWords.length });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
