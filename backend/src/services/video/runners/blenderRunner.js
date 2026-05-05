// blenderRunner.js — Blender não disponível neste sistema
// Detecta blender (não disponível).

export async function runBlenderRender(params) {
  return {
    ok: false,
    tool: 'blender',
    available: false,
    blocked: true,
    error: 'Blender não encontrado.',
    installHint: 'sudo apt install blender ou snap install blender --classic',
    data: {},
    artifactPaths: {},
  };
}

export async function checkBlenderAvailability() {
  return {
    available: false,
  };
}

export default { runBlenderRender, checkBlenderAvailability };
