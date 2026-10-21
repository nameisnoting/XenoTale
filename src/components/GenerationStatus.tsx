import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const waitingMessages = [
  '맥락을 고려하고 있습니다…',
  '응답을 생성하고 있습니다…',
  '답변을 생각하고 있습니다…',
];

// Keep the reader's scroll range while a rerolled answer is temporarily hidden.
export function ResponseSection({
  pending,
  phase,
  preserveHeight,
  children,
}: {
  pending: boolean;
  phase: string;
  preserveHeight: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const height = useRef(0);
  useLayoutEffect(() => {
    if (!preserveHeight || pending || !root.current) return;
    const element = root.current;
    const measure = () => {
      height.current = element.getBoundingClientRect().height;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pending, preserveHeight]);
  return (
    <section
      ref={root}
      className="chat-message-section assistant-section"
      style={pending ? { minHeight: height.current } : undefined}
    >
      {pending ? <GenerationStatus phase={phase} /> : children}
    </section>
  );
}

export function useGenerationMessage(phase: string, active = true) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (!active) return;
    const timer = window.setInterval(() => setStep((value) => value + 1), 3000);
    return () => window.clearInterval(timer);
  }, [phase, active]);
  return step === 0
    ? phase || '답변을 생각하고 있습니다…'
    : waitingMessages[(step - 1) % waitingMessages.length];
}

export function GenerationStatus({
  phase,
  rotating = true,
}: {
  phase: string;
  rotating?: boolean;
}) {
  const message = useGenerationMessage(phase, rotating);
  return (
    <div className="generation-status" role="status" aria-live="polite">
      <span className="pulse" aria-hidden="true" />
      {rotating ? message : phase}
    </div>
  );
}
