// integrations/openai-advanced.js — v18.1
// Shim to provider-manager. 35 skill files import { openaiStrong } from here.
//
// FIX #6: removed top-level await from export default.
// The previous version had:
//   export default { openaiStrong: (await import(...)).openaiStrong }
// Top-level await in export default causes unpredictable module init order.
// Now uses a plain re-export — no runtime evaluation at module load time.

export { openaiStrong, openaiFast, chat } from '../lib/provider-manager.js';

// Named export for the default object — no await needed
import { openaiStrong as _strong } from '../lib/provider-manager.js';
export default { openaiStrong: _strong };
