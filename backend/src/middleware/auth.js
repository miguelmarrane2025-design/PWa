import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { query } from "../db/index.js";

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.trim().startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token não fornecido" });
    }

    const token = authHeader
      .trim()
      .split(/\s+/)[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");

    if (!token) return res.status(401).json({ error: "Token não fornecido" });

    const payload = jwt.verify(token, config.jwt.secret);
    const { rows } = await query("SELECT id, email, name FROM users WHERE id = $1", [payload.userId]);
    if (!rows.length) return res.status(401).json({ error: "User not found" });

    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function optionalAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.trim().startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader
      .trim()
      .split(/\s+/)[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");

    if (!token) return next();

    const payload = jwt.verify(token, config.jwt.secret);
    const { rows } = await query("SELECT id, email, name FROM users WHERE id = $1", [payload.userId]);
    if (rows.length) req.user = rows[0];
  } catch {
    // Optional auth should not fail the request if the token is absent/invalid.
  }

  next();
}
