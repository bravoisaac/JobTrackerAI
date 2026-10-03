import { chromium } from 'playwright-core';

const START_ACTION = /postularme|postular ahora|solicitud sencilla|postulaci[oó]n sencilla|easy apply|apply now|apply for/i;
const NEXT_ACTION = /continuar|siguiente|next|revisar|review/i;
const SUBMIT_ACTION = /enviar (?:solicitud|postulaci[oó]n)|submit application|send application|finalizar postulaci[oó]n/i;
const SUCCESS_TEXT = /solicitud enviada|postulaci[oó]n enviada|has postulado|application submitted|application was sent|postulaci[oó]n completada/i;
const CAPTCHA_TEXT = /captcha|verifica que eres humano|verify you are human|comprobaci[oó]n de seguridad/i;

export async function runBrowserApplication({ job, profile }, onProgress = () => {}) {
  let browser;
  let currentPhase = 'opening_browser';

  onProgress({
    phase: 'opening_browser',
    message: 'Abriendo Microsoft Edge para postular…',
    progress: 5,
  });

  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
      args: ['--start-maximized'],
    });

    const context = await browser.newContext({ viewport: null, locale: 'es-CL' });
    trackNavigation(context, onProgress, () => ({ phase: currentPhase }));
    let page = await context.newPage();
    page.setDefaultTimeout(8_000);

    await page.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await reportNavigation(page, onProgress, { phase: currentPhase });
    await dismissConsent(page);

    currentPhase = 'locating_form';
    onProgress({
      phase: 'locating_form',
      message: 'Buscando el formulario de postulación…',
      progress: 15,
    });

    let startButton = await findAction(page, START_ACTION);
    if (!startButton) {
      currentPhase = 'awaiting_login';
      onProgress({
        phase: 'awaiting_login',
        message: 'Inicia sesión en Edge si el portal lo solicita. Continuaré automáticamente.',
        progress: 20,
      });
      startButton = await waitForActionOrSuccess(context, START_ACTION, 5 * 60_000);
    }

    if (startButton) {
      await startButton.click();
      await page.waitForTimeout(900);
      page = latestPage(context, page);
      page.setDefaultTimeout(8_000);
    }

    let fieldsFilled = 0;
    for (let step = 0; step < 12; step += 1) {
      page = latestPage(context, page);
      if (page.isClosed()) throw new Error('La ventana de postulación fue cerrada.');
      if (await hasSuccess(page)) {
        return { submitted: true, fields_filled: fieldsFilled };
      }

      if (await hasCaptcha(page)) {
        currentPhase = 'awaiting_captcha';
        onProgress({
          phase: 'awaiting_captcha',
          message: 'Completa la verificación de seguridad en Edge. No intentaremos resolverla.',
          progress: Math.min(85, 30 + step * 5),
        });
        const outcome = await waitForUserProgress(context, profile, job, 8 * 60_000);
        fieldsFilled += outcome.fieldsFilled;
        if (outcome.submitted) return { submitted: true, fields_filled: fieldsFilled };
        continue;
      }

      const filledNow = await fillKnownFields(page, profile, job);
      fieldsFilled += filledNow;
      const missingRequired = await countMissingRequiredFields(page);

      currentPhase = 'filling_form';
      onProgress({
        phase: 'filling_form',
        message: `Completando el formulario (${fieldsFilled} campos rellenados)…`,
        progress: Math.min(80, 35 + step * 6),
        fields_filled: fieldsFilled,
      });

      if (missingRequired > 0) {
        currentPhase = 'awaiting_answers';
        onProgress({
          phase: 'awaiting_answers',
          message: `Faltan ${missingRequired} respuestas obligatorias. Complétalas en Edge y continuaré.`,
          progress: Math.min(85, 45 + step * 5),
          fields_filled: fieldsFilled,
        });
        const outcome = await waitForUserProgress(context, profile, job, 10 * 60_000);
        fieldsFilled += outcome.fieldsFilled;
        if (outcome.submitted) return { submitted: true, fields_filled: fieldsFilled };
        continue;
      }

      const submitButton = await findAction(page, SUBMIT_ACTION);
      if (submitButton) {
        currentPhase = 'submitting';
        onProgress({
          phase: 'submitting',
          message: 'Enviando la postulación…',
          progress: 90,
          fields_filled: fieldsFilled,
        });
        await submitButton.click();
        await page.waitForTimeout(1_200);
        page = latestPage(context, page);
        if (await waitForSuccess(page, 20_000)) {
          return { submitted: true, fields_filled: fieldsFilled };
        }
        continue;
      }

      const nextButton = await findAction(page, NEXT_ACTION);
      if (nextButton) {
        await nextButton.click();
        await page.waitForTimeout(800);
        continue;
      }

      currentPhase = 'awaiting_answers';
      onProgress({
        phase: 'awaiting_answers',
        message: 'El portal requiere una acción que no puedo identificar. Complétala en Edge.',
        progress: Math.min(85, 50 + step * 4),
        fields_filled: fieldsFilled,
      });
      const outcome = await waitForUserProgress(context, profile, job, 10 * 60_000);
      fieldsFilled += outcome.fieldsFilled;
      if (outcome.submitted) return { submitted: true, fields_filled: fieldsFilled };
    }

    throw new Error('El portal no confirmó el envío de la postulación.');
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

function trackNavigation(context, onProgress, getMeta) {
  const trackedPages = new WeakSet();
  const attach = (page) => {
    if (trackedPages.has(page)) return;
    trackedPages.add(page);
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      void reportNavigation(page, onProgress, getMeta());
    });
    void reportNavigation(page, onProgress, getMeta());
  };

  context.pages().forEach(attach);
  context.on('page', attach);
}

async function reportNavigation(page, onProgress, meta) {
  const url = safeBrowserUrl(page.url());
  if (!url) return;
  const title = String(await page.title().catch(() => '')).trim().slice(0, 160);
  const event = {
    url,
    title: title || url.split('/')[0],
    phase: meta.phase,
    visited_at: new Date().toISOString(),
  };
  onProgress({
    current_url: event.url,
    current_title: event.title,
    navigation_event: event,
  });
}

function safeBrowserUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `${url.hostname}${url.pathname}`.replace(/\/$/, '').slice(0, 260) || url.hostname;
  } catch {
    return '';
  }
}

async function waitForActionOrSuccess(context, pattern, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const page = latestPage(context);
    if (!page || page.isClosed()) throw new Error('La ventana de postulación fue cerrada.');
    if (await hasSuccess(page)) return null;
    if (await hasApplicationForm(page)) return null;
    const action = await findAction(page, pattern);
    if (action) return action;
    await page.waitForTimeout(1_000);
  }
  throw new Error('Se agotó el tiempo para iniciar sesión o abrir el formulario.');
}

async function waitForUserProgress(context, profile, job, timeout) {
  const deadline = Date.now() + timeout;
  let fieldsFilled = 0;
  while (Date.now() < deadline) {
    const page = latestPage(context);
    if (!page || page.isClosed()) throw new Error('La ventana de postulación fue cerrada.');
    if (await hasSuccess(page)) return { submitted: true, fieldsFilled };
    if (!(await hasCaptcha(page))) {
      fieldsFilled += await fillKnownFields(page, profile, job);
      if ((await countMissingRequiredFields(page)) === 0) {
        return { submitted: false, fieldsFilled };
      }
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error('La postulación quedó esperando una acción en el portal y expiró.');
}

async function fillKnownFields(page, profile, job) {
  const fields = page.locator('input:not([type="hidden"]), textarea');
  const count = await fields.count();
  let filled = 0;

  for (let index = 0; index < count; index += 1) {
    const field = fields.nth(index);
    if (!(await field.isVisible().catch(() => false)) || !(await field.isEnabled().catch(() => false))) {
      continue;
    }

    const type = String((await field.getAttribute('type')) ?? 'text').toLowerCase();
    if (!['text', 'email', 'tel', 'url', 'search', 'number'].includes(type) && (await field.evaluate((el) => el.tagName)) !== 'TEXTAREA') {
      continue;
    }
    if (String(await field.inputValue().catch(() => '')).trim()) continue;

    const descriptor = normalize(
      await field.evaluate((element) => {
        const labels = Array.from(element.labels ?? []).map((label) => label.textContent ?? '');
        return [
          ...labels,
          element.getAttribute('aria-label'),
          element.getAttribute('placeholder'),
          element.getAttribute('name'),
          element.getAttribute('autocomplete'),
        ]
          .filter(Boolean)
          .join(' ');
      }),
    );
    const value = valueForField(descriptor, profile, job);
    if (!value) continue;

    await field.fill(String(value).slice(0, 4_000)).catch(() => undefined);
    if (String(await field.inputValue().catch(() => '')).trim()) filled += 1;
  }
  return filled;
}

function valueForField(label, profile, job) {
  const names = splitName(profile.fullName);
  if (/correo|email|e mail/.test(label)) return profile.email;
  if (/telefono|tel[eé]fono|phone|mobile|celular/.test(label)) return profile.phone;
  if (/nombre completo|full name|your name/.test(label)) return profile.fullName;
  if (/apellido|last name|family name|surname/.test(label)) return names.last;
  if (/primer nombre|first name|given name|^nombre$/.test(label)) return names.first;
  if (/ubicacion|ubicaci[oó]n|location|city|ciudad/.test(label)) return profile.location;
  if (/linkedin/.test(label)) return profile.linkedin;
  if (/portafolio|portfolio|github|sitio web|website/.test(label)) return profile.portfolio;
  if (/expectativa salarial|pretensi[oó]n|salary|salario/.test(label)) return '';
  if (/carta de presentacion|cover letter|motivaci[oó]n|por qu[eé].*(?:cargo|puesto|role)/.test(label)) {
    return buildCoverMessage(profile, job);
  }
  if (/resumen|summary|sobre ti|about you|perfil profesional/.test(label)) return profile.summary;
  if (/experiencia|experience/.test(label)) return profile.experience;
  if (/educaci[oó]n|education|estudios/.test(label)) return profile.education;
  return '';
}

function buildCoverMessage(profile, job) {
  const intro = `Hola, soy ${profile.fullName}. Me interesa postular al cargo ${job.titulo || 'publicado'}${job.empresa ? ` en ${job.empresa}` : ''}.`;
  const summary = String(profile.summary ?? '').trim();
  return [intro, summary, 'Quedo disponible para conversar sobre mi experiencia y el cargo.'].filter(Boolean).join('\n\n');
}

async function countMissingRequiredFields(page) {
  return page.locator('input, textarea, select').evaluateAll((elements) =>
    elements.filter((element) => {
      if (element.disabled || element.type === 'hidden') return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || !element.getClientRects().length) return false;
      const required = element.required || element.getAttribute('aria-required') === 'true';
      if (!required) return false;
      if (element.type === 'checkbox' || element.type === 'radio') return !element.checked;
      return !String(element.value ?? '').trim();
    }).length,
  );
}

async function hasApplicationForm(page) {
  const visibleFields = page.locator('input:not([type="hidden"]), textarea, select');
  const count = await visibleFields.count();
  let visibleCount = 0;
  for (let index = 0; index < count; index += 1) {
    const field = visibleFields.nth(index);
    if (!(await field.isVisible().catch(() => false))) continue;
    visibleCount += 1;
    const required =
      (await field.getAttribute('required')) !== null ||
      (await field.getAttribute('aria-required')) === 'true';
    const tagName = await field.evaluate((element) => element.tagName);
    if (required || tagName === 'TEXTAREA' || visibleCount >= 2) return true;
  }
  return false;
}

async function findAction(page, pattern) {
  for (const role of ['button', 'link']) {
    const locator = page.getByRole(role, { name: pattern }).filter({ visible: true }).first();
    if ((await locator.count()) && (await locator.isEnabled().catch(() => false))) return locator;
  }
  return null;
}

async function dismissConsent(page) {
  const action = await findAction(page, /aceptar|acepto|permitir todas|accept all|entendido/i);
  if (action) await action.click({ timeout: 2_500 }).catch(() => undefined);
}

async function hasCaptcha(page) {
  const text = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
  if (CAPTCHA_TEXT.test(text)) return true;
  return (await page.locator('iframe[src*="captcha" i], iframe[title*="captcha" i]').count()) > 0;
}

async function hasSuccess(page) {
  const text = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
  return SUCCESS_TEXT.test(text);
}

async function waitForSuccess(page, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await hasSuccess(page)) return true;
    await page.waitForTimeout(800);
  }
  return false;
}

function latestPage(context, fallback) {
  return context.pages().filter((page) => !page.isClosed()).at(-1) ?? fallback;
}

function splitName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    first: parts.at(0) ?? '',
    last: parts.slice(1).join(' '),
  };
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
