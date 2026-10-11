import { describe, expect, it } from 'vitest';
import { emptyWork } from './defaults';
import { exampleWork } from '../test/exampleWork';
import { SYSTEM_PROMPT, effectiveSystemPrompt, upgradeProvidedSystemPrompt } from './systemPrompt';
import legacyPrompt from '../engine/prompts/narrator_legacy_v2.txt?raw';
import plainPrompt from '../engine/prompts/narrator_plain_v2.txt?raw';
import { createRoom, validateWork } from './engine';
import { buildMessages } from '../engine/openrouter';
import { workSchema } from '../persistence/files';

describe('editable system prompt', () => {
  it('starts with the real XenoTale narrator and preserves legacy default mode', () => {
    const work = emptyWork();
    expect(work.systemMode).toBe('custom');
    expect(work.customSystem).toBe(SYSTEM_PROMPT);
    expect(effectiveSystemPrompt({ systemMode: 'default', customSystem: 'ignored' })).toBe(
      SYSTEM_PROMPT,
    );
  });
  it('rejects an empty custom prompt when publishing, while allowing draft saving', () => {
    const work = exampleWork();
    work.customSystem = '  ';
    expect(() => validateWork(work)).not.toThrow();
    expect(() => validateWork(work, true)).toThrow('시스템 프롬프트');
    work.systemMode = 'default';
    expect(() => validateWork(work, true)).not.toThrow();
  });
  it('retains edits in exported data and places them in the actual model input', () => {
    const work = exampleWork();
    work.systemMode = 'custom';
    work.customSystem = '맞춤 서사 지시';
    const parsed = workSchema.parse(work);
    expect(parsed.customSystem).toBe('맞춤 서사 지시');
    const room = createRoom(parsed);
    const messages = buildMessages(room, room.current, '안녕', {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: false,
      transport: 'json',
    });
    expect(JSON.stringify(messages)).toContain('맞춤 서사 지시');
  });
  it.each([legacyPrompt, plainPrompt])(
    'upgrades only the unedited provided default and preserves user-authored variations',
    (previousPrompt) => {
      const work = exampleWork();
      work.customSystem = previousPrompt.replace(/\r?\n/g, '\r\n');
      expect(upgradeProvidedSystemPrompt(work).customSystem).toBe(SYSTEM_PROMPT);
      work.customSystem = previousPrompt + '\n내가 추가한 캐릭터 연기 규칙';
      expect(upgradeProvidedSystemPrompt(work)).toBe(work);
      work.customSystem = '';
      expect(upgradeProvidedSystemPrompt(work)).toBe(work);
      work.customSystem = SYSTEM_PROMPT;
      expect(upgradeProvidedSystemPrompt(work)).toBe(work);
    },
  );
  it('uses the same provided narrator in the editable default, reset source, and actual system message', () => {
    const work = exampleWork();
    expect(work.customSystem).toBe(SYSTEM_PROMPT);
    const room = createRoom(work);
    const messages = buildMessages(room, room.current, '안녕', {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: true,
      transport: 'json',
    });
    expect(messages[0].content).toContain(work.customSystem);
    expect(SYSTEM_PROMPT).not.toMatch(/STYLE:|RATIO:|PACING:|LENGTH:|VIEWPOINT:/);
  });
});
