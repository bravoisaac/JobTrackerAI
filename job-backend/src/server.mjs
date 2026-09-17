import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { loadJobs, nextId, saveJobs } from './store.mjs';
import { extractJson, getModel, getOpenAIClient } from './openai.mjs';
import {
  APPLICATION_PLATFORMS,
  detectApplicationPlatform,
  prepareApplication
} from './application-platforms.mjs';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

function isInsufficientQuota(err) {
  const code = err?.code ?? err?.error?.code;
  return code === 'insufficient_quota';
}

function isMissingApiKey(err) {
  return String(err?.message ?? '').includes('Missing OPENAI_API_KEY');
}

function isRateLimited(err) {
  const code = err?.code ?? err?.error?.code;
  const status = Number(err?.status ?? err?.response?.status);
  return status === 429 || code === 'rate_limit_exceeded' || code === 'too_many_requests';
}

function cleanText(value, maxLength = 4000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function formatCandidateProfile(profile) {
  if (!profile || typeof profile !== 'object') return 'Perfil no informado.';

  const rows = [
    ['Nombre', profile.fullName],
    ['Email', profile.email],
    ['Telefono', profile.phone],
    ['Ubicacion', profile.location],
    ['LinkedIn', profile.linkedin],
    ['Portafolio/GitHub', profile.portfolio],
    ['Resumen profesional', profile.summary],
    ['Cargos objetivo', profile.targetRoles],
    ['Habilidades y tecnologias', profile.skills],
    ['Experiencia', profile.experience],
    ['Educacion y certificaciones', profile.education],
    ['Idiomas', profile.languages],
    ['Archivo CV adjunto', profile.cvFileName],
    ['Texto CV base', cleanText(profile.cvText, 12000)]
  ];

  const lines = rows
    .map(([label, value]) => {
      const clean = cleanText(value, label === 'Texto CV base' ? 12000 : 4000);
      return clean ? `${label}: ${clean}` : '';
    })
    .filter(Boolean);

  return lines.length ? lines.join('\n') : 'Perfil no informado.';
}

function mockDiscoveredJobs({ query, location, technologies, limit }) {
  const q = encodeURIComponent(query);
  const loc = (location || '').trim();
  const tech = Array.isArray(technologies) ? technologies.filter(Boolean).join(', ') : '';
  const base = [
    {
      titulo: `Resultados en Get on Board: ${query}`,
      empresa: 'Get on Board',
      link: `https://www.getonbrd.com/empleos?query=${q}`,
      ubicacion: loc || 'LatAm / Remoto',
      descripcion: `Búsqueda de ofertas para “${query}”.`,
      match_score: 75,
      tecnologias: technologies ?? [],
      ia_razones: ['Fallback mock', 'Sin cuota OpenAI', 'Usa links de búsqueda']
    },
    {
      titulo: `Resultados en LinkedIn: ${query}`,
      empresa: 'LinkedIn',
      link: `https://www.linkedin.com/jobs/search/?keywords=${q}`,
      ubicacion: loc || 'Global',
      descripcion: 'Búsqueda en LinkedIn Jobs (requiere sesión en algunos casos).',
      match_score: 70,
      tecnologias: technologies ?? [],
      ia_razones: ['Fallback mock', 'Sin cuota OpenAI', 'Usa links de búsqueda']
    },
    {
      titulo: `Remote OK: ${query}`,
      empresa: 'Remote OK',
      link: `https://remoteok.com/remote-${q}-jobs`,
      ubicacion: 'Remoto',
      descripcion: 'Búsqueda en Remote OK.',
      match_score: 65,
      tecnologias: technologies ?? [],
      ia_razones: ['Fallback mock', 'Sin cuota OpenAI', 'Usa links de búsqueda']
    },
    {
      titulo: `Indeed: ${query}`,
      empresa: 'Indeed',
      link: `https://www.indeed.com/jobs?q=${q}`,
      ubicacion: loc || '—',
      descripcion: 'Búsqueda en Indeed.',
      match_score: 60,
      tecnologias: technologies ?? [],
      ia_razones: ['Fallback mock', 'Sin cuota OpenAI', 'Usa links de búsqueda']
    }
  ];

  const filled = [];
  while (filled.length < Math.max(1, limit)) filled.push(base[filled.length % base.length]);

  // Pequeña pista en descripción para el usuario
  if (tech || loc) {
    filled[0] = {
      ...filled[0],
      descripcion: `Búsqueda “${query}”${loc ? ` en ${loc}` : ''}${tech ? ` (${tech})` : ''}.`
    };
  }

  return filled.slice(0, limit);
}

function normalizeLink(link) {
  const raw = String(link ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';

    // Remove common tracking params
    const tracking = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
      'ref',
      'source'
    ]);
    for (const key of [...u.searchParams.keys()]) {
      if (tracking.has(key.toLowerCase())) u.searchParams.delete(key);
    }

    // Normalize host casing
    u.hostname = u.hostname.toLowerCase();

    // Remove trailing slash (except root)
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);

    return u.toString();
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

const asyncRoute =
  (handler) =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'job-backend', time: new Date().toISOString() });
});

app.get('/application-platforms', (req, res) => {
  res.json({ platforms: APPLICATION_PLATFORMS });
});

app.get(
  '/jobs',
  asyncRoute(async (req, res) => {
  const jobs = await loadJobs();
  res.json(
    jobs.map((job) => ({
      ...job,
      application_platform: job.application_platform ?? detectApplicationPlatform(job?.link)
    }))
  );
  })
);

app.post(
  '/jobs',
  asyncRoute(async (req, res) => {
  const jobs = await loadJobs();
  const payload = req.body ?? {};

  const job = {
    id: nextId(jobs),
    titulo: String(payload.titulo ?? ''),
    empresa: String(payload.empresa ?? ''),
    descripcion: String(payload.descripcion ?? ''),
    link: String(payload.link ?? ''),
    ubicacion: String(payload.ubicacion ?? ''),
    aplicado: Boolean(payload.aplicado ?? false),
    match_score: Number(payload.match_score ?? 0),
    tecnologias: Array.isArray(payload.tecnologias) ? payload.tecnologias.map(String) : [],
    ia_razones: Array.isArray(payload.ia_razones) ? payload.ia_razones.map(String) : [],
    application_platform: detectApplicationPlatform(payload.link)
  };

  if (!job.titulo || !job.empresa || !job.link) {
    return res.status(400).json({ detail: 'titulo, empresa y link son requeridos' });
  }

  const incomingNorm = normalizeLink(job.link);
  const existing = jobs.find((j) => normalizeLink(j?.link) === incomingNorm);
  if (existing) {
    // Idempotent insert: if the link already exists, return the existing job.
    return res.status(200).json(existing);
  }

  jobs.push(job);
  await saveJobs(jobs);
  res.status(201).json(job);
  })
);

app.put(
  '/jobs/:id/apply',
  asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const jobs = await loadJobs();
  const idx = jobs.findIndex((j) => Number(j.id) === id);
  if (idx === -1) return res.status(404).json({ detail: 'Job no encontrado' });

  jobs[idx] = {
    ...jobs[idx],
    aplicado: true,
    aplicado_at: new Date().toISOString(),
    application_status: 'submitted'
  };
  await saveJobs(jobs);
  res.json(jobs[idx]);
  })
);

app.post(
  '/applications/prepare-batch',
  asyncRoute(async (req, res) => {
  const payload = req.body ?? {};
  const profile = payload.profile ?? {};
  const fullName = cleanText(profile.fullName, 160);
  const email = cleanText(profile.email, 320);
  if (!fullName || !email) {
    return res.status(400).json({
      detail: 'Completa nombre y email en tu perfil antes de preparar postulaciones.'
    });
  }

  const allowedPlatforms = new Set(APPLICATION_PLATFORMS.map((platform) => platform.id));
  const requestedPlatforms = Array.isArray(payload.platforms)
    ? payload.platforms.map(String).filter((id) => allowedPlatforms.has(id))
    : [];
  if (!requestedPlatforms.length) {
    return res.status(400).json({ detail: 'Selecciona al menos una plataforma.' });
  }

  const minScore = Math.max(0, Math.min(100, Number(payload.min_score ?? 0) || 0));
  const maxItems = Math.max(1, Math.min(25, Number(payload.limit ?? 10) || 10));
  const selected = new Set(requestedPlatforms);
  const jobs = await loadJobs();
  const prepared = [];

  for (let index = 0; index < jobs.length && prepared.length < maxItems; index += 1) {
    const job = jobs[index];
    const platformId = detectApplicationPlatform(job?.link);
    if (job?.aplicado || job?.application_status === 'ready_for_review') continue;
    if (!selected.has(platformId) || Number(job?.match_score ?? 0) < minScore) continue;

    jobs[index] = { ...job, ...prepareApplication(job), application_platform: platformId };
    prepared.push(jobs[index]);
  }

  if (prepared.length) await saveJobs(jobs);
  res.json({
    prepared,
    total: prepared.length,
    mode: 'assisted',
    message: prepared.length
      ? 'Postulaciones preparadas para revisión. El envío final se realiza en cada portal.'
      : 'No hay ofertas nuevas que cumplan los filtros seleccionados.'
  });
  })
);

app.post(
  '/generate',
  asyncRoute(async (req, res) => {
  const { job_id, profile } = req.body ?? {};
  const id = Number(job_id);
  if (!id) return res.status(400).json({ detail: 'job_id requerido' });

  const jobs = await loadJobs();
  const job = jobs.find((j) => Number(j.id) === id);
  if (!job) return res.status(404).json({ detail: 'Job no encontrado' });

  const candidateProfile = formatCandidateProfile(profile);

  const prompt = [
    'Genera una postulación profesional en español para este trabajo.',
    'Devuelve SOLO JSON con el formato:',
    '{ "correo": "...", "mensaje_linkedin": "...", "cv": "..." }',
    '',
    'Requisitos:',
    '- Usa el perfil del candidato y adapta el mensaje a la oferta.',
    '- No inventes experiencia.',
    '- Genera un CV ATS en espanol, listo para copiar.',
    '- El CV debe incluir datos personales disponibles y priorizar habilidades relevantes.',
    '',
    'Perfil del candidato:',
    candidateProfile,
    '',
    'Trabajo:',
    `Titulo: ${job.titulo}`,
    `Empresa: ${job.empresa}`,
    `Ubicacion: ${job.ubicacion}`,
    `Descripcion: ${job.descripcion}`
  ].join('\n');

  try {
    const client = getOpenAIClient();
    const model = getModel();

    const response = await client.responses.create({
      model,
      input: prompt
    });

    const data = extractJson(response.output_text);
    res.json({
      correo: String(data.correo ?? ''),
      mensaje_linkedin: String(data.mensaje_linkedin ?? ''),
      cv: String(data.cv ?? '')
    });
  } catch (err) {
    if (
      process.env.MOCK_ON_QUOTA === '1' &&
      (isInsufficientQuota(err) || isMissingApiKey(err) || isRateLimited(err))
    ) {
      const candidateName = cleanText(profile?.fullName) || 'Tu Nombre';
      const candidateEmail = cleanText(profile?.email);
      const candidatePhone = cleanText(profile?.phone);
      const candidateLocation = cleanText(profile?.location);
      const candidateSummary = cleanText(profile?.summary);
      const candidateSkills = cleanText(profile?.skills);
      const candidateExperience = cleanText(profile?.experience);
      const candidateEducation = cleanText(profile?.education);
      const cv = [
        candidateName.toUpperCase(),
        [candidateEmail, candidatePhone, candidateLocation].filter(Boolean).join(' | '),
        '',
        'PERFIL PROFESIONAL',
        candidateSummary || `Perfil junior orientado al cargo ${job.titulo}.`,
        '',
        'HABILIDADES',
        candidateSkills || 'Habilidades relevantes para el cargo.',
        '',
        'EXPERIENCIA / PROYECTOS',
        candidateExperience || 'Agregar proyectos, practicas o experiencia relacionada.',
        '',
        'EDUCACION',
        candidateEducation || 'Agregar educacion, cursos o certificaciones.'
      ].join('\n');

      const correo = [
        `Asunto: Postulación — ${job.titulo} (${job.empresa})`,
        '',
        `Hola equipo de ${job.empresa},`,
        '',
        `Me gustaría postular al cargo “${job.titulo}”. He revisado la descripción y creo que puedo aportar desde mi experiencia.`,
        '',
        'Quedo atento/a para coordinar una entrevista.',
        '',
        'Saludos,',
        candidateName
      ].join('\n');

      const mensaje_linkedin = `Hola ${job.empresa}, ¿cómo estás? Me interesa el rol “${job.titulo}”. ¿Podrías indicarme el mejor canal para postular? Gracias!`;

      return res.json({ correo, mensaje_linkedin, cv, mock: true });
    }
    throw err;
  }
  })
);

app.post(
  '/discover',
  asyncRoute(async (req, res) => {
  const { query, technologies, location, limit } = req.body ?? {};
  const q = String(query ?? '').trim();
  if (!q) return res.status(400).json({ detail: 'query requerido' });

  const tech = Array.isArray(technologies) ? technologies.map(String) : [];
  const loc = String(location ?? '').trim();
  const lim = Math.max(1, Math.min(Number(limit ?? 10), 50));

  const prompt = [
    'Encuentra ofertas de trabajo reales en la web usando búsqueda.',
    'Objetivo: devolver URLs (links) de postings de trabajo.',
    '',
    'Devuelve SOLO JSON válido con el formato:',
    '{ "jobs": [ { "titulo": "...", "empresa": "...", "link": "https://...", "ubicacion": "...", "descripcion": "...", "match_score": 0-100, "tecnologias": ["..."], "ia_razones": ["..."] } ] }',
    '',
    'Reglas:',
    `- Máximo ${lim} resultados.`,
    '- links deben ser URLs directas al aviso (no home genérico si es posible).',
    '- descripcion corta (1-2 frases).',
    '- match_score: qué tan bien calza con la búsqueda y tecnologías (0-100).',
    '- ia_razones: 3 bullets cortos (strings) justificando el score.',
    '',
    `Búsqueda: ${q}`,
    loc ? `Ubicación preferida: ${loc}` : '',
    tech.length ? `Tecnologías: ${tech.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const client = getOpenAIClient();
    const model = getModel();

    const response = await client.responses.create({
      model,
      tools: [{ type: 'web_search' }],
      input: prompt
    });

    const data = extractJson(response.output_text);
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];

    const seen = new Set();
    const unique = [];
    for (const j of jobs) {
      const link = String(j.link ?? '');
      const norm = normalizeLink(link);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      unique.push(j);
      if (unique.length >= lim) break;
    }

    res.json({
      jobs: unique.map((j) => ({
        titulo: String(j.titulo ?? ''),
        empresa: String(j.empresa ?? ''),
        link: String(j.link ?? ''),
        ubicacion: String(j.ubicacion ?? ''),
        descripcion: String(j.descripcion ?? ''),
        match_score: Number(j.match_score ?? 0),
        tecnologias: Array.isArray(j.tecnologias) ? j.tecnologias.map(String) : [],
        ia_razones: Array.isArray(j.ia_razones) ? j.ia_razones.map(String) : []
      }))
    });
  } catch (err) {
    if (
      process.env.MOCK_ON_QUOTA === '1' &&
      (isInsufficientQuota(err) || isMissingApiKey(err) || isRateLimited(err))
    ) {
      const mock = mockDiscoveredJobs({
        query: q,
        location: loc,
        technologies: tech,
        limit: lim
      });
      const seen = new Set();
      const unique = [];
      for (const j of mock) {
        const norm = normalizeLink(j?.link);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        unique.push(j);
        if (unique.length >= lim) break;
      }
      return res.json({
        jobs: unique,
        mock: true
      });
    }
    throw err;
  }
  })
);

// Error handler
app.use((err, req, res, next) => {
  const status = Number(err?.status) || 500;
  res.status(status).json({ detail: err?.message ?? 'Internal server error' });
});

const port = Number(process.env.PORT || 8000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[job-backend] listening on http://localhost:${port}`);
});
