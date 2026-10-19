import { acceptsImages } from '../domain/creatorAttachments';
import { useState } from 'react';
import { Search, Brain, Check } from 'lucide-react';
import type { Model } from '../domain/types';
import { CREATIVITY } from '../domain/types';
import { demoModel, reasoningFor, reasoningSupported } from '../engine/openrouter';
import { Modal, Button, Empty } from './UI';
export function CreativitySlider({
  value,
  onChange,
  model,
}: {
  value: number;
  onChange: (v: number) => void;
  model: Model;
}) {
  const setting = reasoningFor(model, value);
  return (
    <div className="creativity">
      <div className="creativity-heading">
        <span>
          <Brain size={16} /> 창의성
        </span>
        <strong>{CREATIVITY[value]}</strong>
      </div>
      <input
        aria-label="창의성"
        aria-valuetext={CREATIVITY[value]}
        type="range"
        min="0"
        max="4"
        step="1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--range-progress': `${value * 25}%` } as React.CSSProperties}
      />
      <div className="range-labels">
        {CREATIVITY.map((label, i) => (
          <button key={label} className={i === value ? 'active' : ''} onClick={() => onChange(i)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted">
        사고 토큰을 조절합니다. 높을수록 응답 시간과 사용량이 늘어날 수 있습니다.
      </p>
      {model.id !== 'demo' && (
        <small>
          모델 적용값:{' '}
          {setting?.max_tokens
            ? `${setting.max_tokens.toLocaleString()} 사고 토큰`
            : setting?.effort}
          . 모델이 지원하는 단계에 맞춰 적용됩니다.
        </small>
      )}
    </div>
  );
}
export function ModelPicker({
  models,
  modelId,
  creativity,
  onSelect,
  onClose,
  loading,
  onRefresh,
  imageInput = false,
}: {
  models: Model[];
  modelId: string;
  creativity: number;
  onSelect: (m: string, level: number) => void;
  onClose: () => void;
  loading?: boolean;
  onRefresh: () => void;
  imageInput?: boolean;
}) {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState(modelId);
  const [level, setLevel] = useState(creativity);
  const all = [demoModel, ...models];
  const current = all.find((m) => m.id === chosen);
  return (
    <Modal title="대화 모델" onClose={onClose} className="model-modal">
      <div className="search">
        <Search size={16} />
        <input
          aria-label="모델 검색"
          placeholder="모델 이름 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <>{imageInput && <p className="muted">사진을 읽을 수 있는 모델을 표시합니다.</p>}</>
      <div className="model-list">
        {all
          .filter((m) => !imageInput || m.id === 'demo' || acceptsImages(m))
          .filter((m) => `${m.name} ${m.id}`.toLowerCase().includes(q.toLowerCase()))
          .map((m) => (
            <button
              key={m.id}
              className={m.id === chosen ? 'active' : ''}
              onClick={() => setChosen(m.id)}
            >
              <span>
                {m.name}
                <small>
                  {m.id === 'demo'
                    ? '저장·리롤·분기를 먼저 체험하세요'
                    : `${m.id} · ${(m.context_length / 1000).toFixed(0)}k 컨텍스트`}
                </small>
              </span>
              {m.id === chosen && <Check size={17} />}
            </button>
          ))}
        {loading && <p className="muted">모델 목록을 불러오는 중…</p>}
        {models.length === 0 && !loading && (
          <Empty>
            <Button onClick={onRefresh}>OpenRouter 모델 불러오기</Button>
          </Empty>
        )}
      </div>
      {current && reasoningSupported(current) && (
        <CreativitySlider value={level} onChange={setLevel} model={current} />
      )}
      <Button
        className="primary full"
        disabled={!current || (imageInput && current.id !== 'demo' && !acceptsImages(current))}
        onClick={() => {
          onSelect(chosen, level);
          onClose();
        }}
      >
        선택 완료
      </Button>
    </Modal>
  );
}
