import carouselAssemblerAgent from '../../agents/carouselAssemblerAgent.js';

export default async function(ctx, params) {
  const files = params.files || ctx?.files || [];
  const message = params.message || params.texto || ctx?.sessao?.ultimoTexto || 'Finalizar carrossel com imagens';
  const result = await carouselAssemblerAgent({
    userId: ctx?.userId || null,
    message,
    context: ctx?.context || [],
    files,
  });
  return { outputs: [{ tipo: 'texto', conteudo: result.content }], metadata: result.metadata || result };
}
