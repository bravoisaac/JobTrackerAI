import { chromium } from 'playwright-core';

const SEARCH_TARGETS = {
  linkedin: {
    label: 'LinkedIn',
    buildUrl: ({ query, location }) => {
      const params = new URLSearchParams({ keywords: query });
      if (location) params.set('location', location);
      return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
    },
    accepts: (url) => /linkedin\.com\/jobs\/view\//i.test(url),
  },
  computrabajo: {
    label: 'Computrabajo',
    buildUrl: ({ query }) =>
      `https://cl.computrabajo.com/trabajo-de-${slugify(query) || 'desarrollador'}`,
    accepts: (url) =>
      /computrabajo\.com\/(?:ofertas-de-trabajo|trabajo-de|trabajo-para)\//i.test(url),
  },
  external: {
    label: 'Get on Board',
    buildUrl: ({ query }) =>
      `https://www.getonbrd.com/jobs?query=${encodeURIComponent(query)}`,
    accepts: (url) => /getonbrd\.com\/(?:jobs|empleos)\//i.test(url),
  },
};

export async function runBrowserJobSearch(input, onProgress = () => {}) {
  const query = buildQuery(input);
  const location = cleanText(input?.location, 160);
  const platforms = normalizePlatforms(input?.platforms);
  const limit = Math.max(1, Math.min(25, Number(input?.limit ?? 10) || 10));
  const keywords = buildKeywords(input, query);
  const jobs = [];
  const warnings = [];
  let browser;

  onProgress({ phase: 'opening_browser', message: 'Abriendo Microsoft Edge…', progress: 5 });

  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
      args: ['--start-maximized'],
    });

    const context = await browser.newContext({
      viewport: null,
      locale: 'es-CL',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);

    for (let index = 0; index < platforms.length && jobs.length < limit; index += 1) {
      const platformId = platforms[index];
      const target = SEARCH_TARGETS[platformId];
      const progress = 10 + Math.round((index / platforms.length) * 75);
      onProgress({
        phase: 'browsing',
        message: `Buscando en ${target.label}…`,
        progress,
        current_platform: platformId,
        found: jobs.length,
      });

      try {
        await page.goto(target.buildUrl({ query, location }), {
          waitUntil: 'domcontentloaded',
          timeout: 25_000,
        });
        await dismissConsent(page);
        await humanBrowse(page);

        const remaining = limit - jobs.length;
        const found = await collectJobs(page, target, remaining, {
          query,
          location,
          keywords,
          platformId,
        });
        jobs.push(...found);
      } catch (error) {
        warnings.push(`${target.label}: ${safeErrorMessage(error)}`);
      }
    }

    onProgress({
      phase: 'importing',
      message: `Importando ${jobs.length} ofertas encontradas…`,
      progress: 90,
      found: jobs.length,
    });

    return { jobs: dedupeByLink(jobs).slice(0, limit), warnings, query };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

function normalizePlatforms(value) {
  const requested = Array.isArray(value) ? value.map(String) : [];
  const supported = requested.filter((id) => SEARCH_TARGETS[id]);
  return [...new Set(supported.length ? supported : ['linkedin', 'computrabajo'])];
}

function buildQuery(input) {
  const profile = input?.profile ?? {};
  const roles = cleanText(profile.targetRoles, 240);
  const preferredTechnology = cleanText(input?.preferredTechnology, 120);
  const skills = cleanText(profile.skills, 240)
    .split(/[,;|\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
  return roles || [preferredTechnology, skills].filter(Boolean).join(' ') || 'desarrollador junior';
}

function buildKeywords(input, query) {
  const profile = input?.profile ?? {};
  return [query, profile.skills, input?.preferredTechnology]
    .flatMap((value) => cleanText(value, 500).split(/[^\p{L}\p{N}+#.]+/u))
    .map((value) => value.toLowerCase())
    .filter((value) => value.length >= 3)
    .slice(0, 24);
}

async function dismissConsent(page) {
  const button = page
    .getByRole('button', { name: /aceptar|acepto|permitir todas|accept all|entendido/i })
    .first();
  if (await button.isVisible().catch(() => false)) {
    await button.click({ timeout: 2_500 }).catch(() => undefined);
  }
}

async function humanBrowse(page) {
  await page.mouse.move(320, 220, { steps: 12 });
  await page.waitForTimeout(650);
  await page.mouse.wheel(0, 720);
  await page.waitForTimeout(900);
  await page.mouse.move(760, 520, { steps: 16 });
}

async function collectJobs(page, target, limit, context) {
  const candidates = await page.locator('a[href]').evaluateAll((anchors) =>
    anchors.map((anchor) => {
      const href = anchor.href || '';
      const title = (anchor.textContent || anchor.getAttribute('aria-label') || '').trim();
      const container = anchor.closest('li, article, [class*="card"], [class*="job"]');
      const text = (container?.textContent || anchor.parentElement?.textContent || title)
        .replace(/\s+/g, ' ')
        .trim();
      return { href, title, text };
    }),
  );

  const jobs = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const link = normalizeLink(candidate.href);
    const title = cleanText(candidate.title, 180);
    if (!link || seen.has(link) || !target.accepts(link) || title.length < 4) continue;
    seen.add(link);

    const cardText = cleanText(candidate.text, 900);
    const company = inferCompany(cardText, title, target.label);
    jobs.push({
      titulo: title,
      empresa: company,
      descripcion: cardText || `Oferta encontrada navegando en ${target.label}.`,
      link,
      ubicacion: context.location || 'Por confirmar',
      aplicado: false,
      match_score: computeMatchScore(`${title} ${cardText}`, context.keywords, context.location),
      tecnologias: context.keywords.slice(0, 8),
      ia_razones: [
        `Encontrada navegando en ${target.label}`,
        `Coincide con la búsqueda “${context.query}”`,
        'Requiere revisión antes del envío final',
      ],
      application_platform: context.platformId,
    });
    if (jobs.length >= limit) break;
  }
  return jobs;
}

function inferCompany(text, title, fallback) {
  const clean = cleanText(text, 500).replace(title, '').trim();
  const firstLine = clean.split(/\s+[·|•-]\s+|\n/).find((part) => part.trim().length >= 2);
  return cleanText(firstLine, 120) || fallback;
}

function computeMatchScore(text, keywords, location) {
  const normalized = String(text ?? '').toLowerCase();
  const matches = keywords.filter((keyword) => normalized.includes(keyword)).length;
  const locationMatch = location && normalized.includes(location.toLowerCase()) ? 5 : 0;
  return Math.min(96, 55 + Math.min(matches, 6) * 6 + locationMatch);
}

function dedupeByLink(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const link = normalizeLink(job?.link);
    if (!link || seen.has(link)) return false;
    seen.add(link);
    job.link = link;
    return true;
  });
}

function normalizeLink(link) {
  try {
    const url = new URL(String(link ?? '').trim());
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|trk|tracking|ref|source)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return '';
  }
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function cleanText(value, maxLength = 500) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeErrorMessage(error) {
  const message = String(error?.message ?? 'No se pudo navegar en el portal.').split('\n')[0];
  return message.slice(0, 220);
}
