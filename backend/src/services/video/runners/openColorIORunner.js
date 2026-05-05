// openColorIORunner.js — OpenColorIO não disponível (nem CLI nem Python binding)

export async function runOCIOTransform(params) {
  return {
    ok: false,
    tool: 'opencolorio',
    available: false,
    blocked: true,
    error: 'OpenColorIO não encontrado.',
    installHint: 'pip install opencolorio ou apt install libopencolorio-dev',
    data: {},
    artifactPaths: {},
  };
}

export async function checkOCIOAvailability() {
  return {
    available: false,
  };
}

export default { runOCIOTransform, checkOCIOAvailability };
