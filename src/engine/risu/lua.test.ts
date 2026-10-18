import 'fake-indexeddb/auto';
import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { RisuLua } from './lua';
import { cbs, applyRisuRules } from './cbs';
import { readRisu } from '../../persistence/risu';
import type { RisuCommand } from './types';

test('Lua keeps state in JSON and cannot access package, files or host JS', async () => {
  const lua = new RisuLua();
  const command: RisuCommand = {
    config: {
      version: 1,
      scripts: [
        {
          id: 'one',
          name: 'state',
          code: `listenEdit('editDisplay',function(id,text) return tostring(io)..':'..tostring(require)..':'..tostring(Promise)..':'..tostring(getState(id,'hp')) end);function onButtonClick(id,data) setState(id,'hp',20) end`,
        },
      ],
      rules: [],
      styles: '',
      variables: '',
      loreSettings: { scanDepth: 2, tokenBudget: 1000, recursive: false },
    },
    chats: [],
    lore: [],
    action: 'button',
    button: 'heal',
    user: '사용자',
    character: '작품',
  };
  try {
    const saved = await lua.run(command);
    expect(saved.state.__hp).toBe('20');
    const display = await lua.run({ ...command, action: 'display', state: saved.state });
    expect(display.text).toBe('nil:nil:nil:20');
  } finally {
    lua.close();
  }
});

test('user PNG: original builder, choice, drawer, request dice and verified TIME response', async () => {
  const dir = process.env.RISU_EXAMPLES_DIR;
  if (!dir) return;
  const name = (await fs.readdir(dir)).find((name) => name.endsWith('.png'))!;
  const imported = await readRisu(new File([await fs.readFile(join(dir, name))], name));
  if (imported.kind !== 'work') throw new Error('Expected work');
  const work = imported.work,
    lua = new RisuLua();
  const command: RisuCommand = {
    config: work.risu!,
    chats: [],
    lore: work.lore,
    action: 'display',
    text: work.openings[0].body,
    index: -1,
    user: '테스터',
    character: work.title,
  };
  try {
    let out = await lua.run(command);
    expect(out.text).toContain('눌러서 만들기');
    expect(applyRisuRules(cbs(out.text, command), command, 'editdisplay')).toContain(
      'data-risu-trigger="dndCg_sp_Elf"',
    );
    for (const button of [
      'dndCg_sp_Elf',
      'dndCg_cl_Fighter',
      'dndCg_bg_Soldier',
      'dndCg_ab_standard',
      'dndCg_eq_A',
      'dndCg_go',
    ]) {
      out = await lua.run({ ...command, action: 'button', button, state: out.state });
    }
    const choices = JSON.parse(out.state.__dnd_cg);
    expect(choices.sp).toBe('Elf');
    expect(choices.cl).toBe('Fighter');
    expect(choices.err).toBeUndefined();
    expect(choices.done).toBeTruthy();
    expect(JSON.parse(out.state.__dnd_sheet).species).toBe('Elf');
    const drawer = await lua.run({
      ...command,
      action: 'button',
      button: 'dndDrawerToggle',
      state: out.state,
    });
    expect(drawer.state.dnd_drawer_open).toBe('1');
    const screen = await lua.run({ ...command, state: drawer.state });
    expect(screen.text).toContain('모험 설정');
    const chats = [...command.chats, { role: 'user', data: '모험을 시작한다.' }];
    const request = await lua.run({
      ...command,
      action: 'request',
      state: out.state,
      chats,
      messages: [
        { role: 'system', content: work.prompt },
        { role: 'user', content: chats.at(-1)!.data },
      ],
    });
    expect(JSON.stringify(request.messages)).toContain('DICE');
    expect(JSON.stringify(request.messages)).toContain('GAME STATE');
    const result = await lua.run({
      ...command,
      action: 'output',
      state: request.state,
      chats: [
        ...chats,
        {
          role: 'char',
          data: '길을 따라 걸었다.\n[TIME|+30m]\n[GOLD|+5 gp]\n[ITEM|+Potion of Healing|1]\n[COMBAT|Goblin Warrior]',
        },
      ],
    });
    expect(result.state.dnd_lua_error ?? '').toBe('');
    expect(result.text).toContain('[STATUS|');
    expect(result.text).toContain('[TIME|+30m|ok|');
    expect(result.text).toContain('[GOLD|+5 gp|ok|');
    expect(result.text).toContain('[ITEM|+Potion of Healing|1|ok|');
    expect(JSON.parse(result.state.__dnd_combat).active).toBeTruthy();
  } finally {
    lua.close();
  }
}, 15000);
