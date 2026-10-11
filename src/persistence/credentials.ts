import { db } from './db';

export type StoredCredential = {
  id: 'openrouter';
  key: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
};
const context = new TextEncoder().encode('XenoTale:openrouter:v1');
function subtle() {
  if (!globalThis.crypto?.subtle)
    throw new Error('API 키를 암호화하려면 HTTPS 또는 localhost에서 앱을 열어 주세요.');
  return crypto.subtle;
}
export async function prepareCredential(value: string): Promise<StoredCredential | undefined> {
  if (!value.trim()) return undefined;
  const key = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: context },
    key,
    new TextEncoder().encode(value.trim()),
  );
  return { id: 'openrouter', key, iv, ciphertext };
}
export async function decryptCredential(record?: StoredCredential) {
  if (!record) return '';
  try {
    const bytes = await subtle().decrypt(
      { name: 'AES-GCM', iv: record.iv, additionalData: context },
      record.key,
      record.ciphertext,
    );
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error('저장된 API 키를 읽지 못했습니다. API 키 관리에서 다시 입력해 주세요.');
  }
}
let writes = Promise.resolve();
export function saveApiKey(value: string) {
  const task = writes.then(async () => {
    const record = await prepareCredential(value);
    if (record) await db.credentials.put(record);
    else await db.credentials.delete('openrouter');
  });
  writes = task.catch(() => {});
  return task;
}
export async function readApiKey() {
  await writes;
  return decryptCredential(await db.credentials.get('openrouter'));
}
