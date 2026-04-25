// Bridge: re-exports our Winston logger in the format expected by skills
import { logger } from '../lib/logger.js';

export function log(level, message, ...args) {
  const msg = args.length ? `${message} ${args.join(' ')}` : message;
  if (level === 'info')  logger.info(msg);
  else if (level === 'warn')  logger.warn(msg);
  else if (level === 'error') logger.error(msg);
  else if (level === 'debug') logger.debug(msg);
  else logger.info(msg);
}
