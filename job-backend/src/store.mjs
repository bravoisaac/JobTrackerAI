import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.JOB_DATA_PATH || join(MODULE_DIR, '..', 'data', 'jobs.json');
let mutationQueue = Promise.resolve();

export async function loadJobs() {
  try {
    const raw = await readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('El archivo de trabajos no contiene una lista válida.');
    }
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`No se pudo leer la base local de trabajos: ${error?.message ?? error}`, {
      cause: error
    });
  }
}

export async function saveJobs(jobs) {
  if (!Array.isArray(jobs)) throw new TypeError('jobs debe ser una lista.');
  await mkdir(dirname(DB_PATH), { recursive: true });

  const temporaryPath = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, DB_PATH);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function updateJobs(updater) {
  if (typeof updater !== 'function') throw new TypeError('updater debe ser una función.');

  const operation = mutationQueue.then(async () => {
    const jobs = await loadJobs();
    const outcome = await updater(jobs);
    if (outcome?.changed !== false) await saveJobs(jobs);
    return outcome?.result;
  });

  mutationQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

export function nextId(jobs) {
  return (jobs.reduce((max, j) => Math.max(max, Number(j?.id) || 0), 0) || 0) + 1;
}
