import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { CodeValidation, Work } from '../domain/types';
import { codeApproval, codeChecked } from '../domain/chatUi';
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
  kind: 'ui' | 'effect';
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
  const [pending, setPending] = useState(false),
    [errors, setErrors] = useState<string[]>([]);
  const [checkedSource, setCheckedSource] = useState('');
  const checked = codeChecked(code, validation, resources);
  const inspect = async () => {
    setPending(true);
    setErrors([]);
    const source = codeApproval(code, resources).fingerprint;
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
      setCheckedSource(source);
      setErrors([error instanceof Error ? error.message : '검사에 실패했습니다.']);
    } finally {
      if (mounted.current) setPending(false);
    }
  };
  return (
    <div className="code-validation">
      <Button disabled={pending} onClick={() => void inspect()}>
        <ShieldCheck size={15} />
        {pending ? '검사 중…' : '유효성 검사'}
      </Button>
      <span className={checked ? 'code-validation-pass' : 'muted'} role="status">
        {checked ? '검사 통과' : !pending ? '검사 필요' : ''}
      </span>
      {checkedSource === codeApproval(code, resources).fingerprint && errors.length > 0 && (
        <ul className="danger-text" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
