import type { CodeValidation, Work } from './types';

export const CODE_POLICY = 1;
export const CHAT_SLOTS = ['header', 'workspace', 'conversation', 'composer', 'log'] as const;
export type ChatSlot = (typeof CHAT_SLOTS)[number];
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

export const DEFAULT_CHAT_UI = `<!-- XenoTale 대화방 UI: HTML / CSS / JavaScript
다섯 data-xenotale-slot 영역에 실제 앱 컴포넌트가 연결됩니다.
전송·저장·모델·리롤·분기·사이드메뉴는 앱이 처리합니다.
각 영역의 위치와 크기, 배경, 장식과 아래 native-style을 자유롭게 편집하세요.
XenoTale.context.uiType은 novel 또는 visual-novel입니다.
외부 통신·앱 저장소·부모 화면 접근은 허용되지 않습니다. -->
<style>
html,body { margin:0; height:100%; background:#222; color:#fff; }
.layout { height:100vh; display:grid; grid-template-columns:340px minmax(300px,1fr) 340px;
 grid-template-rows:64px minmax(160px,1fr) var(--composer-height,174px); }
[data-xenotale-slot="workspace"] { grid-column:1; grid-row:1/4; }
[data-xenotale-slot="header"] { grid-column:2; grid-row:1; }
[data-xenotale-slot="conversation"] { grid-column:2; grid-row:2; }
[data-xenotale-slot="composer"] { grid-column:2; grid-row:3; }
[data-xenotale-slot="log"] { grid-column:3; grid-row:1/4; }
@media(max-width:1199px) { .layout {grid-template-columns:300px minmax(260px,1fr);}
 [data-xenotale-slot="log"] {display:none;} }
@media(max-width:800px) { .layout {grid-template-columns:1fr; grid-template-rows:60px minmax(120px,1fr) var(--composer-height,174px);}
 [data-xenotale-slot="workspace"],[data-xenotale-slot="log"] {display:none;}
 [data-xenotale-slot="header"],[data-xenotale-slot="conversation"],[data-xenotale-slot="composer"] {grid-column:1;} }
</style>
<!-- 이 스타일은 연결된 앱 컴포넌트에만 적용됩니다. 외부 URL은 사용할 수 없습니다. -->
<style data-xenotale-native-style>
.chat-header { background:#222; }
.composer { background:#292929; }
.visual-novel-textbox { background:var(--vn-box,rgba(28,28,28,.7)); }
</style>
<div class="layout">
 <section data-xenotale-slot="workspace"></section>
 <header data-xenotale-slot="header"></header>
 <main data-xenotale-slot="conversation"></main>
 <footer data-xenotale-slot="composer"></footer>
 <aside data-xenotale-slot="log"></aside>
</div>`;

export function registeredMedia(work: Work) {
  return [
    ...new Set(
      [
        work.cover,
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
  kind: 'ui' | 'effect',
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
  if (kind === 'ui') {
    const markup = source.replace(
      /<!--[^]*?-->|<(?:style|script)\b[^>]*>[^]*?<\/(?:style|script)>/gi,
      '',
    );
    for (const slot of CHAT_SLOTS) {
      const matches =
        markup.match(new RegExp(`data-xenotale-slot\\s*=\\s*["']${slot}["']`, 'g')) ?? [];
      if (matches.length !== 1) errors.push(`${slot}: 필수 대화방 영역이 하나 있어야 합니다.`);
    }
  }
  // External assets must already be registered by the creator. The UI frame sees
  // geometry and display mode only, never dialogue, prompts, credentials or storage.
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
  for (const style of source.matchAll(
    /<style\b[^>]*data-xenotale-native-style[^>]*>([\s\S]*?)<\/style>/gi,
  ))
    if (/url\s*\(|@(?:import|font-face|keyframes|property)|:host|::part|::slotted/i.test(style[1]))
      errors.push('앱 컴포넌트 스타일에는 URL·외부 폰트·전역 선언을 사용할 수 없습니다.');
  return [...new Set(errors)];
}

// Preserve older custom/approved layouts; an untouched pending template defaults OFF.
export const chatUiEnabled = (ui?: Work['chatUi']) =>
  !!ui &&
  (ui.enabled ??
    (ui.code !== DEFAULT_CHAT_UI || codeChecked(ui.code, ui.validation, ui.resources)));

export function publicationCodeProblems(work: Work) {
  const issues: string[] = [];
  const ui = work.chatUi;
  if (ui && chatUiEnabled(ui)) {
    if (!codeChecked(ui.code, ui.validation, ui.resources))
      issues.push('대화방 UI 유효성 검사를 통과해 주세요.');
    issues.push(...codeProblems(ui.code, 'ui', work, ui.resources));
  }
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
