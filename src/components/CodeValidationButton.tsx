import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { CodeValidation, Work } from '../domain/types';
import { codeApproval, codeChecked } from '../domain/codeValidation';
import { inspectCode } from './inspectCode';
import { Button } from './UI';

export function CodeValidationButton({
  code,
  resources,
  validation,
  kind,
  work,
  onValidated,
}: {
  code: string;
  resources?: string[];
  validation?: CodeValidation;
  kind: 'effect';
  work: Work;
  onValidated: (validation: CodeValidation | undefined) => void;
}) {
  const latest = useRef({ code, resources, onValidated });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  latest.current = { code, resources, onValidated };
  const [pendingSource, setPendingSource] = useState<string | null>(null),
    [errors, setErrors] = useState<string[]>([]);
  const [checkedSource, setCheckedSource] = useState('');
  const source = codeApproval(code, resources).fingerprint;
  const hasCode = !!code.trim();
  const pending = pendingSource !== null;
  const checking = pendingSource === source;
  const checked = codeChecked(code, validation, resources);
  const invalid = hasCode && !checking && !checked && checkedSource === source && errors.length > 0;
  const status = !hasCode
    ? '코드 없음'
    : checking
      ? '검사 중…'
      : checked
        ? '검사 완료'
        : invalid
          ? '유효하지 않음'
          : '검사 필요';
  const inspect = async () => {
    if (!hasCode || pending) return;
    setPendingSource(source);
    setErrors([]);
    if (validation) onValidated(undefined);
    try {
      const problems = await inspectCode(code, kind, work, resources);
      if (!mounted.current) return;
      if (source !== codeApproval(latest.current.code, latest.current.resources).fingerprint)
        return;
      setCheckedSource(source);
      setErrors(problems);
      if (!problems.length) latest.current.onValidated(codeApproval(code, resources));
    } catch (error) {
      if (!mounted.current) return;
      if (source !== codeApproval(latest.current.code, latest.current.resources).fingerprint)
        return;
      setCheckedSource(source);
      setErrors([error instanceof Error ? error.message : '검사에 실패했습니다.']);
    } finally {
      if (mounted.current) setPendingSource(null);
    }
  };
  return (
    <div className="code-validation">
      <Button disabled={!hasCode || pending} onClick={() => void inspect()}>
        <ShieldCheck size={15} />
        유효성 검사
      </Button>
      <span
        className={invalid ? 'danger-text' : checked && hasCode ? 'code-validation-pass' : 'muted'}
        role="status"
      >
        {status}
      </span>
      {invalid && (
        <ul className="danger-text" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
