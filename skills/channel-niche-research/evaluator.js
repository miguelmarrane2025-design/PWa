// skills/channel-niche-research/evaluator.js
// Avalia se o output do ChannelNicheResearchSquad é aceitável.
// Usado pelo reviewer e pelo sistema de treinamento.

export function evaluate(output) {
  const issues = [];
  let score = 100;

  if (!output || typeof output !== 'object') {
    return { score: 0, passed: false, issues: ['Output inválido ou nulo'] };
  }

  const niches = output.recommendedNiches;

  // 1. Deve ter pelo menos 1 nicho recomendado
  if (!niches || niches.length === 0) {
    issues.push('Nenhum nicho recomendado — output incompleto');
    score -= 40;
    return { score: Math.max(0, score), passed: false, issues };
  }

  const n = niches[0];

  // 2. first30VideoIdeas deve ter exatamente 30 itens
  if (!n.first30VideoIdeas || n.first30VideoIdeas.length < 20) {
    issues.push(`first30VideoIdeas insuficiente: ${n.first30VideoIdeas?.length || 0} ideias (mínimo 20, ideal 30)`);
    score -= 25;
  }

  // 3. monetizationPaths deve ter pelo menos 2 caminhos
  if (!n.monetizationPaths || n.monetizationPaths.length < 2) {
    issues.push('monetizationPaths vazio ou com menos de 2 caminhos');
    score -= 20;
  }

  // 4. Nicho não pode ser genérico
  const genericTerms = ['vida saudável', 'motivação', 'sucesso', 'crescimento pessoal', 'felicidade'];
  const nicheStr = (n.niche + ' ' + (n.subniche || '')).toLowerCase();
  if (genericTerms.some(t => nicheStr.includes(t))) {
    issues.push('Nicho genérico detectado — seja mais específico');
    score -= 20;
  }

  // 5. Deve ter differentiationAngle
  if (!n.differentiationAngle || n.differentiationAngle.length < 20) {
    issues.push('differentiationAngle muito curto ou ausente');
    score -= 10;
  }

  // 6. Deve ter análise de plataforma
  if (!n.bestPlatforms || n.bestPlatforms.length === 0) {
    issues.push('bestPlatforms ausente');
    score -= 10;
  }

  // 7. channelStrategyDraft deve existir
  if (!output.channelStrategyDraft || !output.channelStrategyDraft.contentPillars?.length) {
    issues.push('channelStrategyDraft ausente ou incompleto');
    score -= 10;
  }

  // 8. nextStep deve ser específico e acionável
  if (!n.nextStep || n.nextStep.length < 30) {
    issues.push('nextStep muito curto — deve ser específico e acionável');
    score -= 5;
  }

  const finalScore = Math.max(0, score);
  return {
    score:  finalScore,
    passed: finalScore >= 85,
    issues,
  };
}

export default { evaluate };
