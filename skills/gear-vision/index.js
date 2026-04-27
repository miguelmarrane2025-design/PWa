// skills/gear-vision/index.js
// Entry point da skill gear-vision.
// Delega para o agente real em backend/src/agents/audio/gearVisionAgent.js

export { gearVisionAgent, createPresetFromImage } from '../../backend/src/agents/audio/gearVisionAgent.js';
export { evaluate } from './evaluator.js';

export const skillId   = 'gear_vision';
export const skillName = 'Gear Vision Agent';
export const domain    = 'audio';
