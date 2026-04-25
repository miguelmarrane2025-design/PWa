import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db/index.js";
import { embed } from "../lib/llm.js";

const router = Router();

// ── POST /memory ──────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const { content, tags = [] } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });

  let embedding = null;
  try {
    // FIX #7: pass req.user.id so embed() uses the user's own API key
    const vec = await embed(content, req.user.id);
    embedding = JSON.stringify(vec);
  } catch (_) { /* pgvector optional */ }

  const { rows } = await query(
    "INSERT INTO memory (user_id, content, tags) VALUES ($1, $2, $3) RETURNING id, content, tags, created_at",
    [req.user.id, content, tags]
  );
  res.status(201).json(rows[0]);
});

// ── GET /memory ───────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const { search, limit = 20 } = req.query;
  let rows;

  if (search) {
    const result = await query(
      "SELECT id, content, tags, created_at FROM memory WHERE user_id=$1 AND content ILIKE $2 ORDER BY created_at DESC LIMIT $3",
      [req.user.id, `%${search}%`, parseInt(limit)]
    );
    rows = result.rows;
  } else {
    const result = await query(
      "SELECT id, content, tags, created_at FROM memory WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
      [req.user.id, parseInt(limit)]
    );
    rows = result.rows;
  }

  res.json(rows);
});

// ── DELETE /memory/:id ────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  await query("DELETE FROM memory WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.status(204).end();
});

export default router;
