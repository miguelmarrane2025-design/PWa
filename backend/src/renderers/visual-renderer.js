import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { chromium } from 'playwright-core';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';

const execFileAsync = promisify(execFile);
const VIEWPORT = { width: 1080, height: 1080 };
const SLIDE_COUNT = 6;

const CHROMIUM_PATHS = [
  process.env.CHROMIUM_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);

export async function renderCarouselPng({ message, files = [] }) {
  const plan = createCarouselPlan(message);
  if (!isValidPlan(plan)) {
    return {
      success: false,
      type: 'visual',
      message: 'Nao consegui criar um plano de carrossel coerente para esse pedido.',
      files: [],
    };
  }

  return renderCarouselPlanPng({ plan, files });
}

export async function renderCarouselPlanPng({ plan, files = [] }) {
  if (!isValidPlan(plan)) {
    return {
      success: false,
      type: 'visual',
      message: 'Nao consegui criar um plano de carrossel coerente para esse pedido.',
      files: [],
    };
  }

  const runId = `visual_${Date.now()}_${uuidv4().slice(0, 8)}`;
  const outputDir = path.join(config.storage.output, 'visual', runId);
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: await findChromiumExecutable(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const imageFiles = (files || [])
    .filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f.originalname ?? ''))
    .map(f => f.path);
  const renderedFiles = [];
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (let i = 0; i < plan.slides.length; i += 1) {
      const slide = plan.slides[i];
      const filename = `${String(i + 1).padStart(2, '0')}-${slugify(plan.tema)}.png`;
      const outputPath = path.join(outputDir, filename);
      const publicPath = `/storage/outputs/visual/${runId}/${filename}`;
      const imageDataUrl = imageFiles[i] ? await imageToDataUrl(imageFiles[i]).catch(() => null) : null;
      await page.setContent(buildSlideHtml(plan, slide, i, imageDataUrl), { waitUntil: 'networkidle' });
      await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
      renderedFiles.push(publicPath);
    }
  } finally {
    await browser.close();
  }

  const zipPath = await createZip(outputDir, runId, plan.slides.length);
  const zipPublicPath = zipPath ? `/storage/outputs/visual/${runId}/${path.basename(zipPath)}` : null;
  const previewUrl = buildPublicUrl(renderedFiles[0]);
  const downloadUrl = zipPublicPath ? buildPublicUrl(zipPublicPath) : previewUrl;

  return {
    success: true,
    type: 'visual',
    message: 'Carrossel renderizado por solicitacao manual',
    files: renderedFiles,
    previewUrl,
    downloadUrl,
    zipUrl: zipPublicPath ? buildPublicUrl(zipPublicPath) : null,
    plan,
  };
}

export function generateCarouselImagePrompts({ message }) {
  const plan = createCarouselPlan(message);
  if (!isValidPlan(plan)) {
    return {
      success: false,
      type: 'visual_prompts',
      message: 'Nao consegui criar um plano de carrossel coerente para esse pedido.',
      prompts: [],
    };
  }

  const aspectRatio = /feed|quadrado|1:1/i.test(message) ? '1:1' : '4:5';
  const prompts = plan.slides.map((slide, index) => {
    const cleanSpace = slide.emptySpace || (index % 2 === 0 ? 'left' : 'top');
    const visualStyle = slide.visualStyle || plan.visualStyle.mood;
    return {
      slide: index + 1,
      title: slide.title,
      text: slide.text,
      visual_concept: slide.visual,
      visual_direction: slide.visual,
      image_prompt: buildImagePrompt({
        plan,
        slide,
        cleanSpace,
        visualStyle,
      }),
      negative_prompt: slide.negativePrompt || defaultNegativePrompt(plan),
      composition: slide.composition || `subject placed away from the ${cleanSpace} headline area, vertical 4:5 editorial crop, clear negative space`,
      aspect_ratio: aspectRatio,
      visual_style: visualStyle,
      visual_purpose: slide.visualPurpose || `Connects the slide idea to a concrete scene about ${plan.tema}, avoiding generic icons or abstract symbols.`,
      notes: 'sem texto na imagem, deixar espaço para headline',
    };
  });

  return {
    success: true,
    type: 'visual_prompts',
    message: `Prompts de imagem do carrossel gerados para "${plan.tema}".`,
    prompts,
    plan,
  };
}

function createCarouselPlan(rawMessage) {
  const cleanMessage = normalizeText(rawMessage);
  const tema = extractTopic(cleanMessage);
  if (!tema || tema.length < 3) return null;

  const lower = tema.toLowerCase();
  const isWorshipTone = /worship|timbre|timbres|guitarra|guitar|mix|audio|áudio|ir|delay|reverb|eq|equaliza|equalizacao|equalização|grave|agudo|medio|m[ée]dio|pedaleira|pedalboard|plugin|daw|palco|home studio/.test(lower);
  const publico = isWorshipTone
    ? 'guitarristas de worship, produtores e musicos de igreja'
    : `pessoas interessadas em ${tema}`;
  const promessa = isWorshipTone
    ? 'entender por que a guitarra some ou cansa na mix e como ajustar o timbre'
    : `entender ${tema} em uma sequencia clara e aplicavel`;

  const slides = isWorshipTone ? worshipToneSlides() : genericSlides(tema);

  return {
    tema: titleCase(tema),
    publico,
    promessa,
    sequenciaNarrativa: slides.map(s => s.role),
    ctaFinal: slides[slides.length - 1].text,
    visualStyle: {
      palette: pickAccent(tema),
      mood: isWorshipTone ? 'premium realistic cinematic worship music production editorial' : 'premium realistic editorial photography',
    },
    slides,
  };
}

function worshipToneSlides() {
  return [
    {
      role: 'dor',
      title: 'Sua guitarra some na mix?',
      text: 'O problema nem sempre e volume. Muitas vezes e timbre mal encaixado.',
      visual: 'worship guitarist playing electric guitar on a dark modern church stage, pedalboard lights glowing on the floor',
      composition: 'guitarist on right third, empty dark space on left for headline, pedalboard lights create leading lines toward the subject',
      visualPurpose: 'Mostra imediatamente o contexto real do publico: guitarra worship ao vivo e o problema de encaixe na mix.',
      emptySpace: 'left',
      icon: 'guitar-wave',
    },
    {
      role: 'erro grave',
      title: 'Graves demais embolam',
      text: 'Graves excessivos disputam espaco com baixo e bumbo.',
      visual: 'close-up of an electric guitar cable near a bass guitar and kick drum inside a dark studio live room',
      composition: 'low instruments and cable in lower right, clean shadow area at top for headline, shallow depth separating the background',
      visualPurpose: 'Traduz visualmente a disputa de graves entre guitarra, baixo e bumbo sem usar simbolos genericos.',
      emptySpace: 'top',
      icon: 'low-eq',
    },
    {
      role: 'erro agudo',
      title: 'Agudo demais cansa',
      text: 'Presenca exagerada deixa o som estridente e dificil de ouvir.',
      visual: 'producer adjusting a guitar EQ plugin on a DAW screen, electric guitar resting beside studio monitors, plugin details softly blurred with no readable text',
      composition: 'hands and guitar on lower left, DAW screen glow on right, clean darker area at top left for headline',
      visualPurpose: 'Liga o excesso de agudos a uma decisao real de mix e equalizacao, com o EQ como elemento visual sem texto legivel.',
      emptySpace: 'top left',
      icon: 'high-eq',
    },
    {
      role: 'solucao tonal',
      title: 'Medios carregam o corpo',
      text: 'O corpo da guitarra aparece quando os medios estao no lugar certo.',
      visual: 'home studio scene with guitarist recording a Stratocaster through an audio interface, studio monitors and warm rack lights in the background',
      composition: 'guitar neck and player hands on right third, soft studio background on left with clean space for headline',
      visualPurpose: 'Mostra a busca de corpo e definicao do timbre em uma cena real de gravacao e mix.',
      emptySpace: 'left',
      icon: 'mid-eq',
    },
    {
      role: 'ambiencia',
      title: 'Worship precisa respirar',
      text: 'Delay, reverb e IR precisam abrir espaco sem esconder a base.',
      visual: 'close-up of a premium guitar pedalboard with delay, reverb and amp modeler knobs glowing on a church stage floor with haze in the background',
      composition: 'pedalboard across bottom third, stage haze and clean dark space above for headline, diagonal cables add depth',
      visualPurpose: 'Representa ambiencia worship por meio de pedais, IR e palco, elementos diretamente ligados ao nicho.',
      emptySpace: 'top',
      icon: 'space-delay',
    },
    {
      role: 'cta',
      title: 'Salve este guia',
      text: 'Use como checklist antes de tocar ao vivo ou gravar.',
      visual: 'musician tuning an electric guitar beside a pedalboard before a worship service, modern church stage lights warming up in the background',
      composition: 'musician and guitar on left third, empty dark space on right for final headline, stage lights create depth',
      visualPurpose: 'Fecha com uma situacao pratica de preparacao antes do culto ou show, reforcando o uso do guia.',
      emptySpace: 'right',
      icon: 'checklist',
    },
  ];
}

function genericSlides(topic) {
  const t = titleCase(topic);
  return [
    {
      role: 'gancho',
      title: `${t} sem complicar`,
      text: 'Comece pelo problema real que a pessoa sente antes de explicar conceitos.',
      visual: `real person facing a concrete decision related to ${topic} in a premium editorial environment`,
      composition: 'subject on right third, clean negative space on left for headline, vertical 4:5 crop',
      visualPurpose: 'Apresenta o tema como uma situacao real e reconhecivel, em vez de um simbolo abstrato.',
      emptySpace: 'left',
      icon: 'target',
    },
    {
      role: 'contexto',
      title: 'O erro mais comum',
      text: 'A maioria tenta resolver o sintoma e deixa a causa principal escondida.',
      visual: `behind-the-scenes editorial scene showing a messy setup or workflow problem connected to ${topic}`,
      composition: 'problem detail in lower half, clean darker area at top for headline, shallow depth of field',
      visualPurpose: 'Mostra o erro como um contexto visual concreto, nao como alerta ou icone generico.',
      emptySpace: 'top',
      icon: 'warning',
    },
    {
      role: 'principio',
      title: 'Procure o padrao',
      text: 'Quando voce identifica o padrao, a decisao fica mais simples e repetivel.',
      visual: `expert reviewing real materials, tools or references connected to ${topic} on a clean desk`,
      composition: 'hands and materials on lower right, clean surface on left for headline, editorial overhead angle',
      visualPurpose: 'Conecta o principio de padrao a uma analise visual tangivel e profissional.',
      emptySpace: 'left',
      icon: 'pattern',
    },
    {
      role: 'metodo',
      title: 'Ajuste uma coisa por vez',
      text: 'Teste uma mudanca, observe o resultado e evite conclusoes apressadas.',
      visual: `close-up of a person making one careful adjustment to a real tool or workspace related to ${topic}`,
      composition: 'adjustment action on right third, clean soft background on left for headline, macro editorial framing',
      visualPurpose: 'Transforma o metodo em uma acao concreta e facil de entender visualmente.',
      emptySpace: 'left',
      icon: 'controls',
    },
    {
      role: 'aplicacao',
      title: 'Transforme em checklist',
      text: 'Um bom processo reduz erro e deixa o resultado mais consistente.',
      visual: `premium workspace with real project materials for ${topic}, organized into a simple repeatable process without visible text`,
      composition: 'organized materials along bottom and right edges, clean open area at top left for headline',
      visualPurpose: 'Comunica processo e organizacao usando objetos reais do tema, sem depender de checklist desenhado.',
      emptySpace: 'top left',
      icon: 'progress',
    },
    {
      role: 'cta',
      title: 'Salve para revisar',
      text: 'Use este carrossel como guia rapido antes da proxima decisao.',
      visual: `person saving or reviewing references related to ${topic} in a premium realistic work environment, no readable screens`,
      composition: 'person and device on left, empty calm space on right for headline, cinematic editorial crop',
      visualPurpose: 'Fecha com uma cena de revisao realista que combina com o CTA de salvar o conteudo.',
      emptySpace: 'right',
      icon: 'checklist',
    },
  ];
}

function buildImagePrompt({ plan, slide, cleanSpace, visualStyle }) {
  const environment = plan.publico.includes('worship')
    ? 'in a modern church stage, home studio or music production environment'
    : `in an environment directly related to ${plan.tema}`;
  const lighting = plan.publico.includes('worship')
    ? 'soft haze, blue and lime green rim lighting, practical pedalboard and monitor lights'
    : 'cinematic editorial lighting, realistic shadows, refined contrast';
  const palette = plan.publico.includes('worship')
    ? 'deep blacks, blue highlights, lime green accents, warm skin tones'
    : 'premium neutral palette with controlled accent colors and natural skin tones';

  return [
    `realistic cinematic editorial photo of ${slide.visual}`,
    environment,
    lighting,
    'shot on a 50mm lens, shallow depth of field, vertical 4:5 composition',
    `${palette}`,
    `${visualStyle}, premium editorial look`,
    `empty clean space on ${cleanSpace} for bold headline`,
    'no text, no watermark',
  ].join(', ');
}

function defaultNegativePrompt(plan) {
  const nicheAvoid = plan.publico.includes('worship')
    ? ', distorted guitar, extra fingers, deformed hands, unreadable DAW labels, fake brand logos'
    : ', generic icons, abstract symbols, infographic, random charts';
  return `cartoon, illustration, basic drawing, logo, text, watermark, blurry, low quality, messy background, cluttered headline area${nicheAvoid}`;
}

function isValidPlan(plan) {
  return Boolean(
    plan?.tema &&
    plan?.publico &&
    plan?.promessa &&
    Array.isArray(plan?.slides) &&
    plan.slides.length === SLIDE_COUNT &&
    plan.slides.every(s => s.title && s.text && s.visual && s.icon),
  );
}

function buildSlideHtml(plan, slide, index, imageDataUrl = null) {
  const accent = plan.visualStyle.palette;
  const graphic = buildGraphic(slide.icon, accent);
  const media = imageDataUrl
    ? `<img class="slide-image" src="${imageDataUrl}" alt="${escapeHtml(slide.visual)}" />`
    : graphic;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: ${VIEWPORT.width}px;
      height: ${VIEWPORT.height}px;
      overflow: hidden;
      background: #090b10;
      color: #f7f7f2;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }
    .slide {
      position: relative;
      width: ${VIEWPORT.width}px;
      height: ${VIEWPORT.height}px;
      padding: 64px 68px 56px;
      background:
        radial-gradient(circle at 18% 12%, ${accent.soft}, transparent 30%),
        radial-gradient(circle at 86% 26%, rgba(255,255,255,.12), transparent 18%),
        radial-gradient(circle at 82% 82%, ${accent.deep}, transparent 38%),
        linear-gradient(140deg, #080a0e 0%, #121722 45%, #08090d 100%);
      overflow: hidden;
    }
    .slide::before {
      content: "";
      position: absolute;
      inset: 28px;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 28px;
      pointer-events: none;
      box-shadow: inset 0 0 80px rgba(255,255,255,.035);
    }
    .grain {
      position: absolute;
      inset: 0;
      opacity: .18;
      background-image:
        linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
      background-size: 46px 46px;
      mask-image: linear-gradient(160deg, black, transparent 78%);
    }
    .top {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: rgba(247,247,242,.72);
      font-size: 22px;
      font-weight: 800;
    }
    .topic {
      color: ${accent.main};
      max-width: 620px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .count {
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      padding: 12px 20px;
      background: rgba(255,255,255,.07);
      box-shadow: 0 14px 45px rgba(0,0,0,.28);
    }
    .graphic {
      position: relative;
      z-index: 1;
      height: 410px;
      margin-top: 34px;
      filter: drop-shadow(0 30px 70px rgba(0,0,0,.36));
    }
    .slide-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 32px;
      border: 1px solid rgba(255,255,255,.16);
      opacity: .78;
    }
    .copy {
      position: relative;
      z-index: 2;
      margin-top: 22px;
      max-width: 910px;
    }
    h1 {
      margin: 0;
      max-width: 900px;
      color: #fffef6;
      font-size: 88px;
      line-height: .92;
      letter-spacing: 0;
      font-weight: 920;
      text-wrap: balance;
    }
    p {
      margin: 32px 0 0;
      max-width: 850px;
      color: rgba(247,247,242,.86);
      font-size: 40px;
      line-height: 1.13;
      font-weight: 720;
      text-wrap: balance;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-top: 26px;
      padding: 13px 18px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.13);
      background: rgba(255,255,255,.065);
      color: rgba(247,247,242,.68);
      font-size: 18px;
      font-weight: 820;
    }
    .footer {
      position: absolute;
      left: 72px;
      right: 72px;
      bottom: 50px;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: rgba(247,247,242,.54);
      font-size: 20px;
      font-weight: 750;
    }
    .bar {
      width: 320px;
      height: 8px;
      border-radius: 99px;
      background: linear-gradient(90deg, ${accent.main} ${(index + 1) * (100 / SLIDE_COUNT)}%, rgba(255,255,255,.14) 0);
    }
    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .glow {
      position: absolute;
      width: 310px;
      height: 310px;
      right: -72px;
      top: 258px;
      border-radius: 999px;
      background: ${accent.soft};
      filter: blur(26px);
      opacity: .44;
    }
  </style>
</head>
<body>
  <main class="slide">
    <div class="grain"></div>
    <div class="glow"></div>
    <div class="top">
      <div class="topic">${escapeHtml(plan.tema)}</div>
      <div class="count">${String(index + 1).padStart(2, '0')}/${String(SLIDE_COUNT).padStart(2, '0')}</div>
    </div>
    <div class="graphic">${media}</div>
    <section class="copy">
      <h1>${escapeHtml(slide.title)}</h1>
      <p>${escapeHtml(slide.text)}</p>
      <div class="pill">${escapeHtml(slide.visual)}</div>
    </section>
    <div class="footer">
      <span>BotSquad Visual</span>
      <div class="bar"></div>
    </div>
  </main>
</body>
</html>`;
}

async function imageToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif'
        : 'image/jpeg';
  const buffer = await fs.readFile(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function buildGraphic(icon, accent) {
  const stroke = accent.main;
  const muted = 'rgba(255,255,255,.24)';
  const soft = accent.soft;
  const common = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;

  if (icon === 'guitar-wave') {
    return `<svg viewBox="0 0 900 360" aria-label="onda sonora e guitarra">
      <path d="M42 214 C108 68 212 68 278 214 S446 360 512 214 S686 68 858 214" ${common} stroke="${stroke}" stroke-width="20"/>
      <path d="M120 278 C206 190 284 198 356 260 L748 68" ${common} stroke="${muted}" stroke-width="14"/>
      <circle cx="318" cy="248" r="72" fill="${soft}" stroke="${stroke}" stroke-width="12"/>
      <circle cx="420" cy="224" r="42" fill="rgba(255,255,255,.075)" stroke="${muted}" stroke-width="9"/>
      <path d="M708 74 L812 18 M742 114 L846 58" ${common} stroke="${stroke}" stroke-width="12"/>
      <path d="M176 244 L482 192 M188 270 L498 218 M200 296 L514 244" ${common} stroke="rgba(255,255,255,.34)" stroke-width="5"/>
      <rect x="92" y="118" width="138" height="72" rx="18" fill="rgba(255,255,255,.055)" stroke="${muted}" stroke-width="6"/>
      <circle cx="130" cy="154" r="13" fill="${stroke}"/><circle cx="176" cy="154" r="13" fill="${muted}"/>
    </svg>`;
  }
  if (icon === 'low-eq') {
    return `<svg viewBox="0 0 900 360" aria-label="faixa grave destacada">
      <rect x="62" y="58" width="776" height="244" rx="38" fill="rgba(255,255,255,.05)" stroke="${muted}" stroke-width="6"/>
      <rect x="102" y="92" width="224" height="176" rx="28" fill="${soft}" stroke="${stroke}" stroke-width="10"/>
      <path d="M372 238 C444 118 532 118 610 238 S744 306 816 160" ${common} stroke="${muted}" stroke-width="13"/>
      <path d="M132 284 V326 M214 284 V326 M296 284 V326" ${common} stroke="${stroke}" stroke-width="10"/>
      <path d="M124 148 H306 M124 190 H306 M124 232 H306" ${common} stroke="rgba(255,255,255,.36)" stroke-width="6"/>
      <circle cx="642" cy="118" r="38" fill="rgba(255,255,255,.05)" stroke="${stroke}" stroke-width="8"/>
    </svg>`;
  }
  if (icon === 'high-eq') {
    return `<svg viewBox="0 0 900 360" aria-label="curva de EQ subindo">
      <rect x="92" y="54" width="716" height="264" rx="36" fill="rgba(255,255,255,.045)" stroke="${muted}" stroke-width="6"/>
      <path d="M118 286 H780 M118 218 H780 M118 150 H780 M118 82 H780" ${common} stroke="rgba(255,255,255,.12)" stroke-width="5"/>
      <path d="M132 254 C268 254 318 214 410 190 S552 166 628 102 S724 44 810 42" ${common} stroke="${stroke}" stroke-width="19"/>
      <circle cx="718" cy="66" r="62" fill="${soft}" stroke="${stroke}" stroke-width="9"/>
      <path d="M718 26 V106 M678 66 H758" ${common} stroke="${stroke}" stroke-width="9"/>
      <path d="M622 282 L760 144" ${common} stroke="${muted}" stroke-width="8" opacity=".7"/>
    </svg>`;
  }
  if (icon === 'mid-eq') {
    return `<svg viewBox="0 0 900 360" aria-label="medios em destaque">
      <rect x="86" y="46" width="728" height="276" rx="36" fill="rgba(255,255,255,.045)" stroke="${muted}" stroke-width="6"/>
      <path d="M104 286 H796" ${common} stroke="${muted}" stroke-width="6"/>
      ${[150,250,350,450,550,650,750].map((x, i) => {
        const h = [88, 138, 224, 274, 220, 132, 84][i];
        const y = 286 - h;
        const color = i >= 2 && i <= 4 ? stroke : muted;
        const fill = i >= 2 && i <= 4 ? soft : 'rgba(255,255,255,.04)';
        return `<rect x="${x - 31}" y="${y}" width="62" height="${h}" rx="20" fill="${fill}" stroke="${color}" stroke-width="8"/>`;
      }).join('')}
      <path d="M330 42 H570" ${common} stroke="${stroke}" stroke-width="9"/>
      <text x="450" y="32" fill="${stroke}" font-size="24" font-weight="900" text-anchor="middle">MID BODY</text>
    </svg>`;
  }
  if (icon === 'space-delay') {
    return `<svg viewBox="0 0 900 360" aria-label="delay reverb e ambiente">
      <rect x="102" y="88" width="238" height="178" rx="34" fill="rgba(255,255,255,.055)" stroke="${muted}" stroke-width="7"/>
      <circle cx="164" cy="150" r="18" fill="${stroke}"/><circle cx="224" cy="150" r="18" fill="${muted}"/><circle cx="284" cy="150" r="18" fill="${muted}"/>
      <path d="M148 214 H292" ${common} stroke="${stroke}" stroke-width="10"/>
      <circle cx="438" cy="180" r="66" fill="${soft}" stroke="${stroke}" stroke-width="10"/>
      <circle cx="584" cy="180" r="92" fill="none" stroke="${stroke}" stroke-width="10" opacity=".66"/>
      <circle cx="750" cy="180" r="118" fill="none" stroke="${muted}" stroke-width="10"/>
      <path d="M222 304 C344 338 620 338 758 264" ${common} stroke="${stroke}" stroke-width="13" opacity=".72"/>
    </svg>`;
  }
  if (icon === 'checklist') {
    return `<svg viewBox="0 0 900 360" aria-label="checklist e guitarra">
      <rect x="92" y="48" width="448" height="264" rx="34" fill="rgba(255,255,255,.055)" stroke="${muted}" stroke-width="7"/>
      ${[122,188,254].map((y, i) => `
        <path d="M148 ${y} l24 24 l52 -58" ${common} stroke="${stroke}" stroke-width="12"/>
        <path d="M264 ${y + 8} H464" ${common} stroke="${i === 2 ? stroke : muted}" stroke-width="10"/>
      `).join('')}
      <path d="M580 266 C646 188 716 198 774 258 L842 112" ${common} stroke="${stroke}" stroke-width="13"/>
      <circle cx="704" cy="248" r="54" fill="${soft}" stroke="${stroke}" stroke-width="9"/>
      <path d="M654 246 L758 226 M660 270 L766 250" ${common} stroke="rgba(255,255,255,.34)" stroke-width="5"/>
    </svg>`;
  }
  if (icon === 'target') {
    return `<svg viewBox="0 0 900 360"><circle cx="450" cy="180" r="132" fill="${soft}" stroke="${stroke}" stroke-width="10"/><circle cx="450" cy="180" r="76" fill="none" stroke="${muted}" stroke-width="10"/><circle cx="450" cy="180" r="24" fill="${stroke}"/><path d="M116 180 H328 M572 180 H784" ${common} stroke="${muted}" stroke-width="10"/></svg>`;
  }
  if (icon === 'warning') {
    return `<svg viewBox="0 0 900 360"><path d="M450 54 L796 294 H104 Z" fill="${soft}" stroke="${stroke}" stroke-width="12"/><path d="M450 136 V216 M450 266 V268" ${common} stroke="#fffef6" stroke-width="20"/></svg>`;
  }
  if (icon === 'pattern') {
    return `<svg viewBox="0 0 900 360">${[180,330,480,630,780].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 112 : 242}" r="38" fill="${soft}" stroke="${stroke}" stroke-width="8"/>`).join('')}<path d="M180 242 L330 112 L480 242 L630 112 L780 242" ${common} stroke="${muted}" stroke-width="10"/></svg>`;
  }
  if (icon === 'controls') {
    return `<svg viewBox="0 0 900 360">${[210,360,510,660].map((x, i) => `<path d="M${x} 70 V290" ${common} stroke="${muted}" stroke-width="8"/><circle cx="${x}" cy="${[224,142,196,112][i]}" r="44" fill="${soft}" stroke="${stroke}" stroke-width="9"/>`).join('')}</svg>`;
  }
  return `<svg viewBox="0 0 900 360"><path d="M150 250 H760" ${common} stroke="${muted}" stroke-width="10"/><path d="M150 250 C260 94 372 94 482 250 S650 326 760 150" ${common} stroke="${stroke}" stroke-width="18"/></svg>`;
}

async function createZip(outputDir, runId, slideCount) {
  const zipName = `${runId}.zip`;
  try {
    const pngs = (await fs.readdir(outputDir))
      .filter(name => name.endsWith('.png'))
      .sort()
      .slice(0, slideCount);
    if (pngs.length !== slideCount) return null;
    await execFileAsync('zip', ['-j', zipName, ...pngs], {
      cwd: outputDir,
      timeout: 30_000,
    });
    return path.join(outputDir, zipName);
  } catch {
    return null;
  }
}

function buildPublicUrl(publicPath) {
  const configured = process.env.BACKEND_PUBLIC_URL;
  const fallback = `http://161.97.78.124:${process.env.PORT || '3000'}`;
  const base = configured && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured)
    ? configured
    : fallback;
  return `${base.replace(/\/$/, '')}${publicPath}`;
}

async function findChromiumExecutable() {
  for (const candidate of CHROMIUM_PATHS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('Chromium nao encontrado. Instale chromium no servidor ou configure CHROMIUM_PATH.');
}

function extractTopic(message) {
  const withoutAgent = normalizeText(message).replace(/^\[agent:\w+\]\s*/i, '');
  const match = withoutAgent.match(/(?:sobre|para|de)\s+(.+)$/i);
  const topic = (match?.[1] || withoutAgent)
    .replace(/\b(crie|criar|cria|gera|gerar|faz|fazer|carrossel|imagem|visual|instagram|um|uma|o|a)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return topic || null;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ')
    .normalize('NFC');
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, space, letter) => `${space}${letter.toUpperCase()}`);
}

function pickAccent(topic) {
  const lower = topic.toLowerCase();
  if (/worship|guitarra|timbre|mix|audio|som|eq/.test(lower)) {
    return { main: '#c6f135', soft: 'rgba(198,241,53,.22)', deep: 'rgba(42,215,255,.16)' };
  }
  const palettes = [
    { main: '#42d7ff', soft: 'rgba(66,215,255,.22)', deep: 'rgba(198,241,53,.14)' },
    { main: '#ffcf4a', soft: 'rgba(255,207,74,.22)', deep: 'rgba(66,215,255,.14)' },
    { main: '#ff6b8a', soft: 'rgba(255,107,138,.20)', deep: 'rgba(198,241,53,.13)' },
  ];
  const sum = [...topic].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palettes[sum % palettes.length];
}

function slugify(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'carousel';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
