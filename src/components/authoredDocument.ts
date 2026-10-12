import { CHAT_SLOTS, type ChatSlot } from '../domain/chatUi';

export type SlotRect = { x: number; y: number; width: number; height: number };
export type LayoutReport = { slots: Partial<Record<ChatSlot, SlotRect>>; errors: string[] };
export function readLayoutReport(
  raw: unknown,
  width: number,
  height: number,
  uiType = 'novel',
): LayoutReport {
  const slots: LayoutReport['slots'] = {},
    errors: string[] = [];
  if (!raw || typeof raw !== 'object')
    return { slots, errors: ['올바르지 않은 레이아웃 응답입니다.'] };
  const data = raw as Record<string, unknown>;
  if (Array.isArray(data.errors))
    errors.push(
      ...data.errors
        .filter((error): error is string => typeof error === 'string')
        .map((error) => error.slice(0, 1000))
        .slice(0, 30),
    );
  const source =
    data.slots && typeof data.slots === 'object' ? (data.slots as Record<string, unknown>) : {};
  for (const name of CHAT_SLOTS) {
    const optional = (name === 'workspace' && width <= 800) || (name === 'log' && width < 1200);
    const rect = source[name] as SlotRect | undefined;
    if (
      !rect ||
      !['x', 'y', 'width', 'height'].every(
        (key) =>
          typeof rect[key as keyof SlotRect] === 'number' &&
          Number.isFinite(rect[key as keyof SlotRect]),
      )
    ) {
      if (!optional) errors.push(name + ': 필수 영역의 위치를 확인하지 못했습니다.');
      continue;
    }
    const minimum =
      name === 'header'
        ? 48
        : name === 'composer'
          ? 160
          : name === 'workspace'
            ? 200
            : name === 'log'
              ? 160
              : uiType === 'visual-novel'
                ? 300
                : 120;
    const minWidth =
      name === 'workspace' ? 200 : name === 'log' ? 160 : name === 'header' ? 200 : 280;
    if (
      rect.x < 0 ||
      rect.y < 0 ||
      rect.width < minWidth ||
      rect.height < minimum ||
      rect.x + rect.width > width + 1 ||
      rect.y + rect.height > height + 1
    )
      errors.push(name + ': 필수 기능을 표시할 공간이 없습니다.');
    slots[name] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  const entries = Object.entries(slots);
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const [a, r] = entries[i],
        [b, s] = entries[j];
      if (
        Math.min(r.x + r.width, s.x + s.width) - Math.max(r.x, s.x) > 2 &&
        Math.min(r.y + r.height, s.y + s.height) - Math.max(r.y, s.y) > 2
      )
        errors.push(a + ' / ' + b + ': 필수 영역이 겹칩니다.');
    }
  return { slots, errors: [...new Set(errors)] };
}
const json = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');

/** The isolated document only receives display mode and geometry. */
export function authoredDocument(
  code: string,
  runId: string,
  uiType: string,
  resources: string[] = [],
) {
  const assets = resources.filter((url) => /^https:\/\/[^\s"'<>;]+$/.test(url)).join(' ');
  const bridge = `(() => {
    const runId = ${json(runId)}, errors = [], names = ${json(CHAT_SLOTS)};
    let port, queued = false, context=Object.freeze({uiType:${json(uiType)}});
    document.documentElement.dataset.uiType=context.uiType;
    window.addEventListener('error', e => { errors.push(e.message || '코드 실행 오류'); report(); });
    window.addEventListener('unhandledrejection', e => { errors.push(String(e.reason)); report(); });
    Object.defineProperty(window, 'XenoTale', {value:Object.freeze({get context(){return context;}})});
    function report() {
      if (!port || queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const slots = {}, issues = [...errors];
        for (const name of names) {
          const matches = document.querySelectorAll('[data-xenotale-slot="'+name+'"]');
          if (matches.length !== 1) { issues.push(name+': 영역이 하나 있어야 합니다.'); continue; }
          const element = matches[0], rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          const optional = (name==='workspace' && innerWidth<=800) || (name==='log' && innerWidth<1200);
          const visible = element.checkVisibility ? element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) : style.display!=='none' && style.visibility!=='hidden' && +style.opacity>0;
          if (!visible || rect.width<40 || rect.height<40) {
            if (!optional) issues.push(name+': 필수 기능을 표시할 공간이 없습니다.');
            continue;
          }
          if (rect.x<0 || rect.y<0 || rect.right>innerWidth+1 || rect.bottom>innerHeight+1) issues.push(name+': 영역이 화면 밖에 있습니다.');
          const minHeight=name==='header'?48:name==='composer'?160:name==='workspace'?200:name==='log'?160:context.uiType==='visual-novel'?300:120;
          const minWidth=name==='workspace'?200:name==='log'?160:name==='header'?200:280;
          if(rect.height<minHeight || rect.width<minWidth) issues.push(name+': 필수 기능을 표시할 공간이 부족합니다.');
          slots[name]={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
        }
        const entries=Object.entries(slots);
        for(let i=0;i<entries.length;i++) for(let j=i+1;j<entries.length;j++) {
          const [a,r]=entries[i], [b,s]=entries[j];
          if (Math.min(r.x+r.width,s.x+s.width)-Math.max(r.x,s.x)>2 && Math.min(r.y+r.height,s.y+s.height)-Math.max(r.y,s.y)>2) issues.push(a+' / '+b+': 필수 영역이 겹칩니다.');
        }
        port.postMessage({slots,errors:[...new Set(issues)].slice(0,30)});
      });
    }
    window.addEventListener('message', function init(event) {
      if(event.source!==parent || event.data?.type!=='xenotale-layout-init' || event.data?.runId!==runId || !event.ports[0] || port) return;
      port=event.ports[0];
      const metrics=data=>{
        if(typeof data?.composerHeight==='number' && Number.isFinite(data.composerHeight)) document.documentElement.style.setProperty('--composer-height',Math.max(160,Math.min(innerHeight*.5,data.composerHeight))+'px');
        if(['novel','visual-novel'].includes(data?.uiType) && data.uiType!==context.uiType) {
          context=Object.freeze({uiType:data.uiType});
          document.documentElement.dataset.uiType=context.uiType;
          document.dispatchEvent(new CustomEvent('xenotale-ui-change',{detail:context}));
        }
        report();
      };
      port.onmessage=event=>metrics(event.data);
      metrics(event.data.metrics);
      port.start(); window.removeEventListener('message',init); report();
    });
    const observe=()=>{new ResizeObserver(report).observe(document.documentElement); new MutationObserver(report).observe(document.body,{subtree:true,childList:true,attributes:true}); report();};
    document.addEventListener('DOMContentLoaded',observe);
    window.addEventListener('resize',report);
    parent.postMessage({type:'xenotale-layout-ready',runId},'*');
  })();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: ${assets || "'none'"}; media-src data: ${assets || "'none'"}; connect-src 'none'; frame-src 'none'; worker-src 'none'; font-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
<style>*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}</style><script>${bridge}</script></head><body>${code}</body></html>`;
}

// Only visual declarations can cross the iframe boundary, scoped to this room.
// Placement and function visibility remain owned by the native components.
export function nativeStyles(code: string, scope: string) {
  const doc = new DOMParser().parseFromString(code, 'text/html');
  let result = '';
  const allowed =
    /^(?:color|background(?:-[a-z-]+)?|border(?:-(?:color|style|width|radius))?|border-(?:top|right|bottom|left)(?:-(?:color|style|width))?|box-shadow|text-shadow|font-(?:size|weight|family|style)|line-height|letter-spacing|text-align|padding(?:-(?:top|right|bottom|left))?|--vn-(?:box|text))$/;
  function rules(list: CSSRuleList): string {
    return Array.from(list)
      .map((rule) => {
        if (rule instanceof CSSStyleRule) {
          // CSSOM can enumerate shorthand background as many longhands. Keep the
          // shorthand when available so var(--vn-box) keeps its original meaning.
          const names = Array.from(rule.style);
          const declarations = (
            rule.style.getPropertyValue('background')
              ? ['background', ...names.filter((name) => !name.startsWith('background'))]
              : names
          )
            .map((name) => {
              if (!allowed.test(name))
                throw new Error(
                  `앱 컴포넌트 스타일에는 ${name}을 사용할 수 없습니다. 필수 영역의 배치는 일반 style에서 변경해 주세요.`,
                );
              const value = rule.style.getPropertyValue(name);
              if (
                name === 'font-size' &&
                (!/^\d+(?:\.\d+)?px$/.test(value) ||
                  parseFloat(value) < 10 ||
                  parseFloat(value) > 40)
              )
                throw new Error('앱 글자 크기는 10~40px로 지정해 주세요.');
              if (
                name.startsWith('padding') &&
                value
                  .split(/\s+/)
                  .some((part) => !/^\d+(?:\.\d+)?(?:px)?$/.test(part) || parseFloat(part) > 32)
              )
                throw new Error('앱 컴포넌트 패딩은 0~32px로 지정해 주세요.');
              return /url\(|expression|var\(--(?:author|slot)/i.test(value)
                ? ''
                : `${name}:${value};`;
            })
            .join('');
          return rule.selectorText
            .split(',')
            .map((selector) => `${scope} ${selector.trim()}{${declarations}}`)
            .join('');
        }
        if (rule instanceof CSSMediaRule)
          return `@media ${rule.conditionText}{${rules(rule.cssRules)}}`;
        return '';
      })
      .join('');
  }
  for (const style of doc.querySelectorAll('style[data-xenotale-native-style]')) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(style.textContent ?? '');
    result += rules(sheet.cssRules);
  }
  return result;
}
