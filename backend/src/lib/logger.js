// lib/logger.js — v22
// Fixed: printf was applied after json() in production, overriding structured output.
// Production: JSON lines to console + files (parseable by Datadog, CloudWatch, etc.)
// Development: colored human-readable format.

import winston from 'winston';
import fs from 'fs';
import { config } from '../config/index.js';

const isProd = config.env === 'production';
fs.mkdirSync(config.storage.logs, { recursive: true });

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),          // ← clean JSON, no printf override
);

const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack }) =>
    stack
      ? `${timestamp} [${level}]: ${message}\n${stack}`
      : `${timestamp} [${level}]: ${message}`,
  ),
);

export const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: isProd ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: `${config.storage.logs}/error.log`,
      level: 'error',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
    new winston.transports.File({
      filename: `${config.storage.logs}/combined.log`,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: `${config.storage.logs}/exceptions.log`,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: `${config.storage.logs}/rejections.log`,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
});
