import { z } from 'zod';
import type { Work, Runtime, Condition, StatusPanel, StatusDef } from './types';
import { id } from './types';
import type { WorkAction } from './actions';
import { effectiveStatus } from './conditions';
import { statusPanels } from './statusTemplate';

const key = z
  .string()
  .min(1)
  .max(1000)
  .refine((s) => !['__proto__', 'prototype', 'constructor'].includes(s));
export const gameBlockSchema = z.object({
  id: key,
  title: z.string().max(1000),
  description: z.string().max(20000),
  columns: z.number().int().min(1).max(3),
  mode: z.enum(['all', 'any']),
  conditions: z
    .array(
      z.object({
        id: key,
        kind: z.enum(['number', 'choice', 'item', 'level', 'quantity']),
        ref: z.string().max(1000),
        op: z.enum(['gte', 'lte', 'eq', 'ne']),
        value: z.union([z.string(), z.number().finite(), z.boolean()]),
      }),
    )
    .max(100),
  buttons: z
    .array(z.object({ id: key, label: z.string().max(1000), actionId: z.string().max(1000) }))
    .max(100),
});
export type GameBlock = z.infer<typeof gameBlockSchema>;

export function gameText(text: string, work: Work, runtime: Runtime) {
  return text.replace(/\{\{([^{}]+)\}\}/g, (token, key) => {
    const exact = work.statuses.find((s) => s.id === key);
    const named = work.statuses.filter((s) => s.name === key);
    const field = exact ?? (named.length === 1 ? named[0] : undefined);
    return field ? String(effectiveStatus(work, runtime, field.id) ?? '') : token;
  });
}

/** A selection is derived from the same values changed by the action, never duplicate UI state. */
export function actionSelected(action: WorkAction, runtime: Runtime) {
  const setters = action.steps.filter((s) => s.kind === 'text' || s.kind === 'set');
  return (
    setters.length > 0 &&
    setters.length === action.steps.length &&
    setters.every((s) =>
      s.kind === 'text'
        ? runtime.status[s.target] === s.value
        : /^-?\d+(?:\.\d+)?$/.test(s.value) && runtime.status[s.target] === Number(s.value),
    )
  );
}

export function gamePanelProblems(work: Work, panel: StatusPanel) {
  const errors: string[] = [];
  const blocks = panel.blocks ?? [];
  if (new Set(blocks.map((b) => b.id)).size !== blocks.length)
    errors.push('화면 영역 ID가 중복되었습니다.');
  for (const block of blocks) {
    if (!gameBlockSchema.safeParse(block).success) {
      errors.push('화면 영역 설정을 확인해 주세요.');
      continue;
    }
    if (new Set(block.buttons.map((b) => b.id)).size !== block.buttons.length)
      errors.push('버튼 ID가 중복되었습니다.');
    for (const button of block.buttons)
      if (
        !button.label.trim() ||
        !work.actions?.some((a) => a.id === button.actionId && a.trigger === 'button')
      )
        errors.push(`${block.title || '화면 영역'}: 버튼 이름과 실행할 규칙을 확인해 주세요.`);
    for (const c of block.conditions) {
      const status = work.statuses.find((s) => s.id === c.ref);
      if (
        c.kind === 'number'
          ? status?.type !== 'number' || typeof c.value !== 'number'
          : c.kind === 'choice'
            ? status?.type !== 'choice' ||
              !status.options.includes(String(c.value)) ||
              !['eq', 'ne'].includes(c.op)
            : !work.items.some((it) => it.id === c.ref) ||
              (c.kind === 'item'
                ? typeof c.value !== 'boolean' || !['eq', 'ne'].includes(c.op)
                : typeof c.value !== 'number')
      )
        errors.push(`${block.title || '화면 영역'}: 표시 조건의 연결을 확인해 주세요.`);
    }
  }
  return [...new Set(errors)];
}

/** Adds an editable native example. Every ID/name is new; existing work content is preserved. */
export function addCharacterSetup(work: Work): Work {
  const statuses = [...work.statuses];
  const field = (base: string, options?: string[], initial: string | number = 0, max = 100) => {
    let name = base,
      n = 2;
    while (statuses.some((s) => s.name === name)) name = `${base}${n++}`;
    const s: StatusDef = {
      id: id(),
      name,
      type: options ? 'choice' : 'number',
      initial,
      min: 0,
      max,
      unit: '',
      options: options ?? [],
      prompt: '플레이어의 선택 화면에서 설정하는 값입니다. 임의로 변경하지 마세요.',
    };
    statuses.push(s);
    return s;
  };
  const stage = field('제작 단계', undefined, 1, 4);
  const race = field('종족', ['미선택', '인간', '엘프', '드워프'], '미선택');
  const job = field('클래스', ['미선택', '전사', '마법사'], '미선택');
  const hp = field('HP', undefined, 10);
  hp.prompt = '클래스 선택 시 초기 HP가 설정됩니다. 모험 중에는 피해와 회복에 따라 변경됩니다.';
  const actions = [...(work.actions ?? [])];
  const at = (value: number): Condition[] => [
    { id: id(), kind: 'number', ref: stage.id, op: 'eq', value },
  ];
  const action = (
    name: string,
    phase: number,
    steps: WorkAction['steps'],
    extra: Condition[] = [],
  ) => {
    let ruleName = name,
      number = 2;
    while (actions.some((a) => a.name === ruleName)) ruleName = `${name}${number++}`;
    const value: WorkAction = {
      id: id(),
      name: ruleName,
      trigger: 'button',
      buttonLocation: 'screen',
      mode: 'all',
      conditions: [...at(phase), ...extra],
      steps,
    };
    actions.push(value);
    return { id: id(), label: name, actionId: value.id };
  };
  const move = (phase: number): WorkAction['steps'] => [
    { kind: 'set', target: stage.id, value: String(phase) },
  ];
  const blocks: GameBlock[] = [
    {
      id: id(),
      title: '1/3 · 종족',
      description: `어떤 종족으로 시작할까요? 현재 선택: {{${race.id}}}`,
      columns: 3,
      mode: 'all',
      conditions: at(1),
      buttons: race.options
        .slice(1)
        .map((value) => action(value, 1, [{ kind: 'text', target: race.id, value }])),
    },
    {
      id: id(),
      title: '',
      description: '',
      columns: 1,
      mode: 'all',
      conditions: at(1),
      buttons: [
        action('클래스 · 다음 ▶', 1, move(2), [
          { id: id(), kind: 'choice', ref: race.id, op: 'ne', value: '미선택' },
        ]),
      ],
    },
    {
      id: id(),
      title: '2/3 · 클래스',
      description: '클래스를 선택하면 초기 HP가 설정됩니다.',
      columns: 2,
      mode: 'all',
      conditions: at(2),
      buttons: job.options.slice(1).map((value, i) =>
        action(value, 2, [
          { kind: 'text', target: job.id, value },
          { kind: 'set', target: hp.id, value: String(i ? 8 : 15) },
        ]),
      ),
    },
    {
      id: id(),
      title: '',
      description: '',
      columns: 2,
      mode: 'all',
      conditions: at(2),
      buttons: [
        action('◀ 종족 · 이전', 2, move(1)),
        action('확인 · 다음 ▶', 2, move(3), [
          { id: id(), kind: 'choice', ref: job.id, op: 'ne', value: '미선택' },
        ]),
      ],
    },
    {
      id: id(),
      title: '3/3 · 확인',
      description: `종족: {{${race.id}}}\n\n클래스: {{${job.id}}}\n\nHP: {{${hp.id}}}`,
      columns: 2,
      mode: 'all',
      conditions: at(3),
      buttons: [action('◀ 클래스 · 이전', 3, move(2)), action('이 캐릭터로 시작', 3, move(4))],
    },
    {
      id: id(),
      title: '캐릭터 준비 완료',
      description: `{{${race.id}}} {{${job.id}}} · HP {{${hp.id}}}\n\n메시지를 보내 모험을 시작하세요.`,
      columns: 1,
      mode: 'all',
      conditions: at(4),
      buttons: [],
    },
  ];
  return {
    ...work,
    statuses,
    actions,
    statusPanels: [
      ...statusPanels(work),
      { id: id(), name: '캐릭터 만들기', statusIds: [], template: '', blocks },
    ],
  };
}
