import type { Work } from '../domain/types';
import { codeProblems, registeredMedia } from '../domain/codeValidation';
import { effectDocument } from './effectDocument';
import { effectResultSchema } from '../domain/effects';
import { checkPresentation } from '../domain/presentation';

export async function inspectCode(
  code: string,
  kind: 'effect',
  work: Work,
  resources: string[] = [],
) {
  const problems = codeProblems(code, kind, work, resources);
  if (problems.length) return problems;
  if (kind === 'effect' && !/<[a-z][\s\S]*>/i.test(code)) return [];
  for (const [width, height] of [[800, 600]]) {
    const errors = await new Promise<string[]>((resolve) => {
      const frame = document.createElement('iframe');
      const runId = crypto.randomUUID();
      let port: MessagePort | undefined, settle: ReturnType<typeof setTimeout> | undefined;
      frame.sandbox.add('allow-scripts');
      frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none`;
      frame.title = '코드 유효성 검사';
      const finish = (issues: string[]) => {
        clearTimeout(timeout);
        clearTimeout(settle);
        port?.close();
        window.removeEventListener('message', init);
        frame.remove();
        resolve(issues);
      };
      const timeout = setTimeout(
        () => finish(['코드 실행 또는 필수 영역 확인 시간이 초과되었습니다.']),
        5000,
      );
      const init = (event: MessageEvent) => {
        const type = 'xenotale-effect-ready';
        if (
          event.source !== frame.contentWindow ||
          event.data?.type !== type ||
          event.data?.runId !== runId ||
          port
        )
          return;
        const channel = new MessageChannel();
        port = channel.port1;
        const errors: string[] = [];
        port.onmessage = (e) => {
          if (e.data?.type === 'diagnostic') errors.push(String(e.data.payload));
          else if (e.data?.requestId) {
            let error = '';
            try {
              if (e.data.type === 'complete') effectResultSchema.parse(e.data.payload);
              else if (e.data.type === 'presentation')
                checkPresentation(e.data.payload, work, resources);
              else if (e.data.type === 'screen') {
                if (
                  !['shake', 'glitch'].includes(e.data.payload?.name) ||
                  typeof e.data.payload?.duration !== 'number' ||
                  !Number.isFinite(e.data.payload.duration)
                )
                  throw new Error('지원하지 않는 화면 효과입니다.');
              } else throw new Error('지원하지 않는 연출 요청입니다.');
            } catch (issue) {
              error = issue instanceof Error ? issue.message : '연출 요청 오류';
              errors.push(error);
            }
            port?.postMessage({
              requestId: e.data.requestId,
              ok: !error,
              result: e.data.payload,
              error,
            });
          }
        };
        frame.contentWindow?.postMessage(
          {
            type: 'xenotale-effect-init',
            runId,
            context: {
              preview: true,
              readOnly: false,
              validation: true,
              personaName: '사용자',
              status: {},
              inventory: {},
              nodeId: '',
            },
          },
          '*',
          [channel.port2],
        );
        settle = setTimeout(() => finish(errors), 500);
        port.start();
      };
      window.addEventListener('message', init);
      frame.srcdoc = effectDocument(code, runId, [...registeredMedia(work), ...resources]);
      document.body.append(frame);
    });
    if (errors.length) return errors;
  }
  return [];
}
