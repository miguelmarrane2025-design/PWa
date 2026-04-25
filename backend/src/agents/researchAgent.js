// agents/researchAgent.js
// ResearchAgent — Pesquisa automática e inteligente.
// Detecta automaticamente:
//   • @perfil / URL de rede social → análise completa de perfil
//   • pergunta de mercado / nicho   → pesquisa web + síntese
//   • tópico geral                 → fact-finding estruturado
//
// Fluxo para perfis:
//   1. Detecta plataforma pelo handle / URL
//   2. Busca dados reais via social-apis (YouTube API / RapidAPI / SocialBlade)
//   3. Faz web search complementar para posts recentes, bio e contexto
//   4. Extrai métricas, formatos de conteúdo e links relevantes
//   5. Gera relatório analítico via LLM
//
// Dependências (injetadas pelo orquestrador como `tools`):
//   openaiStrong, webSearch, webScraper (opcionais mas recomendados)
// Fallback: funciona só com chat() se nenhuma tool estiver disponível.

import { chat } from '../lib/llm.js';
import { log }  from '../core/logger.js';

// ─── Padrões de detecção ─────────────────────────────────────────────────

const PLATFORM_PATTERNS = [
  { platform: 'youtube',   re: /youtube\.com\/(channel|c|@|user)\/([^\s/]+)|youtu\.be\/([^\s/]+)|@([a-z0-9_.-]+)\s*(?:youtube|yt)/i },
  { platform: 'instagram', re: /instagram\.com\/([^\s/]+)|@([a-z0-9_.]+)\s*(?:instagram|ig|insta)/i },
  { platform: 'tiktok',    re: /tiktok\.com\/@([^\s/]+)|@([a-z0-9_.]+)\s*(?:tiktok|tt)/i },
];

// Handle genérico @usuario (sem plataforma explícita)
const GENERIC_HANDLE_RE = /^@([a-z0-9_.]+)$/i;
// URL direta de perfil
const PROFILE_URL_RE = /https?:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\/[@]?([^\s?#/]+)/i;

// ─── Helpers ──────────────────────────────────────────────────────────────

function detectProfile(message) {
  // 1. URL explícita
  const urlMatch = message.match(PROFILE_URL_RE);
  if (urlMatch) {
    const host = urlMatch[2].toLowerCase();
    const identifier = '@' + urlMatch[3].replace(/^@/, '');
    const platform = host.includes('youtube') || host.includes('youtu.be')
      ? 'youtube'
      : host.includes('instagram') ? 'instagram' : 'tiktok';
    return { platform, identifier, rawUrl: urlMatch[0] };
  }

  // 2. Padrões com plataforma explícita
  for (const { platform, re } of PLATFORM_PATTERNS) {
    const m = message.match(re);
    if (m) {
      const identifier = '@' + (m[1] || m[2] || m[3] || m[4] || '').replace(/^@/, '');
      return { platform, identifier };
    }
  }

  // 3. Handle genérico — infere plataforma pelo contexto
  const words = message.trim().split(/\s+/);
  for (const w of words) {
    const m = w.match(GENERIC_HANDLE_RE);
    if (m) {
      const ctx = message.toLowerCase();
      const platform = ctx.includes('youtube') || ctx.includes('yt') ? 'youtube'
                     : ctx.includes('tiktok')  || ctx.includes('tt') ? 'tiktok'
                     : 'instagram';
      return { platform, identifier: w, inferred: true };
    }
  }

  return null;
}

function formatNumber(n) {
  if (!n) return 'N/D';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + 'K';
  return String(n);
}

function buildProfileSummary(apiData) {
  if (!apiData || apiData.error) return null;
  const lines = [];
  const ch = apiData.channel || apiData.profile || {};

  // Métricas principais
  const metrics = [];
  if (ch.subscribers    != null) metrics.push(`👥 ${formatNumber(ch.subscribers)} inscritos`);
  if (ch.followers      != null) metrics.push(`👥 ${formatNumber(ch.followers)} seguidores`);
  if (ch.totalViews     != null) metrics.push(`👁 ${formatNumber(ch.totalViews)} views totais`);
  if (ch.videoCount     != null) metrics.push(`🎬 ${ch.videoCount} vídeos`);
  if (ch.posts          != null) metrics.push(`📸 ${ch.posts} posts`);
  if (ch.likes          != null) metrics.push(`❤️ ${formatNumber(ch.likes)} curtidas totais`);
  if (ch.engagementRate != null) metrics.push(`📊 ${ch.engagementRate}% engagement`);
  if (ch.isVerified)             metrics.push('✅ Verificado');
  if (metrics.length) lines.push('**Métricas:** ' + metrics.join(' · '));

  // SocialBlade
  if (apiData.socialBlade && !apiData.socialBlade.error) {
    const sb = apiData.socialBlade;
    const sbParts = [];
    if (sb.grade)        sbParts.push(`Nota: ${sb.grade}`);
    if (sb.monthlySubs)  sbParts.push(`~${sb.monthlySubs} inscritos/mês`);
    if (sb.monthlyViews) sbParts.push(`~${sb.monthlyViews} views/mês`);
    if (sbParts.length)  lines.push('**SocialBlade:** ' + sbParts.join(' · '));
    if (sb.url) lines.push(`🔗 ${sb.url}`);
  }

  // Últimos vídeos / posts
  if (apiData.recentVideos?.length) {
    lines.push('\n**📹 Últimos vídeos:**');
    apiData.recentVideos.slice(0, 5).forEach((v, i) => {
      lines.push(
        `${i + 1}. "${v.title}" — 👁 ${formatNumber(v.views)} views · ❤️ ${formatNumber(v.likes)} likes` +
        (v.url ? ` · [Ver](${v.url})` : ''),
      );
    });
  }

  // Links diretos
  const links = [];
  const handle = (ch.customUrl || ch.username || '').replace(/^@/, '');
  if (apiData.platform === 'youtube' && apiData.channel?.id)
    links.push(`YouTube: https://youtube.com/channel/${apiData.channel.id}`);
  if (apiData.platform === 'instagram' && handle)
    links.push(`Instagram: https://instagram.com/${handle}`);
  if (apiData.platform === 'tiktok' && handle)
    links.push(`TikTok: https://tiktok.com/@${handle}`);
  if (apiData.socialBlade?.url)
    links.push(`SocialBlade: ${apiData.socialBlade.url}`);
  if (links.length) lines.push('\n**🔗 Links:**\n' + links.map(l => `• ${l}`).join('\n'));

  // Bio
  const bio = ch.description || ch.bio;
  if (bio) lines.push(`\n**Bio:** ${bio.slice(0, 250)}${bio.length > 250 ? '…' : ''}`);

  return lines.join('\n');
}

// ─── Prompts ──────────────────────────────────────────────────────────────

function buildProfilePrompt(profile, platform, metricsBlock, webContext) {
  return `Você é um analista de redes sociais especialista em estratégia de conteúdo.

Analise o perfil **${profile}** na plataforma **${platform}**.

${metricsBlock ? `## Dados reais coletados automaticamente\n${metricsBlock}\n` : ''}
${webContext   ? `## Contexto adicional (web search)\n${webContext}\n`         : ''}

Gere um relatório completo contendo:

### 1. 🧠 Perfil Estratégico
- Posicionamento e nicho
- Tom de voz e persona
- Proposta de valor única

### 2. 📊 Análise de Métricas
- Tamanho e crescimento estimado
- Engajamento relativo ao nicho
- Pontos fortes e pontos de atenção

### 3. 🎬 Análise de Conteúdo
- Formatos dominantes (Reels, Shorts, carrossel, etc.)
- Frequência e consistência
- Ganchos e estrutura narrativa recorrente
- Posts com melhor desempenho aparente

### 4. 🪝 Padrões Virais Identificados
- Hooks mais usados (primeiros segundos / primeira linha)
- Gatilhos emocionais recorrentes
- CTAs predominantes

### 5. 💡 Oportunidades e Lacunas
- O que o concorrente NÃO está fazendo
- Formatos subutilizados
- Temas com potencial inexplorado

### 6. 🔗 Links Úteis
- Perfil oficial
- SocialBlade (se disponível)
- Outros links relevantes

Responda em português. Seja analítico, direto e entregue insights acionáveis.`;
}

const RESEARCH_SYSTEM = `Você é o Research Specialist da BotSquad. Especialidades:
- Análise de mercado e concorrência
- Síntese de dados e tendências
- Pesquisa técnica e documentação
- Inteligência competitiva de redes sociais

Responda sempre em português. Seja preciso, cite sua linha de raciocínio e estruture bem as respostas.`;

const SYSTEM_OVERRIDES = {
  social: `Você é o Social Radar da BotSquad. Especialidades:
- Análise de dados reais de YouTube, Instagram e TikTok
- Métricas de engajamento, alcance e crescimento
- Comparação de performance entre perfis e canais
- Identificação de tendências por plataforma
- Benchmarks de nicho e estratégias de distribuição
Responda sempre em português. Seja analítico e apresente dados de forma estruturada.`,

  growth: `Você é o Growth Agent da BotSquad. Especialidades:
- Estratégias de crescimento acelerado de canais
- Otimização de retenção de audiência
- SEO para YouTube, Instagram e TikTok
- Distribuição multicanal e reaproveitamento de conteúdo
- Monetização e expansão de receita para criadores
- Análise de métricas e experimentos de crescimento
Responda sempre em português. Entregue estratégias acionáveis com passos claros.`,
};

// ─── Agent principal ──────────────────────────────────────────────────────

export async function researchAgent({ userId, message, context = [], tools = {}, _systemOverride = null }) {
  const { webSearch, webScraper, openaiStrong } = tools;
  const activeSystem = (_systemOverride && SYSTEM_OVERRIDES[_systemOverride]) || RESEARCH_SYSTEM;

  log('info', `[ResearchAgent] Mensagem: "${message.slice(0, 80)}"`);

  // ── 1. Detecta se é análise de perfil ─────────────────────────────────
  const profileInfo = detectProfile(message);

  if (profileInfo) {
    const { platform, identifier, inferred } = profileInfo;
    log('info', `[ResearchAgent] Perfil detectado → ${identifier} (${platform}${inferred ? ', inferido' : ''})`);

    let apiData      = null;
    let metricsBlock = '';
    let webContext   = '';

    // ── 1a. Tenta API real via social-apis ─────────────────────────────
    try {
      const { analyzeProfile } = await import('../integrations/social-apis.js');
      apiData = await analyzeProfile({ platform, identifier, userId });
      log('info', `[ResearchAgent] API data sources: ${JSON.stringify(apiData.sources)}`);
      metricsBlock = buildProfileSummary(apiData) || '';
    } catch (err) {
      log('warn', `[ResearchAgent] API failed (${err.message}) — usando web search`);
    }

    // ── 1b. Web search complementar (posts recentes, contexto) ────────
    if (webSearch) {
      try {
        const queries = [
          `${identifier} ${platform} perfil conteúdo estratégia`,
          `${identifier} ${platform} posts virais engajamento`,
          `${identifier} seguidores nicho`,
        ];
        const results = await Promise.allSettled(queries.map(q => webSearch(q).catch(() => null)));
        const snippets = results
          .filter(r => r.status === 'fulfilled' && r.value)
          .flatMap(r => {
            const v = r.value;
            if (typeof v === 'string') return [v];
            if (Array.isArray(v))      return v.map(i => i?.snippet || i?.description || '').filter(Boolean);
            if (v?.results)            return v.results.map(i => i?.snippet || '').filter(Boolean);
            return [];
          })
          .slice(0, 10);

        if (snippets.length) {
          webContext = snippets.join('\n\n');
          log('info', `[ResearchAgent] Web snippets: ${snippets.length}`);
        }
      } catch (err) {
        log('warn', `[ResearchAgent] Web search failed: ${err.message}`);
      }
    }

    // ── 1c. Scraping SocialBlade se webScraper disponível e sem dados ──
    if (webScraper && platform === 'youtube' && !apiData?.socialBlade) {
      try {
        const handle = identifier.replace('@', '');
        const html = await webScraper(`https://socialblade.com/youtube/user/${handle}`);
        const grade = html?.match(/Grade.*?>([A-Z][+-]?)</i)?.[1];
        if (grade) webContext += `\nSocialBlade grade: ${grade}`;
      } catch (_) { /* silencioso */ }
    }

    // ── 1d. Gera relatório analítico via LLM ───────────────────────────
    const profilePrompt = buildProfilePrompt(identifier, platform, metricsBlock, webContext);

    const intro = [
      `🔍 **Analisando perfil: ${identifier}** (${platform})`,
      apiData?.sources?.length
        ? `📡 Dados coletados de: ${apiData.sources.join(', ')}`
        : '⚠️ APIs externas indisponíveis — análise via web search + LLM',
      '',
    ].join('\n');

    const llmMessages = [
      { role: 'system', content: activeSystem },
      ...context,
      { role: 'user', content: profilePrompt },
    ];

    const llmOpts = { userId, temperature: 0.3, max_tokens: 3000 };
    const analysis = openaiStrong
      ? await openaiStrong(llmMessages, llmOpts)
      : await chat(llmMessages, llmOpts);

    return {
      type:     'text',
      content:  intro + analysis,
      metadata: {
        agent:      'research',
        subtype:    'profile_analysis',
        platform,
        identifier,
        sources:    apiData?.sources || ['web_search', 'llm'],
        apiData,
      },
    };
  }

  // ── 2. Pesquisa geral (sem perfil detectado) ──────────────────────────
  log('info', '[ResearchAgent] Modo pesquisa geral');

  let webContext = '';

  if (webSearch) {
    try {
      const q = message.replace(/pesquise|busque|encontre|analise|analyze/gi, '').trim();
      const res = await webSearch(q);
      if (res) {
        const snippets = Array.isArray(res)
          ? res.map(r => r?.snippet || r?.description || '').filter(Boolean).slice(0, 8)
          : typeof res === 'string' ? [res] : [];
        if (snippets.length) {
          webContext = `\n\n## Dados coletados via web search\n${snippets.join('\n\n')}`;
          log('info', `[ResearchAgent] General search: ${snippets.length} snippets`);
        }
      }
    } catch (err) {
      log('warn', `[ResearchAgent] General search failed: ${err.message}`);
    }
  }

  const augmentedMessage = webContext
    ? `${message}${webContext}\n\nCom base nos dados acima, responda de forma estruturada e analítica.`
    : message;

  const content = await chat(
    [
      { role: 'system', content: activeSystem },
      ...context,
      { role: 'user', content: augmentedMessage },
    ],
    { userId, temperature: 0.3, max_tokens: 3000 },
  );

  return {
    type:     'text',
    content,
    metadata: {
      agent:   'research',
      subtype: 'general',
      sources: webContext ? ['web_search', 'llm'] : ['llm'],
    },
  };
}
