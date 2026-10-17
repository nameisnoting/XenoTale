import type { CodeValidation, Work } from './types';

export const CODE_POLICY = 1;
// This is a validation cache, never a security signature. The runtime stays
// isolated and publication checks the source again even with a matching stamp.
export function codeFingerprint(source: string) {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < source.length; i++) {
    a = Math.imul(a ^ source.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ source.charCodeAt(i);
  }
  return `${source.length}:${a >>> 0}:${b >>> 0}`;
}
export const codeChecked = (code: string, validation?: CodeValidation, resources: string[] = []) =>
  validation?.policy === CODE_POLICY &&
  validation.fingerprint === codeFingerprint(code + JSON.stringify(resources));
export const codeApproval = (code: string, resources: string[] = []): CodeValidation => ({
  policy: CODE_POLICY,
  fingerprint: codeFingerprint(code + JSON.stringify(resources)),
});

export function registeredMedia(work: Work) {
  return [
    ...new Set(
      [
        work.cover,
        ...(work.media?.assets ?? []).map((a) => a.url),
        ...work.characters.map((c) => c.image),
        ...work.personas.map((p) => p.image),
        ...work.openings.map((o) => o.bgm),
        ...work.chapters.map((c) => c.bgm ?? ''),
      ].filter(Boolean),
    ),
  ];
}

// Scan obvious unsupported operations. Isolation and the browser policy, not this
// scan, enforce capabilities; obfuscated source never receives app references.
export function codeProblems(
  source: string,
  _kind: 'effect',
  work?: Work,
  resources: string[] = [],
): string[] {
  const errors: string[] = [];
  if (!source.trim()) return ['코드를 입력해 주세요.'];
  if (/<(?:iframe|object|embed|base|meta|form)\b/i.test(source))
    errors.push('프레임·외부 문서·폼·정책 변경 태그는 사용할 수 없습니다.');
  if (/<script\b[^>]*\bsrc\s*=/i.test(source) || /@import\b/i.test(source))
    errors.push('외부 스크립트와 스타일 불러오기는 허용되지 않습니다.');
  if (
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|eval)\s*(?:\(|\.|\[)/.test(
      source,
    ) ||
    /\b(?:parent|top|opener)\s*[.\[]|\bimport\s*\(|\bnew\s+Function\b|\bwindow\s*\.\s*open\s*\(/.test(
      source,
    )
  )
    errors.push('외부 통신·앱 저장소·상위 화면 접근 또는 동적 코드 실행이 포함되어 있습니다.');
  // External assets must already be registered. Effects receive only the public
  // play snapshot through the bridge, never app references or credentials.
  const registered = [
    ...registeredMedia(
      work ??
        ({
          cover: '',
          characters: [],
          personas: [],
          openings: [],
          chapters: [],
        } as unknown as Work),
    ),
    ...resources,
  ];
  if (resources.some((url) => !/^https:\/\/[^\s"'<>;]+$/.test(url)))
    errors.push('외부 리소스에는 HTTPS 이미지·음악 주소만 등록할 수 있습니다.');
  for (const match of source.matchAll(
    /(?:src|href|poster)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi,
  )) {
    const url = match[1] ?? match[2];
    if (/^(?:#|data:)/i.test(url)) continue;
    if (!registered.includes(url)) errors.push(`등록되지 않은 외부 리소스: ${url}`);
  }
  return [...new Set(errors)];
}

export function publicationCodeProblems(work: Work) {
  const issues: string[] = [];
  for (const effect of work.effects) {
    if (!codeChecked(effect.content, effect.validation, effect.resources))
      issues.push(`${effect.name || '연출'}: 유효성 검사를 통과해 주세요.`);
    issues.push(
      ...codeProblems(effect.content, 'effect', work, effect.resources).map(
        (issue) => `${effect.name || '연출'}: ${issue}`,
      ),
    );
  }
  return issues;
}
