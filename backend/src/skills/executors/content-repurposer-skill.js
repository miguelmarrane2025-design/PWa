// skills/executors/content-repurposer-skill.js
// Skill: ContentRepurposer — Transforma 1 conteúdo em 10+ formatos diferentes.

import { openaiStrong } from '../../integrations/openai-advanced.js';
import { log } from '../../core/logger.js';

export default async function contentRepurposerSkill(ctx, params, tools) {
  const { memoryMCP } = tools;
  const userId = ctx.userId;
  const conteudoOriginal = params.conteudo || ctx.sessao?.ultimoTexto || '';
  const formato_origem = params.formato_origem || 'video'; // video|artigo|podcast|live|curso
  const nicho = ctx.sessao?.nicho || params.nicho || 'geral';

  if (!conteudoOriginal) {
    return { outputs: [{ tipo: 'texto', conteudo: '📝 Envie o conteúdo que deseja transformar.' }] };
  }

  log('info', `[ContentRepurposer] ${formato_origem} → múltiplos formatos`);

  const prompt = `Transforme este conteúdo em múltiplos formatos para distribuição máxima.

CONTEÚDO ORIGINAL (${formato_origem}):
"${conteudoOriginal.substring(0, 1000)}"

NICHO: "${nicho}"

Retorne JSON com as adaptações:
{
  "tema_central": "o que é este conteúdo em 1 frase",
  "adaptacoes": [
    {
      "formato": "reels/tiktok",
      "plataforma": "Instagram/TikTok",
      "duracao": "30-60s",
      "hook": "gancho de abertura adaptado",
      "roteiro_resumido": "versão compacta do conteúdo",
      "cta": "call to action específico"
    },
    {
      "formato": "carrossel",
      "plataforma": "Instagram",
      "slides": ["Slide 1: ...", "Slide 2: ...", "Slide 3: ...", "Último: CTA"],
      "hook": "título do carrossel"
    },
    {
      "formato": "thread",
      "plataforma": "X/Twitter",
      "tweets": ["Tweet 1 (hook)", "Tweet 2", "Tweet 3", "Tweet final com CTA"]
    },
    {
      "formato": "email",
      "assunto": "linha de assunto",
      "corpo_resumido": "versão email (200 palavras)"
    },
    {
      "formato": "stories_sequencial",
      "plataforma": "Instagram Stories",
      "frames": ["Frame 1", "Frame 2", "Frame 3 (CTA)"]
    },
    {
      "formato": "post_linkedin",
      "conteudo": "versão para LinkedIn (tom profissional)"
    },
    {
      "formato": "pin_pinterest",
      "titulo": "...",
      "descricao": "..."
    },
    {
      "formato": "audio_podcast",
      "intro": "como começar o episódio",
      "roteiro_macro": "estrutura do episódio"
    }
  ],
  "calendario_distribuicao": [
    { "dia": 1, "formato": "reels", "plataforma": "Instagram" },
    { "dia": 2, "formato": "carrossel", "plataforma": "Instagram" },
    { "dia": 3, "formato": "email", "plataforma": "Lista" }
  ]
}`;

  try {
    const resposta = await openaiStrong([{ role: 'user', content: prompt }]);
    const repurpose = JSON.parse(resposta.replace(/```json|```/g, '').trim());

    const linhas = [
      `♻️ *Conteúdo Reutilizado: ${repurpose.tema_central}*`,
      `_De ${formato_origem} para ${repurpose.adaptacoes?.length} formatos_\n`,
      ...repurpose.adaptacoes.map(a => `📌 *${a.formato}* (${a.plataforma || ''})\n${a.hook || a.assunto || a.titulo || ''}`),
      `\n📅 *Calendário:*`,
      ...(repurpose.calendario_distribuicao || []).map(c => `D+${c.dia}: ${c.formato} no ${c.plataforma}`)
    ];

    return {
      conteudoReutilizado: repurpose,
      outputs: [{ tipo: 'texto', conteudo: linhas.join('\n') }]
    };
  } catch (err) {
    log('error', `[ContentRepurposer] ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: '❌ Erro ao reutilizar conteúdo.' }] };
  }
}
