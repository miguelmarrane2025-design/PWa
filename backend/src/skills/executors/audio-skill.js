// skills/executors/audio-skill.js
// Skill: AudioSkill — Analisa IRs, presets e tom de guitarra com IA.
// Adapter que integra workers de áudio ao sistema de skills.

import { log } from '../../core/logger.js';
import { processAudioFile } from '../../integrations/audio-pipeline.js';
import { parseJsonSafe } from '../../core/json-validator.js';
import { irProcessor } from '../../workers/audio/ir-processor.js';
import { presetAutoGenerator } from '../../workers/audio/preset-auto-generator.js';

export default async function audioSkill(ctx, params, tools) {
  const { openaiStrong, memoryMCP } = tools;
  const userId = ctx.userId;
  // Determine action - if a file is present, default to exportar_multi (process the IR)
  const hasIR = !!(params.caminho || ctx.sessao?.ultimoIR);
  const acao = params.acao
    || (hasIR && params.objetivo?.length > 0 ? 'exportar_multi' : null)
    || (hasIR ? 'analisar' : 'analisar');
  const contexto = params.contexto || ctx.audioAnalisado || '';
  const perfil = ctx.sessao?.perfilGuitarra || params.perfil || {};
  // Normalize IR path from both sources
  const irPath = params.caminho || ctx.sessao?.ultimoIR || null;
  if (irPath && ctx.sessao) ctx.sessao.ultimoIR = irPath;

  log('info', `[AudioSkill] Ação: ${acao}`);


    // ── Automatic DSP processing (Camilla or IR-processor) ───────────────────
    if (acao === 'processar' && irPath) {
      try {
        const resultado = await processAudioFile({
          inputPath: irPath,
          userId,
          configName: params.configName || 'default',
          irOpts: {
            pedaleira: params.pedaleira || ctx.sessao?.pedaleira || 'generic',
            mic: params.mic || null,
            taxasSaida: params.taxasSaida || ['44k', '48k'],
          },
        });
        const texto = [
          `🎸 *PROCESSAMENTO CONCLUÍDO*`,
          `\n✅ Método: ${resultado.method}`,
          `📁 Job: ${resultado.jobId}`,
          `📊 Info: SR=${resultado.info?.sampleRateOriginal}Hz | Pico=${resultado.info?.picoFinal}dBFS`,
          `\n💡 Acesse a aba *Audio* para baixar o arquivo processado.`,
        ].join('\n');
        if (userId) await memoryMCP.salvar('audio', `last_job`, resultado, userId);
        return { processamento: resultado, outputs: [{ tipo: 'texto', conteudo: texto }] };
      } catch (err) {
        log('error', `[AudioSkill] Pipeline error: ${err.message}`);
        return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro no processamento: ${err.message}` }] };
      }
    }

  const prompts = {
    analisar: `Você é um engenheiro de som especialista em processamento de guitarra e IRs (Impulse Responses).
Analise o seguinte contexto de áudio e forneça um diagnóstico técnico detalhado.

CONTEXTO: ${JSON.stringify(contexto).substring(0, 800)}
PERFIL DO GUITARRISTA: ${JSON.stringify(perfil).substring(0, 400)}

Retorne JSON:
{
  "diagnostico": "análise técnica do som/IR",
  "caracteristicas": ["característica 1", "característica 2", "característica 3"],
  "pontosFortres": ["ponto forte 1", "ponto forte 2"],
  "pontosAMelhorar": ["ponto fraco 1", "ponto fraco 2"],
  "eq": { "graves": "orientação", "medios": "orientação", "agudos": "orientação", "presenca": "orientação" },
  "compressao": "orientação de compressão",
  "recomendacoes": ["recomendação 1", "recomendação 2", "recomendação 3"],
  "estiloAdequado": ["estilo musical 1", "estilo musical 2"]
}`,

    recomendar: `Você é um especialista em IRs de guitarra.
Com base no perfil do guitarrista, recomende as melhores IRs e configurações.

PERFIL: ${JSON.stringify(perfil).substring(0, 600)}

Retorne JSON:
{
  "recomendacoes": [
    {
      "ir": "nome/tipo da IR",
      "motivo": "por que recomendo",
      "configuracoes": { "gain": "nível", "bass": "nível", "mid": "nível", "treble": "nível" },
      "estilo": "melhor estilo musical para essa IR"
    }
  ],
  "dicas": ["dica 1", "dica 2"],
  "aviso": "informação importante sobre IRs"
}`
  };

  try {
    // ── Preset automático ────────────────────────────────────────────────
    if (acao === 'preset_auto') {
      const presetParams = {
        estilo:    params.estilo    || ctx.sessao?.estilo    || 'worship',
        guitarra:  params.guitarra  || ctx.sessao?.guitarra,
        captador:  params.captador  || ctx.sessao?.captador,
        pedaleira: params.pedaleira || ctx.sessao?.pedaleira,
        contexto:  params.contexto  || ctx.sessao?.contexto  || 'igreja',
        ajustes:   params.objetivo  || ctx.sessao?.ajustesTonais || []
      };
      const preset = await presetAutoGenerator.gerar(presetParams, openaiStrong);
      const texto  = presetAutoGenerator.formatarTexto(preset);
      if (userId) await memoryMCP.salvar('audio', 'ultimo_preset', preset, userId);
      return { preset, outputs: [{ tipo: 'texto', conteudo: texto }] };
    }

    // ── Blend de múltiplos IRs ────────────────────────────────────────────
    if (acao === 'blend_ir') {
      const caminhos = params.caminhos || (ctx.sessao?.ultimoIR ? [ctx.sessao.ultimoIR] : []);
      const ratios   = params.ratios   || caminhos.map(() => 1 / caminhos.length);
      const pedaleira = params.pedaleira || ctx.sessao?.pedaleira || 'generic';
      const taxas    = params.taxasSaida || ['44k', '48k'];

      if (caminhos.length < 2) {
        return { outputs: [{ tipo: 'texto', conteudo: '❌ Blend requer pelo menos 2 IRs. Envie os arquivos primeiro.' }] };
      }

      const resultado = await irProcessor.blendIRs(caminhos, ratios, { taxasSaida: taxas, pedaleira });
      if (userId) await memoryMCP.salvar('audio', `blend_${Date.now()}`, resultado.info, userId);

      const texto = [
        `🎚️ *BLEND DE IRs CONCLUÍDO*\n`,
        `📦 IRs combinados:`,
        ...(resultado.blend || []).map(b => `• ${b.arquivo}: ${b.ratio}`),
        `\n✅ Arquivos exportados:`,
        ...(resultado.arquivos || []).map(a => `• ${a.taxa}Hz — ${a.tamanhoMB}MB`),
        resultado.metaCamillaDSP ? `\n🔧 CamillaDSP config: ${resultado.metaCamillaDSP}` : '',
        `\n📋 Avisos:`,
        ...(resultado.avisos || []).map(v => `• ${v}`)
      ].filter(Boolean).join('\n');

      return { blendResultado: resultado, outputs: [{ tipo: 'texto', conteudo: texto }] };
    }

    // ── Exportação multi-taxa ─────────────────────────────────────────────
    // ── Real file processing via unified pipeline ────────────────────────────
    if (acao === 'exportar_multi' || (acao === 'analisar' && irPath)) {
      const caminhoIR = irPath || params.caminho || ctx.sessao?.ultimoIR;
      if (!caminhoIR) {
        return { outputs: [{ tipo: 'texto', conteudo: '❌ Nenhum IR disponível para exportar.' }] };
      }

      const resultado = await irProcessor.processar(caminhoIR, {
        mic:        params.mic,
        pedaleira:  params.pedaleira || ctx.sessao?.pedaleira || 'generic',
        taxasSaida: params.taxasSaida || ['44k', '48k', '96k'],
        camillaDSP: params.camillaDSP || false
      });

      const texto = [
        `📤 *EXPORTAÇÃO MULTI-TAXA CONCLUÍDA*\n`,
        `✅ Arquivos gerados:`,
        ...(resultado.arquivos || []).map(a => `• ${a.taxa}Hz — ${a.caminho.split('/').pop()} (${a.tamanhoMB}MB)`),
        resultado.metaCamillaDSP ? `\n🔧 CamillaDSP: ${resultado.metaCamillaDSP}` : '',
        resultado.info?.mic !== 'nenhum' ? `\n🎤 Mic: ${resultado.info.mic}` : '',
        `\n📋 Processamento:`,
        ...(resultado.avisos || []).map(v => `• ${v}`)
      ].filter(Boolean).join('\n');

      return { exportacao: resultado, outputs: [{ tipo: 'texto', conteudo: texto }] };
    }

    const promptKey = prompts[acao] ? acao : 'analisar';
    const resposta = await openaiStrong([{ role: 'user', content: prompts[promptKey] }]);
    const resultado = parseJsonSafe(resposta);

    if (userId) {
      await memoryMCP.salvar('audio', `${acao}_resultado`, resultado, userId);
    }

    let texto = `🎸 *ANÁLISE DE ÁUDIO — ${acao.toUpperCase()}*\n\n`;

    if (resultado.diagnostico) {
      texto += `📋 *Diagnóstico:* ${resultado.diagnostico}\n\n`;
    }

    if (resultado.recomendacoes) {
      texto += `✅ *Recomendações:*\n`;
      const recs = Array.isArray(resultado.recomendacoes)
        ? resultado.recomendacoes
        : [];

      if (typeof recs[0] === 'string') {
        recs.forEach(r => { texto += `• ${r}\n`; });
      } else {
        recs.forEach((r, i) => {
          texto += `\n*${i + 1}. ${r.ir || r.nome || ''}*\n`;
          if (r.motivo) texto += `_${r.motivo}_\n`;
          if (r.estilo) texto += `🎵 Estilo: ${r.estilo}\n`;
        });
      }
    }

    if (resultado.dicas?.length) {
      texto += `\n💡 *Dicas:*\n`;
      resultado.dicas.forEach(d => { texto += `• ${d}\n`; });
    }

    return {
      audioAnalysis: resultado,
      outputs: [{ tipo: 'texto', conteudo: texto }]
    };

  } catch (err) {
    log('error', `[AudioSkill] Erro: ${err.message}`);
    return { outputs: [{ tipo: 'texto', conteudo: `❌ Erro na análise de áudio: ${err.message}` }] };
  }
}
