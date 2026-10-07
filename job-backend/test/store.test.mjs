import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function createStore() {
  const directory = await mkdtemp(join(tmpdir(), 'postular-store-'));
  const dataPath = join(directory, 'jobs.json');
  process.env.JOB_DATA_PATH = dataPath;
  const store = await import(`../src/store.mjs?test=${Date.now()}-${Math.random()}`);
  return {
    ...store,
    dataPath,
    cleanup: () => rm(directory, { recursive: true, force: true })
  };
}

test('crea y recupera la base local de forma consistente', async (t) => {
  const store = await createStore();
  t.after(store.cleanup);

  assert.deepEqual(await store.loadJobs(), []);
  await store.saveJobs([{ id: 1, titulo: 'Frontend' }]);

  assert.deepEqual(await store.loadJobs(), [{ id: 1, titulo: 'Frontend' }]);
  const raw = await readFile(store.dataPath, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('no oculta un archivo JSON corrupto', async (t) => {
  const store = await createStore();
  t.after(store.cleanup);
  await writeFile(store.dataPath, '{contenido-invalido', 'utf8');

  await assert.rejects(store.loadJobs(), /No se pudo leer la base local de trabajos/);
  assert.equal(await readFile(store.dataPath, 'utf8'), '{contenido-invalido');
});

test('serializa actualizaciones concurrentes sin perder trabajos', async (t) => {
  const store = await createStore();
  t.after(store.cleanup);

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      store.updateJobs((jobs) => {
        jobs.push({ id: store.nextId(jobs), titulo: `Trabajo ${index + 1}` });
        return { result: jobs.length };
      })
    )
  );

  const jobs = await store.loadJobs();
  assert.equal(jobs.length, 20);
  assert.equal(new Set(jobs.map((job) => job.id)).size, 20);
});
