// core/intent-engine.js
// Usa OpenAI (modelo forte) para entender o que o usuário quer.
// Retorna um objeto JSON estruturado com domain, task, e parâmetros.

import { openaiStrong } from '../integrations/openai-advanced.js';
import { parseJsonSafe, callIAComRetry } from './json-validator.js';
import { log } from './logger.js';

// Prompt de sistema para classificação de intenção
const SYSTEM_PROMPT = `Você é o Intent Engine de um sistema de bot inteligente. 
Sua única função é analisar a mensagem do usuário + contexto da sessão e retornar um JSON estruturado classificando a intenção.

Domínios disponíveis:
- "content" → infoproduto, tráfego, funil, copy, aprendizado, roteiro, script, hook, gancho, legenda, post, carrossel de texto, anúncio, VSL, email, oferta, headline, CTA, escrever, criar conteúdo, criar copy, criar roteiro, bio, sequência de email
- "visual" → carrossel visual, thumbnail, thumb, imagem, gerar imagem, criar imagem, criativo, banner, capa, design, arte, foto, prompt de imagem, prompt para ChatGPT gerar imagem
- "audio" → IR, impulse response, timbre, som de guitarra, worship, hillsong, bethel, EQ de áudio, reverb de convoluação, blend de IR, processamento de áudio
- "pedal" → preset de pedaleira, HX Stomp, Helix, Quad Cortex, Kemper, configuração de amp, Marshall, Fender, clean, overdrive, distorção
- "research" → pesquisar, buscar tendência, o que está bombando, analise o mercado, pesquisa de nicho, autopesquisa
- "hunter" → analisa perfil, analisa o @, métricas do Instagram, métricas do TikTok, análise de canal YouTube, quem é esse criador
- "investigator" → investigar canal, investigar perfil, análise profunda de canal, profile investigator, hooks desse canal, CTAs desse perfil, estratégia do criador
- "product" → criar infoproduto, lançamento, produto digital, validar produto, oferta, mecanismo, funil de lançamento, VSL de lançamento, escada de valor, mentoria, curso
- "social" → YouTube analytics, Instagram analytics, TikTok analytics, dados reais de redes sociais, engajamento real, crescimento de canal
- "system" → feedback, status do sistema, limpar sessão, automação, risco, compliance
- "video" → editar vídeo, cortar vídeo, remover silêncio, legendas, reels, tiktok, shorts, videomaker, criar legenda para vídeo
- "analytics" → performance, métricas, relatório, dados, resultado
- "strategy" → estratégia, planejamento, ecossistema, automação, riscos
- "growth" → audiência, retenção, SEO, distribuição, monetização, canais

REGRA IMPORTANTE: Se o usuário pedir para "criar", "fazer", "gerar" algo, classifique pelo TIPO:
- texto/copy/roteiro/hook/email/bio → "content"
- imagem/visual/thumbnail/carrossel visual/prompt de imagem → "visual"  
- áudio/IR/timbre/som → "audio"
- pesquisa/busca/tendência → "research"
- análise de perfil/@/canal → "hunter"
- análise profunda/investigação de canal/estratégia de criador → "investigator"
- infoproduto/lançamento/oferta/funil completo → "product"
- dados reais de redes sociais/analytics → "social"

Se a confiança for < 0.6, use domain "content" como fallback (mais comum).

Tarefas por domínio:
content: create_product | create_traffic | create_funnel | create_copy | analyze_niche | create_script | build_offer | validate_product | build_mechanism | repurpose_content | write_script | write_email | optimize_bio
visual: create_carousel | create_prompt_pack | create_thumb | create_creative | extract_svg | optimize_thumbnail | create_prompt
audio: refine_ir | compare_ir | blend_ir | tone_match | analyze_audio
pedal: create_preset | read_photo | configure_amp | suggest_settings
research: auto_search | auto_learn | predict_trends | collect_feedback | run_experiment
hunter: analyze_profile | compare_profiles | build_persona
investigator: analyze_profile | compare_profiles | track_performance
product: create_product | validate_product | build_offer | build_mechanism | build_funnel | expand_monetize
social: analyze_platform | build_audience | plan_content
system: process_feedback | clear_session | show_status | log_data | analyze_performance
video: edit_short | edit_long | add_captions | remove_silence | create_reels
analytics: log_data | analyze_performance | generate_report | register_metric
strategy: plan_strategy | build_ecosystem | manage_automation | assess_risk | optimize_learning
growth: build_audience | optimize_retention | optimize_seo | optimize_distribution | expand_monetization | remodel_channel | plan_social_media | schedule_content | optimize_offer

Para o domínio research, extraia também: categorias (array de [copy, hooks, ganchos, infoprodutos, tendencias]) e profundidade (media ou profunda).
Para visual/extract_svg, extraia: url (URL do site).
Para hunter/investigator, extraia: perfis (array de handles/URLs), plataforma (instagram|tiktok|youtube|null) e foco (array de [visual, retencao, crescimento, comparativo]).
Para product, extraia: tipo_produto (curso|mentoria|ebook|comunidade|servico), nicho, publico.

Retorne APENAS um JSON válido, sem texto adicional, sem markdown:
{
  "domain": "audio",
  "task": "refine_ir",
  "style": "worship",
  "substyle": null,
  "context": "igreja",
  "guitarra": "strato",
  "pedaleira": "hx_stomp",
  "amp": null,
  "objetivo": ["menos_harsh", "mais_brilho"],
  "nicho": null,
  "formato": null,
  "confianca": 0.95,
  "resumo": "Refinar IR para worship em contexto de igreja com menos harsh"
}

Se não conseguir classificar com confiança acima de 0.6, retorne:
{"domain": null, "task": null, "confianca": 0.0, "resumo": "Não entendido"}`;

class IntentEngine {
  async analisar(sessao, userId = null) {
    // FIX #11: was self-referencing (_openai calling _openai) → infinite recursion
    // All chat messages hit this path; the bug caused every skill to silently fail
    // and fall through to the generic LLM fallback, making the 37 skills unreachable.
    const _openai = (msgs, opts = {}) => openaiStrong(msgs, { ...opts, userId });
    // Monta contexto completo para o modelo
    const contextoSessao = this._montarContextoSessao(sessao);
    const textoUsuario = sessao.ultimoTexto || '';

    if (!textoUsuario && !sessao.ultimoIR && !sessao.ultimaFoto && !sessao.ultimoAudio) {
      return null;
    }

    // Se só tem arquivo sem texto, tenta inferir pelo tipo
    if (!textoUsuario) {
      return this._inferirPorArquivo(sessao);
    }

    try {
      const resposta = await _openai([
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `SESSÃO ATUAL:\n${JSON.stringify(contextoSessao, null, 2)}\n\nMENSAGEM DO USUÁRIO:\n"${textoUsuario}"`
        }
      ]);

      const intencao = parseJsonSafe(resposta, null);
      if (!intencao) throw new Error("JSON inválido retornado pelo Intent Engine");

      // Enriquece com dados da sessão se o modelo não extraiu
      if (!intencao.guitarra && sessao.guitarra) intencao.guitarra = sessao.guitarra;
      if (!intencao.pedaleira && sessao.pedaleira) intencao.pedaleira = sessao.pedaleira;
      if (!intencao.amp && sessao.amp) intencao.amp = sessao.amp;
      if (!intencao.style && sessao.estilo) intencao.style = sessao.estilo;
      if (!intencao.context && sessao.contexto) intencao.context = sessao.contexto;

      // Garante objetivo tonal da sessão
      if ((sessao.ajustesTonais || []).length > 0 && (!intencao.objetivo || intencao.objetivo.length === 0)) {
        intencao.objetivo = sessao.ajustesTonais;
      }

      log('info', `Intent: ${intencao.domain}/${intencao.task} (confiança: ${intencao.confianca})`);

      // Retorna null se confiança muito baixa
      if (intencao.confianca < 0.6 || !intencao.domain) {
        return null;
      }

      return intencao;

    } catch (err) {
      log('error', 'Erro no Intent Engine:', err.message);
      // Fallback: tenta classificação simples por palavras-chave
      return this._classificacaoFallback(textoUsuario, sessao);
    }
  }

  // Infere intenção quando só tem arquivo (sem texto)
  _inferirPorArquivo(sessao) {
    if (sessao.ultimoIR) {
      return {
        domain: 'audio',
        task: 'refine_ir',
        style: sessao.estilo,
        context: sessao.contexto,
        guitarra: sessao.guitarra,
        pedaleira: sessao.pedaleira,
        objetivo: sessao.ajustesTonais,
        confianca: 0.7,
        resumo: 'IR recebido — refinamento padrão'
      };
    }
    if (sessao.ultimaFoto) {
      return {
        domain: 'pedal',
        task: 'read_photo',
        guitarra: sessao.guitarra,
        pedaleira: sessao.pedaleira,
        confianca: 0.7,
        resumo: 'Foto recebida — leitura de pedaleira'
      };
    }
    return null;
  }

  // Fallback por palavras-chave simples quando OpenAI falha
  _classificacaoFallback(texto, sessao) {
    const t = texto.toLowerCase();

    if (t.includes('copy') || t.includes('headline') || t.includes('gancho') || t.includes('hook') || t.includes('anúncio') || t.includes('anuncio')) {
      return { domain: 'content', task: 'create_copy', confianca: 0.88, resumo: 'Criar copy' };
    }
    if (t.includes('carrossel') || t.includes('carousel') || t.includes('slides') || t.includes('post em slides')) {
      if (t.includes('prompt') || t.includes('imagem') || t.includes('foto') || t.includes('visual')) {
        return { domain: 'visual', task: 'create_prompt_pack', confianca: 0.88, resumo: 'Criar pacote de prompts para carrossel' };
      }
      return { domain: 'visual', task: 'create_carousel', confianca: 0.8, resumo: 'Criar carrossel' };
    }
    if (t.includes('thumb')) return { domain: 'visual', task: 'create_thumb', confianca: 0.8, resumo: 'Criar thumbnail' };
    if (t.includes('melhores momentos') || t.includes('corte esse vídeo') || t.includes('cortar vídeo') || t.includes('cortar video') || t.includes('editar vídeo') || t.includes('editar video') || t.includes('reels') || t.includes('shorts') || t.includes('legenda')) {
      return { domain: 'video', task: 'create_clips', confianca: 0.9, resumo: 'Criar cortes de vídeo' };
    }
    if ((t.includes('nicho') || t.includes('nichos')) && (t.includes('canal') || t.includes('youtube') || t.includes('tiktok') || t.includes('faceless') || t.includes('dark'))) {
      return { domain: 'channel', task: 'find_niches', confianca: 0.9, resumo: 'Pesquisar nichos para canal' };
    }
    if ((t.includes('foto') || t.includes('print') || t.includes('screenshot')) && (t.includes('pedaleira') || t.includes('preset') || t.includes('timbre'))) {
      return { domain: 'audio', task: 'create_preset_from_image', confianca: 0.9, resumo: 'Criar preset a partir de imagem' };
    }
    if (t.includes('canal dark') || (t.includes('histórias bíblicas') && (t.includes('tiktok') || t.includes('youtube')))) {
      return { domain: 'channel', task: 'dark_niche_research', confianca: 0.88, resumo: 'Planejar canal dark' };
    }
    if (t.includes('analise esse perfil') || t.includes('analisa esse perfil') || t.includes('analise o perfil') || t.includes('analisa o perfil') || (t.includes('perfil') && t.includes('ideias de vídeos')) || (t.includes('perfil') && t.includes('ideias de videos'))) {
      return { domain: 'growth', task: 'analyze_profile', confianca: 0.88, resumo: 'Analisar perfil para crescimento' };
    }
    if (
      t.includes('preset')
      || t.includes('pedaleira')
      || t.includes('tank-g')
      || t.includes('blackbox')
      || t.includes('hx stomp')
      || t.includes('zoom g1')
      || t.includes('m-vave')
    ) {
      return { domain: 'audio', task: 'create_preset', confianca: 0.88, resumo: 'Criar preset de áudio/gear' };
    }
    if (t.includes('refina') || t.includes('refine') || t.includes('ir')) return { domain: 'audio', task: 'refine_ir', confianca: 0.75, resumo: 'Refinar IR' };
    if (t.includes('infoproduto') || t.includes('produto')) return { domain: 'content', task: 'create_product', confianca: 0.8, resumo: 'Criar produto' };
    if (t.includes('tráfego') || t.includes('trafego') || t.includes('hook')) return { domain: 'content', task: 'create_traffic', confianca: 0.8, resumo: 'Criar tráfego' };
    if (t.includes('funil') || t.includes('funnel')) return { domain: 'content', task: 'create_funnel', confianca: 0.8, resumo: 'Criar funil' };
    if (t.includes('preset')) return { domain: 'pedal', task: 'create_preset', confianca: 0.8, resumo: 'Criar preset' };

    // Novos domínios
    if (t.includes('autopesquis') || t.includes('pesquisa automática') || t.includes('buscar copy') || t.includes('buscar hook')) return { domain: 'research', task: 'auto_search', confianca: 0.85, resumo: 'AutoPesquisa de referências' };
    if (t.includes('aprender automático') || t.includes('atualizar base') || t.includes('autolearner')) return { domain: 'research', task: 'auto_learn', confianca: 0.85, resumo: 'Ciclo de aprendizado automático' };
    if (t.includes('extrair svg') || t.includes('pegar svg') || t.includes('svgs do site')) return { domain: 'visual', task: 'extract_svg', confianca: 0.9, resumo: 'Extrair SVGs de site' };
    if (t.includes('hunter') || t.includes('analisar perfil') || t.includes('analise de perfil') || t.includes('métricas do perfil') || t.includes('tiktok') || (t.includes('instagram') && t.includes('analis')) || (t.includes('youtube') && t.includes('analis'))) return { domain: 'hunter', task: 'analyze_profile', confianca: 0.85, resumo: 'Hunter: analisar perfil de rede social' };
    if (t.includes('comparar perfis') || t.includes('compare perfil')) return { domain: 'hunter', task: 'compare_profiles', confianca: 0.85, resumo: 'Hunter: comparar perfis' };
    if (t.includes('investigar canal') || t.includes('investigar perfil') || t.includes('profile investigator') || t.includes('hooks desse canal') || t.includes('ctas desse') || t.includes('estratégia do criador')) return { domain: 'investigator', task: 'analyze_profile', confianca: 0.87, resumo: 'Investigator: análise profunda de canal' };
    if (t.includes('lançamento') || t.includes('produto digital') || t.includes('escada de valor') || t.includes('mecanismo') || (t.includes('funil') && t.includes('lançamento'))) return { domain: 'product', task: 'create_product', confianca: 0.85, resumo: 'Product: criar infoproduto/lançamento' };
    if (t.includes('validar produto') || t.includes('validar oferta')) return { domain: 'product', task: 'validate_product', confianca: 0.85, resumo: 'Product: validar produto' };
    if (t.includes('roteiro') || t.includes('script para') || t.includes('escrever roteiro')) return { domain: 'content', task: 'write_script', confianca: 0.85, resumo: 'Content: escrever roteiro' };
    if (t.includes('sequência de email') || t.includes('email de lançamento') || t.includes('email sequence')) return { domain: 'content', task: 'write_email', confianca: 0.85, resumo: 'Content: sequência de email' };
    if (t.includes('otimizar bio') || t.includes('bio do instagram') || t.includes('bio do youtube')) return { domain: 'content', task: 'optimize_bio', confianca: 0.85, resumo: 'Content: otimizar bio' };
    if (t.includes('prompt de imagem') || t.includes('prompt para') || t.includes('gerar prompt')) return { domain: 'visual', task: 'create_prompt', confianca: 0.85, resumo: 'Visual: gerar prompt de imagem' };
    if (t.includes('crescimento') || t.includes('crescer canal') || t.includes('métricas de crescimento')) return { domain: 'growth', task: 'build_audience', confianca: 0.8, resumo: 'Growth: crescimento de canal' };
    if (t.includes('risco') || t.includes('compliance') || t.includes('auditoria')) return { domain: 'system', task: 'assess_risk', confianca: 0.8, resumo: 'System: avaliação de risco' };

    return null;
  }

  _montarContextoSessao(sessao) {
    return {
      pedaleira: sessao.pedaleira,
      amp: sessao.amp,
      guitarra: sessao.guitarra,
      estilo: sessao.estilo,
      contexto: sessao.contexto,
      ajustesTonais: sessao.ajustesTonais,
      temIR: !!sessao.ultimoIR,
      temFoto: !!sessao.ultimaFoto,
      temAudio: !!sessao.ultimoAudio,
      nicho: sessao.nicho,
      produto: sessao.produto ? 'definido' : null
    };
  }
}

export const intentEngine = new IntentEngine();

// VIDEO DOMAIN (appended by patch)
// Add "video" to the domain list in the system prompt dynamically
