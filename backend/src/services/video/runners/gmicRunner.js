// gmicRunner.js — G'MIC não disponível neste sistema

export async function runGmic(params) {
  return {
    ok: false,
    tool: 'gmic',
    available: false,
    blocked: true,
    error: "G'MIC não encontrado.",
    installHint: 'apt install gmic',
    data: {},
    artifactPaths: {},
  };
}

export async function checkGmicAvailability() {
  return {
    available: false,
  };
}

export default { runGmic, checkGmicAvailability };
