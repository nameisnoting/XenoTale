import type { Quality } from '../../domain/types';
import { VIEWPOINTS } from '../../domain/types';
import { Field, Segmented } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';

export function QualityEditor({
  value,
  onChange,
  compact = false,
}: {
  value: Quality;
  onChange: (q: Quality) => void;
  compact?: boolean;
}) {
  const rows: { key: keyof Quality; name: string; values: string[] }[] = [
    ...(!compact
      ? [
          {
            key: 'style' as const,
            name: '문체',
            values: ['라이트노벨', '판타지', '무협', 'TRPG', '설정 안 함'],
          },
        ]
      : []),
    {
      key: 'ratio',
      name: '지문/대사 비율',
      values: ['지문 우선', '균등', '대사 우선', '자연스럽게'],
    },
    ...(!compact
      ? [
          {
            key: 'pacing' as const,
            name: '전개 속도',
            values: ['느림', '보통', '빠름', '자연스럽게'],
          },
        ]
      : []),
    { key: 'length', name: '응답 길이', values: ['짧음', '보통', '많음', '자연스럽게'] },
    { key: 'difficulty', name: '난이도', values: ['쉬움', '보통', '어려움', '억까'] },
    { key: 'events', name: '돌발 이벤트 발생 주기', values: ['적음', '보통', '빈번', '없음'] },
    ...(!compact ? [{ key: 'viewpoint' as const, name: '서술 시점', values: VIEWPOINTS }] : []),
  ];
  return (
    <div className="quality-editor">
      {rows.map((r) => (
        <Field key={r.key} label={r.name}>
          {compact ? (
            <RadioOptions
              value={value[r.key] ?? ''}
              values={r.values}
              onChange={(v) => onChange({ ...value, [r.key]: v })}
            />
          ) : (
            <Segmented
              value={value[r.key] ?? ''}
              values={r.values}
              onChange={(v) => onChange({ ...value, [r.key]: v })}
            />
          )}
        </Field>
      ))}
    </div>
  );
}
