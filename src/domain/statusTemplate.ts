import type { StatusDef, StatusPanel, Work } from './types';

type TemplateKind = 'basic' | 'markdown' | 'html';
const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const token = (status: StatusDef) => `{{${status.name || status.id}}}`;
const suffix = (status: StatusDef) =>
  `${status.type === 'number' && status.displayMax ? ` / ${status.max}` : ''}${status.unit}`;

export function statusTemplateExample(statuses: StatusDef[], kind: TemplateKind = 'basic') {
  if (!statuses.length) return '';
  if (kind === 'basic') return statuses.map(token).join('\n');
  if (kind === 'markdown')
    return [
      '```Status',
      ...statuses.map((status) => `${status.name || '상태값'}: ${token(status)}${suffix(status)}`),
      '```',
    ].join('\n');
  return [
    '<section style="padding:16px;background:#000;color:#fff;border:1px solid #838383;border-radius:5px">',
    '  <h3 style="margin:0 0 12px;font-size:14px">상태창</h3>',
    '  <dl style="display:grid;grid-template-columns:1fr auto;gap:8px 16px;margin:0;font-size:12px">',
    ...statuses.map(
      (status) =>
        `    <dt>${escapeHtml(status.name || '상태값')}</dt><dd style="margin:0;color:#5fddce">${token(status)}${escapeHtml(suffix(status))}</dd>`,
    ),
    '  </dl>',
    '</section>',
  ].join('\n');
}

// Only untouched defaults/examples follow definition edits. Authored layouts survive.
export function syncStatusTemplate(template: string, before: StatusDef[], after: StatusDef[]) {
  if (!template.trim()) return statusTemplateExample(after);
  for (const kind of ['basic', 'markdown', 'html'] as const) {
    if (template === statusTemplateExample(before, kind)) return statusTemplateExample(after, kind);
  }
  return template;
}

export function nextStatusName(statuses: StatusDef[]) {
  let number = 1;
  while (statuses.some((status) => status.name === `상태값${number}`)) number++;
  return `상태값${number}`;
}

/** Legacy templates are read as one panel, without rewriting saved works or rooms. */
export function statusPanels(work: Pick<Work, 'statusPanels' | 'statusTemplate'>): StatusPanel[] {
  return (
    work.statusPanels ?? [
      { id: 'legacy-status-panel', name: '상태창', template: work.statusTemplate },
    ]
  );
}

export function panelStatuses(panel: StatusPanel, statuses: StatusDef[]) {
  return panel.statusIds === undefined
    ? statuses
    : statuses.filter((status) => panel.statusIds!.includes(status.id));
}

export function syncStatusPanels(panels: StatusPanel[], before: StatusDef[], after: StatusDef[]) {
  return panels.map((panel) => {
    const statusIds = panel.statusIds?.filter((key) => after.some((s) => s.id === key));
    const next = { ...panel, ...(statusIds ? { statusIds } : {}) };
    return {
      ...next,
      template: syncStatusTemplate(
        panel.template,
        panelStatuses(panel, before),
        panelStatuses(next, after),
      ),
    };
  });
}
