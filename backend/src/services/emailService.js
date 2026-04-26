import net from "net";
import tls from "tls";
import { config } from "../config/index.js";
import { logger } from "../lib/logger.js";

function smtpConfigured() {
  return Boolean(config.smtp.host && config.smtp.from);
}

function normalizeFrom(value) {
  const match = String(value || "").match(/<([^>]+)>/);
  return match?.[1] || String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMessage({ to, resetUrl }) {
  const subject = "Redefinicao de senha BotSquad";
  const text = [
    "Recebemos uma solicitacao para redefinir sua senha do BotSquad.",
    "",
    `Acesse este link para criar uma nova senha: ${resetUrl}`,
    "",
    "O link expira em 1 hora. Se voce nao solicitou isso, ignore este e-mail.",
  ].join("\n");
  const html = [
    "<p>Recebemos uma solicitacao para redefinir sua senha do BotSquad.</p>",
    `<p><a href="${escapeHtml(resetUrl)}">Redefinir senha</a></p>`,
    "<p>O link expira em 1 hora. Se voce nao solicitou isso, ignore este e-mail.</p>",
  ].join("\n");

  return [
    `From: ${config.smtp.from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="botsquad-reset-boundary"',
    "",
    "--botsquad-reset-boundary",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "--botsquad-reset-boundary",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "--botsquad-reset-boundary--",
    "",
  ].join("\r\n");
}

function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = chunk => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = err => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function expect(socket, command, codes) {
  if (command) socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = Number.parseInt(response.slice(0, 3), 10);
  if (!codes.includes(code)) {
    throw new Error(`SMTP command failed (${code})`);
  }
  return response;
}

function connectSocket() {
  const secure = config.smtp.secure || config.smtp.port === 465;
  const options = { host: config.smtp.host, port: config.smtp.port, servername: config.smtp.host };
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect(options) : net.connect(options);
    socket.setTimeout(15000);
    socket.once("connect", () => resolve(socket));
    socket.once("secureConnect", () => resolve(socket));
    socket.once("timeout", () => reject(new Error("SMTP connection timeout")));
    socket.once("error", reject);
  });
}

async function sendViaSmtp({ to, resetUrl }) {
  let socket = await connectSocket();
  await expect(socket, null, [220]);
  const ehlo = await expect(socket, "EHLO botsquad.online", [250]);

  if (!socket.encrypted && /STARTTLS/i.test(ehlo)) {
    await expect(socket, "STARTTLS", [220]);
    socket = tls.connect({ socket, servername: config.smtp.host });
    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    await expect(socket, "EHLO botsquad.online", [250]);
  }

  if (config.smtp.user && config.smtp.pass) {
    const auth = Buffer.from(`\0${config.smtp.user}\0${config.smtp.pass}`).toString("base64");
    await expect(socket, `AUTH PLAIN ${auth}`, [235]);
  }

  await expect(socket, `MAIL FROM:<${normalizeFrom(config.smtp.from)}>`, [250]);
  await expect(socket, `RCPT TO:<${to}>`, [250, 251]);
  await expect(socket, "DATA", [354]);
  const message = buildMessage({ to, resetUrl }).replace(/^\./gm, "..");
  await expect(socket, `${message}\r\n.`, [250]);
  await expect(socket, "QUIT", [221]);
  socket.end();
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  if (!smtpConfigured()) {
    if (["development", "staging", "test"].includes(config.env)) {
      logger.warn(`[AUTH] SMTP nao configurado. Link de reset gerado apenas em modo desenvolvimento: ${resetUrl}`);
    } else {
      logger.warn("[AUTH] SMTP nao configurado. Link de reset nao foi enviado.");
    }
    return { ok: true, skipped: true };
  }

  await sendViaSmtp({ to, resetUrl });
  return { ok: true, skipped: false };
}
