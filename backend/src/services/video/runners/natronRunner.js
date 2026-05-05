// natronRunner.js — Natron/NatronRenderer não disponível neste sistema
// Detecta natron/NatronRenderer (nenhum disponível).

export async function runNatronComposition(params) {
  return {
    ok: false,
    tool: 'natron',
    available: false,
    blocked: true,
    error: 'NatronRenderer não encontrado no sistema.',
    installHint: 'sudo apt install natron ou baixar AppImage de natrongithub.org',
    data: {},
    artifactPaths: {},
  };
}

export async function checkNatronAvailability() {
  return {
    available: false,
    path: null,
    version: null,
    error: 'not found',
  };
}

export default { runNatronComposition, checkNatronAvailability };
