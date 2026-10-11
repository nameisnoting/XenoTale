import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs/promises';
import { populateGarden } from '../tests/fixtures/garden';
import type { Work } from '../src/domain/types';

// Legacy regression tests use an isolated, test-only work. Production starts empty.
export default async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(config.projects[0].use.baseURL!);
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
    await page.getByText('저장완료', { exact: true }).waitFor();
    const base = await page.evaluate(
      () =>
        new Promise<Work>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const read = database.transaction('workspaces').objectStore('workspaces').getAll();
            read.onsuccess = () => {
              database.close();
              resolve(read.result[0].work);
            };
            read.onerror = () => {
              database.close();
              reject(read.error);
            };
          };
        }),
    );
    await page.evaluate(
      (work) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const tx = database.transaction(['works', 'profiles', 'workspaces'], 'readwrite');
            tx.objectStore('works').put({
              id: work.id,
              work,
              owned: true,
              hidden: false,
              createdAt: Date.now(),
            });
            tx.objectStore('workspaces').clear();
            const profile = tx.objectStore('profiles').get('profile');
            profile.onsuccess = () => {
              const value = profile.result;
              value.onboarded = false;
              delete value.lastWorkspaceId;
              tx.objectStore('profiles').put(value);
            };
            tx.oncomplete = () => {
              database.close();
              resolve();
            };
            tx.onabort = () => {
              database.close();
              reject(tx.error);
            };
          };
        }),
      populateGarden(base),
    );
    await fs.mkdir('.test-tmp', { recursive: true });
    await context.storageState({ indexedDB: true, path: '.test-tmp/e2e-state.json' });
  } finally {
    await browser.close();
  }
}
