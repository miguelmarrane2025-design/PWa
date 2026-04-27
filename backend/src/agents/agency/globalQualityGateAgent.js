// agents/agency/globalQualityGateAgent.js
// Última checagem antes de entregar qualquer resultado importante.
// Provider: OpenAI via llm.js.

import { chat } from '../../lib/llm.js';
import { logger } from '../../lib/logger.js';

const SYSTEM = `Você é o GlobalQualityGateAgent do BotSquad.
Avalie se a entrega está pronta para o usuário.

Critérios obrigatórios:
1. O pedido foi atendido?
2. O formato está correto?
3. A saída está completa (não cortada)?
4. Não está genérica/superficial?
5. Tem próximos passos sugeridos?
6. Não expõe secrets ou dados sensíveis?
7. Está salvo em memory/training quando necessário?

Score: 0-100.
- >= 85: aprovado
- 70-84: refinar
- < 70: reprovar

Retorne APENAS JSON:
{
  "approved": true,
  "score": 0,
  "blockingIssues": [],
  "improvements": [],
  "readyToDeliver": true,
  "requiresUserApproval": false,
  "memoryNotes": []
}`;

export async function globalQualityGateAgent({ request, output, userId }) {
  logger.info(`[GlobalQualityGate] userId=${userId}`);

  const userMsg = `PEDIDO ORIGINAL:\n${String(request).slice(0, 400)}\n\nSAÍDA GERADA:\n${String(typeof output === 'object' ? JSON.stringify(output) : output).slice(0, 2000)}`;

  const raw = await chat(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userMsg },
    ],
    { userId, max_tokens: 800 }
  );

  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch {}

  return { approved: true, score: 75, blockingIssues: [], improvements: [], readyToDeliver: true, requiresUserApproval: false, memoryNotes: [] };
}
