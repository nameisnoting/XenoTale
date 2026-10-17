import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { DisclosureCard } from '../../components/DisclosureCard';
import { requiresDeleteConfirmation } from '../../domain/deletion';
import { SortableList } from '../../components/SortableList';
import type { Lore } from '../../domain/types';
import { id } from '../../domain/types';
import { Field, TextInput, Area, Button } from '../../components/UI';
import { KeywordInput } from '../../components/DesignControls';
import { Select } from '../../components/Select';
import { useState } from 'react';

export function LoreEditor({
  entries,
  onChange,
}: {
  entries: Lore[];
  onChange: (v: Lore[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const matching = entries.filter((l) =>
    `${l.name} ${l.group ?? ''} ${l.keywords.join(' ')}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(matching.length / 20));
  const current = Math.min(page, pages - 1);
  const visible = matching.slice(current * 20, current * 20 + 20);
  return (
    <>
      {(entries.length > 20 || query) && (
        <Field label="로어북 검색">
          <TextInput
            value={query}
            onChange={(text) => {
              setQuery(text);
              setPage(0);
            }}
            placeholder="이름·분류·키워드 검색"
          />
        </Field>
      )}
      <SortableList
        items={visible}
        itemId={(entry) => entry.id}
        itemName={(entry) => entry.name || '로어북'}
        onChange={(next) => {
          const ids = new Set(visible.map((l) => l.id));
          let index = 0;
          onChange(entries.map((l) => (ids.has(l.id) ? next[index++] : l)));
        }}
      >
        {(l, handle, i) => (
          <DisclosureCard
            className="creator-card"
            expanded
            key={l.id}
            title={l.name || `로어북 ${i + 1}`}
            leading={handle}
            actions={
              <DeleteAction
                title="로어북 삭제"
                name={l.name}
                needsConfirmation={requiresDeleteConfirmation('lore', l)}
                onDelete={() => onChange(entries.filter((x) => x.id !== l.id))}
              />
            }
          >
            <Field label="이름">
              <TextInput
                value={l.name}
                onChange={(name) =>
                  onChange(entries.map((x) => (x.id === l.id ? { ...x, name } : x)))
                }
              />
            </Field>
            {l.group && <p className="muted">분류: {l.group}</p>}
            <Field label="사용 방식">
              <Select
                label="로어북 사용 방식"
                value={l.activation ?? 'keyword'}
                options={[
                  { value: 'keyword', label: '키워드로 사용' },
                  { value: 'always', label: '항상 사용' },
                  { value: 'reference', label: '참조 자료' },
                ]}
                onChange={(activation) =>
                  onChange(
                    entries.map((x) =>
                      x.id === l.id ? { ...x, activation: activation as Lore['activation'] } : x,
                    ),
                  )
                }
              />
            </Field>
            {(!l.activation || l.activation === 'keyword') && (
              <Field label="키워드">
                <KeywordInput
                  value={l.keywords}
                  onChange={(keywords) =>
                    onChange(entries.map((x) => (x.id === l.id ? { ...x, keywords } : x)))
                  }
                />
              </Field>
            )}
            {l.activation === 'reference' && (
              <p className="muted">
                자동으로 대화에 추가하지 않는 참조 자료입니다. Risu 스크립트·조건과의 연결은 아직
                지원하지 않습니다.
              </p>
            )}
            {l.activation === 'always' && <p className="muted">모든 대화 요청에 포함됩니다.</p>}
            <Field label="프롬프트">
              <Area
                value={l.prompt}
                onChange={(prompt) =>
                  onChange(entries.map((x) => (x.id === l.id ? { ...x, prompt } : x)))
                }
              />
            </Field>
          </DisclosureCard>
        )}
      </SortableList>
      {pages > 1 && (
        <div className="pagination">
          <Button disabled={!current} onClick={() => setPage(current - 1)}>
            이전
          </Button>
          <span>
            {current + 1} / {pages} · {matching.length}개
          </span>
          <Button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
            다음
          </Button>
        </div>
      )}
      <AddButton
        onClick={() => {
          setQuery('');
          setPage(Math.floor(entries.length / 20));
          onChange([
            ...entries,
            {
              id: id(),
              name: `로어북 ${entries.length + 1}`,
              defaultName: `로어북 ${entries.length + 1}`,
              keywords: [],
              prompt: '',
            },
          ]);
        }}
      >
        로어북 추가
      </AddButton>
    </>
  );
}
