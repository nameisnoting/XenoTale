import { SYSTEM_PROMPT, effectiveSystemPrompt } from '../../domain/systemPrompt';
import { ResetButton } from '../../components/ResetButton';
import { Field, TextInput, Area, Button, ImageUpload } from '../../components/UI';
import { ViewpointActors } from '../CreatorExtras';
import type { CreatorPanelState } from './useCreatorPanelState';
import { QualityEditor } from './QualityEditor';
import { LoreEditor } from './LoreEditor';
import { RadioOptions } from '../../components/DesignControls';

export function OverviewSection({
  work,
  onChange,
  setSaveAs,
  setSaveName,
  setLibrary,
  update,
}: Pick<
  CreatorPanelState,
  'work' | 'onChange' | 'setSaveAs' | 'setSaveName' | 'setLibrary' | 'update'
>) {
  return (
    <>
      <h2>기본 정보</h2>
      <div className="basic-info">
        <div>
          <span className="field-label">표지</span>
          <ImageUpload
            value={work.cover}
            onChange={(cover) => update({ cover })}
            label="작품 표지"
          />
        </div>
        <div>
          <Field label="제목" required>
            <TextInput
              value={work.title}
              onChange={(title) => update({ title })}
              placeholder="제목을 입력하세요"
            />
          </Field>
          <Field label="기본 UI">
            <RadioOptions
              value={work.defaultUi === 'visual-novel' ? '비주얼노벨' : '소설'}
              values={['소설', '비주얼노벨']}
              onChange={(value) =>
                update({ defaultUi: value === '소설' ? 'novel' : 'visual-novel' })
              }
            />
          </Field>
        </div>
      </div>
      <Field
        label="시스템 프롬프트"
        required
        labelAction={
          <ResetButton
            onClick={() => update({ systemMode: 'custom', customSystem: SYSTEM_PROMPT })}
          />
        }
      >
        <Area
          rows={10}
          value={effectiveSystemPrompt(work)}
          onChange={(customSystem) => update({ systemMode: 'custom', customSystem })}
        />
      </Field>
      <Field label="프롬프트" required>
        <Area
          value={work.prompt}
          onChange={(prompt) => update({ prompt })}
          rows={10}
          placeholder="세계관과 이야기의 기본 설정을 입력하세요."
        />
      </Field>
      <hr />
      <Field label="작품 설명">
        <Area
          rows={8}
          value={work.description}
          onChange={(description) => update({ description })}
          placeholder="작품에 대한 소개와 플레이 가이드를 자유롭게 입력하세요. 하이퍼링크, Markdown은 전부 렌더링됩니다."
        />
      </Field>
      <hr />
      <h2>시스템</h2>
      <QualityEditor value={work.quality} onChange={(quality) => update({ quality })} />
      <ViewpointActors work={work} onChange={onChange} />
      <hr />
      <div className="section-title">
        <h2>로어북</h2>
        <div className="inline-actions">
          <Button className="outline-gold" onClick={() => setLibrary('lore')}>
            로어북 불러오기
          </Button>
          <Button
            className="outline-gold"
            disabled={!work.lore.length}
            onClick={() => {
              setSaveName(work.title || '로어북 모음');
              setSaveAs('lore');
            }}
          >
            마이 로어북에 저장
          </Button>
        </div>
      </div>
      <LoreEditor entries={work.lore} onChange={(lore) => update({ lore })} />
    </>
  );
}
