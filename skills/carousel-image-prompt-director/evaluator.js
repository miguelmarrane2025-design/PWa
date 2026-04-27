// skills/carousel-image-prompt-director/evaluator.js
// Avaliador de qualidade dos prompt_packs gerados pelo ImagePromptDirectorAgent.
// Score 0–100. Se < 75 → refinar. Se < 65 → escalar para modelo forte.

const GENERIC_AS_MAIN = [
  'sound wave','onda sonora','eq curve','curva de eq','equalizer curve',
  'alert triangle','triângulo de alerta','target','alvo','checklist',
  'generic graph','gráfico genérico','generic icon','ícone genérico',
  'symbol','símbolo','waveform','abstract wave','note icon','music note icon',
];

const CINEMATIC_SIGNALS = [
  'cinematic','photo','realistic','editorial','shallow depth','bokeh',
  'studio','stage','rim lighting','haze','atmospheric','50mm','lens',
  'depth of field','natural light','soft light','window light',
];

/**
 * Avalia um carousel_prompt_pack completo.
 * @param {Object} pack - O JSON retornado pelo agente
 * @returns {{ score: number, breakdown: Object, issues: string[], passed: boolean }}
 */
export function evaluatePromptPack(pack) {
  if (!pack || !Array.isArray(pack.slides) || pack.slides.length === 0) {
    return { score: 0, breakdown: {}, issues: ['Nenhum slide encontrado no pack'], passed: false };
  }

  const slides = pack.slides;
  const breakdown = {};
  const issues = [];

  // ── 1. Relevância ao tema (0–10) ────────────────────────────────────────
  // Prompts mencionam termos do topic/niche
  const topic = (pack.topic || '').toLowerCase();
  const topicWords = topic.split(/[\s,]+/).filter(w => w.length > 3);
  const relevanceCount = slides.filter(s => {
    const prompt = (s.image_prompt || '').toLowerCase();
    return topicWords.some(w => prompt.includes(w));
  }).length;
  breakdown.relevance = topicWords.length > 0
    ? Math.round((relevanceCount / slides.length) * 10)
    : 7; // sem topic → assume 7
  if (breakdown.relevance < 6) issues.push('Prompts pouco relacionados ao tema');

  // ── 2. Realismo visual (0–10) ─────────────────────────────────────────────
  const realistCount = slides.filter(s =>
    CINEMATIC_SIGNALS.some(t => (s.image_prompt || '').toLowerCase().includes(t))
  ).length;
  breakdown.realism = Math.round((realistCount / slides.length) * 10);
  if (breakdown.realism < 6) issues.push('Prompts pouco cinematográficos/realistas');

  // ── 3. Especificidade da cena (0–10) ──────────────────────────────────────
  // Prompt longo (>100 chars) = mais específico
  const specificCount = slides.filter(s => (s.image_prompt || '').length > 100).length;
  breakdown.specificity = Math.round((specificCount / slides.length) * 10);
  if (breakdown.specificity < 6) issues.push('Prompts muito curtos/pouco específicos');

  // ── 4. Variedade entre slides (0–10) ──────────────────────────────────────
  const promptStarts = slides.map(s => (s.image_prompt || '').toLowerCase().slice(0, 40));
  const unique = new Set(promptStarts);
  breakdown.variety = unique.size >= slides.length ? 10
    : unique.size >= slides.length * 0.7 ? 7
    : unique.size >= slides.length * 0.5 ? 4
    : 1;
  if (breakdown.variety < 6) issues.push('Slides com prompts muito similares entre si');

  // ── 5. Presença de negative_prompt (0–10) ─────────────────────────────────
  const hasNeg = slides.filter(s => s.negative_prompt && s.negative_prompt.trim().length > 10).length;
  breakdown.negativePrompt = Math.round((hasNeg / slides.length) * 10);
  if (breakdown.negativePrompt < 10) issues.push(`${slides.length - hasNeg} slide(s) sem negative_prompt`);

  // ── 6. Presença de composition (0–10) ─────────────────────────────────────
  const hasComp = slides.filter(s => s.composition && s.composition.trim().length > 10).length;
  breakdown.composition = Math.round((hasComp / slides.length) * 10);
  if (breakdown.composition < 10) issues.push(`${slides.length - hasComp} slide(s) sem composition`);

  // ── 7. Presença de visual_purpose (0–10) ─────────────────────────────────
  const hasPurpose = slides.filter(s => s.visual_purpose && s.visual_purpose.trim().length > 10).length;
  breakdown.visualPurpose = Math.round((hasPurpose / slides.length) * 10);
  if (breakdown.visualPurpose < 10) issues.push(`${slides.length - hasPurpose} slide(s) sem visual_purpose`);

  // ── 8. Evita genérico/ícones/SVG como cena principal (0–20) ───────────────
  const genericAsMain = slides.filter(s => {
    // O primeiro elemento do prompt (antes da primeira vírgula) é a cena principal
    const mainScene = (s.image_prompt || '').toLowerCase().split(',')[0];
    return GENERIC_AS_MAIN.some(t => mainScene.includes(t));
  }).length;
  breakdown.avoidsGeneric = Math.max(0, 20 - genericAsMain * 5);
  if (genericAsMain > 0) issues.push(`${genericAsMain} slide(s) com cena principal genérica (onda/EQ/ícone/checklist)`);

  // ── Total ─────────────────────────────────────────────────────────────────
  // Pesos: campos obrigatórios valem mais (5 cada field × 3 fields = 30pt)
  // Mais: relevance(10) + realism(10) + specificity(10) + variety(10) + avoidsGeneric(20) = 60
  // Total possível: 30 + 60 = 90... normalizar para 100
  const raw = (
    breakdown.relevance +
    breakdown.realism +
    breakdown.specificity +
    breakdown.variety +
    breakdown.negativePrompt +
    breakdown.composition +
    breakdown.visualPurpose +
    breakdown.avoidsGeneric
  );
  // max raw = 10+10+10+10+10+10+10+20 = 90 → normaliza para 100
  const score = Math.min(100, Math.round((raw / 90) * 100));

  return {
    score,
    breakdown,
    issues,
    passed: score >= 75,
    action: score >= 80 ? 'accept'
          : score >= 65 ? 'accept_with_note'
          : 'escalate_to_strong',
  };
}

/**
 * Avalia um único slide.
 * Útil para feedback granular por slide.
 */
export function evaluateSlide(slide) {
  const issues = [];

  if (!slide.image_prompt || slide.image_prompt.length < 50)   issues.push('image_prompt muito curto');
  if (!slide.negative_prompt || slide.negative_prompt.length < 10) issues.push('negative_prompt ausente');
  if (!slide.composition || slide.composition.length < 10)     issues.push('composition ausente');
  if (!slide.visual_purpose || slide.visual_purpose.length < 10) issues.push('visual_purpose ausente');
  if (!slide.title || slide.title.split(' ').length > 9)       issues.push('título ausente ou muito longo');

  const mainScene = (slide.image_prompt || '').toLowerCase().split(',')[0];
  const isGeneric = GENERIC_AS_MAIN.some(t => mainScene.includes(t));
  if (isGeneric) issues.push('cena principal genérica');

  const isCinematic = CINEMATIC_SIGNALS.some(t => (slide.image_prompt || '').toLowerCase().includes(t));
  if (!isCinematic) issues.push('prompt pouco cinematográfico');

  return { issues, passed: issues.length === 0 };
}

export default { evaluatePromptPack, evaluateSlide };
