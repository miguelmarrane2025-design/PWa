import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import Joi from "joi";
import rateLimit from "express-rate-limit";
import { query } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPasswordResetEmail } from "../services/emailService.js";

const router = Router();
const RESET_PASSWORD_MESSAGE = "Se este e-mail estiver cadastrado, enviaremos instruções para redefinir sua senha.";
const RESET_TOKEN_TTL_MINUTES = 60;

// ── FIX #6: Rate limit específico para login (brute-force protection) ────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  keyGenerator: (req) => req.ip,
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { ok: true, message: RESET_PASSWORD_MESSAGE },
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
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

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().min(32).required()
    .messages({
      "string.min": "Link de redefinição inválido ou expirado.",
      "any.required": "Link de redefinição inválido ou expirado.",
    }),
  password: Joi.string().min(8).required()
    .messages({
      "string.min": "Senha deve ter no mínimo 8 caracteres",
      "any.required": "Senha deve ter no mínimo 8 caracteres",
    }),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required()
    .messages({
      "any.only": "As senhas precisam ser iguais",
      "any.required": "As senhas precisam ser iguais",
    }),
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

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildResetUrl(token) {
  const base = String(config.appPublicUrl || "http://localhost:5173").replace(/\/+$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
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

router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  const { error, value } = forgotPasswordSchema.validate(req.body);
  if (error) return res.status(400).json({ error: "Informe um e-mail válido." });

  const email = value.email.toLowerCase();
  try {
    const { rows } = await query(
      "SELECT id, email FROM users WHERE email = $1 LIMIT 1",
      [email],
    );

    if (rows.length) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(token);
      const resetUrl = buildResetUrl(token);

      await query(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
        [rows[0].id],
      );
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + ($3 * interval '1 minute'))`,
        [rows[0].id, tokenHash, RESET_TOKEN_TTL_MINUTES],
      );

      try {
        await sendPasswordResetEmail({ to: rows[0].email, resetUrl });
      } catch (mailErr) {
        logger.error(`[AUTH] password reset email failed userId=${rows[0].id}: ${mailErr.message}`);
      }
      logger.info(`[AUTH] password reset requested userId=${rows[0].id} ip=${req.ip}`);
    } else {
      logger.info(`[AUTH] password reset requested for non-existing email ip=${req.ip}`);
    }
  } catch (err) {
    logger.error(`[AUTH] forgot-password error: ${err.message}`);
  }

  res.json({ ok: true, message: RESET_PASSWORD_MESSAGE });
});

router.post("/reset-password", async (req, res) => {
  const { error, value } = resetPasswordSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const tokenHash = hashResetToken(value.token);
  const { rows } = await query(
    `SELECT prt.id, prt.user_id
     FROM password_reset_tokens prt
     WHERE prt.token_hash = $1
       AND prt.used_at IS NULL
       AND prt.expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );

  if (!rows.length) {
    return res.status(400).json({ error: "Link de redefinição inválido ou expirado." });
  }

  const passwordHash = await bcrypt.hash(value.password, 12);
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, rows[0].user_id]);
  await query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [rows[0].id]);
  await query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
    [rows[0].user_id],
  );

  logger.info(`[AUTH] password reset completed userId=${rows[0].user_id}`);
  res.json({ ok: true, message: "Senha redefinida com sucesso." });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name });
});

export default router;
