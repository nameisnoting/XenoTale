import type { RisuCommand } from './types';
const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
type Node = string | { test: string; yes: Node[]; no: Node[] };
/** Balanced CBS subset used by cards; unknown expressions stay visible instead of being discarded. */
export function cbs(text: string, context: RisuCommand): string {
  if (text.length > 2_000_000) throw new Error('표시 내용이 너무 큽니다.');
  let at = 0,
    count = 0;
  function parse(depth = 0): { nodes: Node[]; stop: string } {
    if (depth > 40) throw new Error('CBS 조건이 너무 깊습니다.');
    const nodes: Node[] = [];
    while (at < text.length) {
      const start = text.indexOf('{{', at);
      if (start < 0) {
        nodes.push(text.slice(at));
        at = text.length;
        break;
      }
      nodes.push(text.slice(at, start));
      let end = start + 2,
        level = 1;
      while (end < text.length && level) {
        if (text.startsWith('{{', end)) {
          level++;
          end += 2;
        } else if (text.startsWith('}}', end)) {
          level--;
          end += 2;
        } else end++;
      }
      if (level) {
        nodes.push(text.slice(start));
        at = text.length;
        break;
      }
      if (++count > 20000) throw new Error('CBS 구문이 너무 많습니다.');
      const token = text.slice(start + 2, end - 2);
      at = end;
      if (token === ':else' || token === '/when' || token === '/if') return { nodes, stop: token };
      if (token.startsWith('#when::') || token.startsWith('#if::')) {
        const yes = parse(depth + 1),
          no = yes.stop === ':else' ? parse(depth + 1).nodes : [];
        nodes.push({ test: token.slice(token.indexOf('::') + 2), yes: yes.nodes, no });
      } else nodes.push('{{' + token + '}}');
    }
    return { nodes, stop: '' };
  }
  const truth = (s: string) => !['', '0', 'false', 'null', 'undefined'].includes(s.toLowerCase());
  function inline(source: string): string {
    let last = '';
    for (let n = 0; n < 12 && last !== source; n++) {
      last = source;
      source = source.replace(/\{\{([^{}]*)\}\}/g, (whole, token: string) => {
        const [name, ...args] = token.split('::');
        if (name === 'user') return context.user;
        if (name === 'char') return context.character;
        if (name === 'chat_index' || name === 'messageid') return String(context.index ?? -1);
        if (name === 'lastmessageid') return String(context.chats.length - 1);
        if (name === 'getvar') return context.state?.[args[0]] ?? 'null';
        if (name === 'button')
          return `<button data-risu-trigger="${escape(args[1] ?? '')}">${args[0] ?? ''}</button>`;
        if (name === '//') return '';
        return whole;
      });
    }
    return source;
  }
  function render(nodes: Node[]): string {
    return nodes
      .map((node) => {
        if (typeof node === 'string') return inline(node);
        const args = inline(node.test).split('::');
        let on = false;
        if (args.length === 1) on = truth(args[0]);
        else if (args[0] === 'not') on = !truth(args[1]);
        else {
          const [a, op, b] = args;
          on =
            op === 'is'
              ? a === b
              : op === 'isnot'
                ? a !== b
                : op === 'and'
                  ? truth(a) && truth(b)
                  : op === 'or'
                    ? truth(a) || truth(b)
                    : op === '>'
                      ? Number(a) > Number(b)
                      : op === '<'
                        ? Number(a) < Number(b)
                        : op === '>='
                          ? Number(a) >= Number(b)
                          : op === '<='
                            ? Number(a) <= Number(b)
                            : false;
        }
        return render(on ? node.yes : node.no);
      })
      .join('');
  }
  return render(parse().nodes);
}
export function applyRisuRules(text: string, command: RisuCommand, type: string) {
  for (const rule of command.config.rules) {
    if (rule.type !== type || !rule.pattern) continue;
    const pattern = rule.cbs ? cbs(rule.pattern, command) : rule.pattern;
    const flags =
      [...new Set(rule.flags.replace(/<[^>]*>/g, '').replace(/[^gimsuy]/g, ''))].join('') || 'g';
    text = text.replace(
      new RegExp(pattern, flags),
      rule.replacement.replaceAll('$n', '\n').replaceAll('{{data}}', '$&'),
    );
    text = cbs(text, command);
    if (text.length > 2_000_000) throw new Error('정규식 결과가 너무 큽니다.');
  }
  return text;
}
