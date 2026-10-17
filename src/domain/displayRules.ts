import type { Work } from './types';
export function displayRuleProblem(pattern: string, flags: string) {
  if (!pattern.trim()) return '찾을 정규식을 입력해 주세요.';
  if (pattern.length > 10000 || /[^gimsu]/.test(flags))
    return '정규식은 10,000자 이하, 옵션은 g·i·m·s·u만 사용할 수 있습니다.';
  try {
    new RegExp(pattern, flags);
    return '';
  } catch {
    return '정규식 문법을 확인해 주세요.';
  }
}
export function transformDisplay(text: string, rules: NonNullable<Work['displayRules']>) {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const error = displayRuleProblem(rule.pattern, rule.flags);
    if (error) throw new Error(`${rule.name}: ${error}`);
    text = text.replace(new RegExp(rule.pattern, rule.flags), rule.replacement);
    if (text.length > 2_000_000) throw new Error('자동연출 표시 결과가 너무 큽니다.');
  }
  return text;
}
