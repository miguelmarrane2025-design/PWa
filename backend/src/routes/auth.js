import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from "joi";
import rateLimit from "express-rate-limit";
import { query } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── FIX #6: Rate limit específico para login (brute-force protection) ────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  keyGenerator: (req) => req.ip,
});

const registerSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name:     Joi.string().max(100),
});

const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
});

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name ?? "" };
}

function getPasswordHash(row) {
  return row?.password_hash || row?.password || "";
}

function signToken(userId) {
  return jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

router.post("/register", async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { email, password, name } = value;
  const hash = await bcrypt.hash(password, 12);

  try {
    const { rows } = await query(
      "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name",
      [email, hash, name]
    );
    const token = signToken(rows[0].id);
    logger.info(`[AUTH] register ok email=${email} userId=${rows[0].id}`);
    res.status(201).json({ token, user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already registered" });
    logger.error(`[AUTH] register error email=${email}: ${err.message}`);
    throw err;
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { email, password } = value;
  let rows = [];

  try {
    const result = await query(
      "SELECT id, email, name, password_hash, NULL::text AS password FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    rows = result.rows;
  } catch (err) {
    if (err.code === "42703") {
      const result = await query(
        "SELECT id, email, name, NULL::text AS password_hash, password FROM users WHERE email = $1 LIMIT 1",
        [email]
      );
      rows = result.rows;
    } else {
      logger.error(`[AUTH] login query error email=${email}: ${err.message}`);
      throw err;
    }
  }
  
  // Constant-time comparison to prevent timing attacks
  const dummyHash = '$2a$12$C2zYrx3vCuHYW8IoZryba.uR1ibimH6OzW.dzX.5RUAo54mY6aJ8u';
  const hash = rows.length ? getPasswordHash(rows[0]) : dummyHash;
  let valid = false;
  try {
    valid = Boolean(hash) && await bcrypt.compare(password, hash);
  } catch (err) {
    logger.warn(`[AUTH] bcrypt compare failed email=${email}: ${err.message}`);
    valid = false;
  }

  if (!rows.length || !valid) {
    logger.warn(`[AUTH] login failed email=${email} ip=${req?.ip}`);
    return res.status(401).json({ error: "Email ou senha inválidos" });
  }

  const token = signToken(rows[0].id);
  logger.info(`[AUTH] login ok email=${email} userId=${rows[0].id}`);
  res.json({ token, user: publicUser(rows[0]) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name });
});

export default router;
