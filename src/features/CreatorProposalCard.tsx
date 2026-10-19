import type { Work } from '../domain/types';
import { creatorPreview, creatorSections, type CreatorMessage } from '../domain/creatorAssistant';
import { reviewCreatorProposal, type CreatorIssue } from '../domain/creatorReview';
import { Button } from '../components/UI';
import { useMemo } from 'react';

const labels: Record<string, string> = {
  title: '제목',
  description: '작품 설명',
  cover: '표지',
  prompt: '프롬프트',
  systemMode: '시스템 프롬프트 설정',
  customSystem: '시스템 프롬프트',
  quality: '대화 품질',
  lore: '로어북',
  characters: '등장 캐릭터',
  characterGroups: '캐릭터 그룹',
  openings: '도입부',
  media: '미디어',
  relations: '관계',
  relationPositions: '관계도 위치',
  relationSplit: '관계도 표시',
  relationNodeIds: '관계도 인물',
  statuses: '상태값',
  statusTemplate: '상태창 템플릿',
  statusPanels: '상태창',
  actions: '이벤트',
  items: '아이템',
  chapters: '챕터·엔딩',
  shortcuts: '단축어',
  effects: '연출',
  personas: '추천 페르소나',
  guide: '플레이가이드',
};
function Problems({ issues }: { issues: CreatorIssue[] }) {
  return (
    issues.length > 0 && (
      <ul className="proposal-errors">
        {issues.map((issue, index) => (
          <li key={index}>{issue.message}</li>
        ))}
      </ul>
    )
  );
}
export function CreatorProposalCard({
  message,
  work,
  busy,
  onApply,
}: {
  message: CreatorMessage;
  work: Work;
  busy: boolean;
  onApply: () => void;
}) {
  const proposal = message.proposal!;
  const review = useMemo(
    () => (message.applied ? null : reviewCreatorProposal(work, proposal)),
    [message.applied, proposal, work],
  );
  const issues = message.appliedIssues ?? review?.issues ?? proposal.issues ?? [];
  const problems = (field: string, sectionIndex: number, index?: number) =>
    issues.filter(
      (issue) =>
        issue.field === field &&
        (issue.sectionIndex === undefined || issue.sectionIndex === sectionIndex) &&
        (issue.index === undefined || issue.index === index),
    );
  return (
    <section className="support-proposal" aria-label="변경 제안">
      <h4>변경 제안</h4>
      {proposal.sections.map((section, sectionIndex) => {
        const sectionIssues = issues.filter(
          (issue) => issue.sectionIndex === sectionIndex && !issue.field,
        );
        const sectionHasIssues =
          sectionIssues.length > 0 ||
          [
            ...Object.keys(section.replacement),
            ...(creatorSections.find((s) => s.id === section.id)?.fields ?? []),
          ].some((field) =>
            issues.some(
              (issue) =>
                issue.field === field &&
                (issue.sectionIndex === undefined || issue.sectionIndex === sectionIndex),
            ),
          );
        return (
          <details
            key={`${section.id}.${sectionIndex}`}
            className={sectionIssues.length ? 'proposal-section-invalid' : ''}
          >
            <summary>
              {section.name}
              {sectionHasIssues && <span className="proposal-warning-label"> · 일부 제외</span>}
            </summary>
            <p>{section.reason}</p>
            <Problems issues={sectionIssues} />
            {Object.entries(section.replacement).map(([field, value]) => {
              const fieldIssues = problems(field, sectionIndex);
              const entries =
                Array.isArray(value) &&
                value.length &&
                [
                  'lore',
                  'characters',
                  'characterGroups',
                  'openings',
                  'relations',
                  'statuses',
                  'statusPanels',
                  'actions',
                  'items',
                  'chapters',
                  'shortcuts',
                  'effects',
                  'personas',
                ].includes(field)
                  ? value
                  : null;
              return (
                <div
                  className={`proposal-field ${fieldIssues.length ? 'proposal-invalid' : ''}`}
                  key={field}
                >
                  <strong>{labels[field] ?? field}</strong>
                  <Problems issues={fieldIssues} />
                  {entries ? (
                    entries.map((item, index) => {
                      const itemIssues = issues.filter(
                        (issue) =>
                          issue.field === field &&
                          issue.index === index &&
                          (issue.sectionIndex === undefined || issue.sectionIndex === sectionIndex),
                      );
                      return (
                        <div
                          className={`proposal-item ${itemIssues.length ? 'proposal-invalid' : ''}`}
                          key={index}
                        >
                          <strong>
                            {(item && typeof item.name === 'string' && item.name) ||
                              `${labels[field] ?? field} ${index + 1}`}
                          </strong>
                          <Problems issues={itemIssues} />
                          <pre>{creatorPreview(item)}</pre>
                        </div>
                      );
                    })
                  ) : (
                    <pre>{creatorPreview(value)}</pre>
                  )}
                </div>
              );
            })}
            {/* Missing fields have no raw value to render, but their rejection must remain visible. */}
            {issues
              .filter(
                (issue) =>
                  issue.field &&
                  !Object.hasOwn(section.replacement, issue.field) &&
                  creatorSections
                    .find((s) => s.id === section.id)
                    ?.fields.some((field) => field === issue.field),
              )
              .map((issue, index) => (
                <div className="proposal-field proposal-invalid" key={`missing.${index}`}>
                  <strong>{labels[issue.field!] ?? issue.field}</strong>
                  <Problems issues={[issue]} />
                </div>
              ))}
          </details>
        );
      })}
      <p className="muted">
        {message.applied
          ? issues.length
            ? '오류 표시된 부분을 제외하고 적용했습니다. 제외된 기존 항목은 유지됩니다.'
            : '작품에 적용한 제안입니다.'
          : issues.length
            ? '오류 표시된 필드·항목은 제외하고 적용합니다. 제외된 기존 항목은 유지되고, 새 항목은 추가하지 않습니다.'
            : '적용하면 위 항목이 함께 변경됩니다.'}
      </p>
      {!message.applied && !review?.applicable && (
        <p className="muted">
          적용할 수 있는 변경이 없습니다. 오류 안내를 참고해 수정 요청해 주세요.
        </p>
      )}
      <Button
        className="primary full"
        disabled={busy || message.applied || !review?.applicable}
        onClick={onApply}
      >
        {message.applied ? '적용 완료' : '적용하기'}
      </Button>
    </section>
  );
}
