// skills/gear-vision/evaluator.js
// Avalia se o output do GearVisionAgent é aceitável.

export function evaluate(output) {
  const issues = [];
  let score = 100;

  if (!output || typeof output !== 'object') {
    return { score: 0, passed: false, issues: ['Output inválido ou nulo'] };
  }

  // Penalizar se inventou valores sem imagem
  if (output.recognized && output.confidence < 0.3 && (!output.warnings || output.warnings.length === 0)) {
    issues.push('Confiança baixa sem avisos ao usuário');
    score -= 20;
  }

  // Penalizar se não separou visto vs inferido
  if (output.recognized && !output.inferred) {
    issues.push('Campo "inferred" ausente');
    score -= 10;
  }

  // Penalizar se não informou limitações conhecidas
  if (output.recognized && output.device && (!output.device.knownLimitations || output.device.knownLimitations.length === 0)) {
    // Equipamentos conhecidos devem ter limitações
    const knownBudget = ['zoom g1', 'cube baby', 'valeton', 'mooer ge'];
    const model = (output.device.model || '').toLowerCase();
    if (knownBudget.some(k => model.includes(k))) {
      issues.push('Equipamento budget sem limitações listadas');
      score -= 15;
    }
  }

  // Penalizar se imagem ruim mas não pediu nova foto
  if (!output.recognized && (!output.questionsForUser || output.questionsForUser.length === 0)) {
    issues.push('Não reconheceu mas não fez perguntas ao usuário');
    score -= 25;
  }

  const passed = score >= 75;
  return { score: Math.max(0, score), passed, issues };
}

export default { evaluate };
