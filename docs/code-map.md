# XenoTale 코드 읽기 지도

앱의 구조를 공부하거나 특정 기능을 고칠 때 시작할 파일을 찾기 위한 문서입니다.
기능과 디자인을 유지하면서 제작 화면, 대화 저장 처리, 공통 입력 카드 스타일을 정리했습니다.
서버와 별도의 전역 상태 관리 도구는 사용하지 않습니다. 파일 압축과 HTML 표시에
zip.js·DOMPurify·rehype-raw를, 가져온 Risu Lua 실행에 Wasmoon을 사용합니다.
HTML 표시와 Risu 실행 코드는 필요한 화면에서 불러옵니다.

## 먼저 알아둘 네 가지 영역

| 폴더          | 역할                            | 예시                                      |
| ------------- | ------------------------------- | ----------------------------------------- |
| `features`    | 화면과 사용자의 조작            | 아이템 입력란, 대화 전송 버튼             |
| `domain`      | 작품과 대화의 규칙, 데이터 타입 | 강화 결과 계산, 관계 변경, 응답 후보 선택 |
| `engine`      | AI에 보낼 내용과 AI 요청        | 프롬프트 조립, OpenRouter 호출, 기억 요약 |
| `persistence` | 브라우저 저장과 파일 처리       | IndexedDB, 자동저장, 백업과 가져오기      |

화면이 규칙을 바꾸거나 저장소를 직접 덮어쓰는 코드를 새로 만들기보다,
기존 `domain` 함수와 `persistence` 함수를 호출하는 방식으로 이어가는 것이 좋습니다.
화면에 보이는 내용을 바꾸는 일과 데이터의 의미를 바꾸는 일을 구분하면 추적하기 쉽습니다.

## 사이트가 열리는 순서

1. [`src/main.tsx`](../src/main.tsx)가 React를 시작하고 공통 스타일을 불러옵니다.
2. [`src/app/App.tsx`](../src/app/App.tsx)가 IndexedDB와 API 키를 준비합니다.
3. [`src/app/navigation.ts`](../src/app/navigation.ts)가 주소의 `#/...` 부분을 읽습니다.
4. `App.tsx`가 그 주소에 맞는 메인·제작·대화·마이페이지 화면을 보여줍니다.

예를 들어 `#/create/작업공간ID`는 제작 화면, `#/chat/대화방ID`는 대화 화면입니다.
섹션 선택이나 입력값이 어디에 저장되는지는 주소만으로 결정되지 않습니다.
작품 데이터는 IndexedDB, 관계도 위치 같은 화면 설정은 해당 화면의 저장 로직을 확인해야 합니다.

## 제작 화면을 고치려면

[`src/features/Editor.tsx`](../src/features/Editor.tsx)는 제작 화면 전체의 틀입니다.
작업 공간 불러오기, 자동저장, 섹션 이동, 사이드바, 테스트 플레이를 연결합니다.

[`src/features/EditorPanels.tsx`](../src/features/EditorPanels.tsx)는 현재 섹션에 맞는 입력 화면을 고릅니다.
과거 약 1,600줄에 섞여 있던 섹션 내용을 아래 파일로 옮겼습니다.

| 바꾸려는 내용                           | 파일                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 섹션 이름과 순서                        | [`creator/sections.ts`](../src/features/creator/sections.ts)                                                                                                                         |
| 작품 개요·시스템 프롬프트               | [`creator/OverviewSection.tsx`](../src/features/creator/OverviewSection.tsx)                                                                                                         |
| 등장 캐릭터                             | [`creator/CharactersSection.tsx`](../src/features/creator/CharactersSection.tsx)                                                                                                     |
| 도입부                                  | [`creator/OpeningsSection.tsx`](../src/features/creator/OpeningsSection.tsx)                                                                                                         |
| 상태값·상태 규칙·여러 상태창            | [`creator/StatusSection.tsx`](../src/features/creator/StatusSection.tsx), [`creator/StatusPanelsEditor.tsx`](../src/features/creator/StatusPanelsEditor.tsx)                         |
| 조건별 게임 화면·선택 버튼              | [`creator/GameBlocksEditor.tsx`](../src/features/creator/GameBlocksEditor.tsx), [`GamePanels.tsx`](../src/components/GamePanels.tsx), [`gamePanels.ts`](../src/domain/gamePanels.ts) |
| 제작 메뉴·기본 요소·접힌 고급설정       | [`creator/CreatorSectionList.tsx`](../src/features/creator/CreatorSectionList.tsx)                                                                                                   |
| 관계도 사용·내면 해금 조건              | [`creator/RelationsSection.tsx`](../src/features/creator/RelationsSection.tsx), [`creator/ConditionEditor.tsx`](../src/features/creator/ConditionEditor.tsx)                         |
| 아이템과 강화 입력 화면                 | [`creator/ItemsSection.tsx`](../src/features/creator/ItemsSection.tsx)                                                                                                               |
| 행동·조건·계산 규칙                     | [`creator/ActionsSection.tsx`](../src/features/creator/ActionsSection.tsx), [`domain/actions.ts`](../src/domain/actions.ts)                                                          |
| 챕터·엔딩과 조건 입력 화면              | [`creator/ScenarioSection.tsx`](../src/features/creator/ScenarioSection.tsx)                                                                                                         |
| 단축어·수동연출·추천 페르소나           | [`creator/ExtraSections.tsx`](../src/features/creator/ExtraSections.tsx)                                                                                                             |
| 로어북 입력 카드                        | [`creator/LoreEditor.tsx`](../src/features/creator/LoreEditor.tsx)                                                                                                                   |
| 제작·대화에서 공유하는 대화 품질 설정   | [`creator/QualityEditor.tsx`](../src/features/creator/QualityEditor.tsx)                                                                                                             |
| 저장·불러오기·그룹화·연출 미리보기 모달 | [`creator/CreatorPanelDialogs.tsx`](../src/features/creator/CreatorPanelDialogs.tsx)                                                                                                 |
| 미디어 입력 화면                        | [`CreatorExtras.tsx`](../src/features/CreatorExtras.tsx)의 `MediaEditor`                                                                                                             |
| 관계도·시나리오 지도                    | [`Graphs.tsx`](../src/features/Graphs.tsx)                                                                                                                                           |

짧은 섹션까지 각각 독립된 폴더나 복잡한 등록 시스템으로 만들지 않았습니다.
`ExtraSections.tsx` 안에서는 해당 이름의 함수로 바로 이동하면 됩니다.

### 행동과 가져온 Risu 작품

새 작품의 행동은 `domain/actions.ts`에서 처리하며 `domain/conditions.ts`의 공통 조건을
사용합니다. 화면은 함수를 호출하고 기존 저장 순서를 따릅니다. 별도 상태 저장소가 없습니다.

Risu 파일 읽기는 `persistence/risu.ts`, 실행은 `engine/risu/`에 모았습니다.
`client.ts → worker.ts → lua.ts`가 JSON으로만 통신하며, `cbs.ts`는 표시 문법과 정규식,
`lore.ts`는 요청에 넣을 로어북을 처리합니다. `generate.ts`는 가져온 작품의 AI 요청과
응답 후 계산을 연결합니다. 일반 작품의 AI 요청 경로는 기존대로 유지합니다.
`components/RisuText.tsx`가 원본 화면을 격리해 표시하고 `domain/risuState.ts`가 버튼 결과를
대화 기록에 반영합니다. 자세한 흐름과 한계는 [행동·Risu 실행](actions-and-risu.md)에 있습니다.

### 입력값이 저장되는 예시

아이템 이름을 수정하는 흐름은 다음과 같습니다.

```text
ItemsSection.tsx의 TextInput
  → changeItem(몇 번째 아이템인지, 바뀐 이름)
  → useCreatorPanelState.ts의 update
  → Editor.tsx의 작품 변경 처리
  → 기존 작업 공간 자동저장
  → persistence/db.ts의 IndexedDB
```

[`creator/useCreatorPanelState.ts`](../src/features/creator/useCreatorPanelState.ts)는 섹션에서 사용하는 선택 상태와 편집 함수를 모읍니다.
`work`는 현재 작품, `update`는 작품 일부 변경, `changeItem`은 특정 아이템 변경입니다.
캐릭터 삭제 시 연결된 관계·등장 정보·미디어를 정리하는 기존 처리도 여기 있습니다.

등장 캐릭터 선택 상태는 이 훅이 보관합니다.
`Editor.tsx`는 기존처럼 `EditorPanels`에 `key={section}`을 주므로,
섹션을 나갔다 돌아오면 등장 캐릭터 선택는 초기화됩니다. 입력한 작품 데이터는 남습니다.
이 `key`는 React가 화면을 새로 만드는 기준입니다. 리팩터링하면서 이 기준을 바꾸지 않았습니다.
도입부와 추천 페르소나 선택은 상위 제작 화면에서 관리하며 작업공간에 저장합니다.
관계도 위치 저장과 제작 섹션 새로고침 복원도 유지합니다.

각 섹션의 `Pick<CreatorPanelState, ...>`는 그 화면이 필요한 값의 목록을 뜻합니다.
새 저장소나 복잡한 기능이 아니라 TypeScript의 타입 표기이며, 배포되는 JavaScript에는 포함되지 않습니다.

### 제작 서포터의 모델·대화·제안 저장

[`src/features/Editor.tsx`](../src/features/Editor.tsx)는 프로필에서 용도별 공통 모델을 읽고,
작업공간에서 `testCreativity`와 `assistantHistory`를 불러옵니다.
테스트 창의 창의성과 에이전트의 메시지·제안 전체·적용 여부는 작업공간마다 따로 저장합니다.
이 작업공간 값들은 작품 입력값과 같은 자동저장 순서를 사용하며, 작업공간 파일과 전체 백업에도 포함됩니다.
작품 파일에는 포함되지 않습니다. 예전 파일의 `supporterSettings`는 호환성을 위해 읽을 수 있지만,
현재 모델 선택은 아래의 공통 설정을 따릅니다.

`testRoom`에는 대화 테스트의 시작 당시 작품·페르소나와 대화·상태·연출 결과를 저장합니다.
새로고침하거나 다른 페이지에 다녀와도 이어서 볼 수 있으며, ‘현재 설정으로 다시 시작’이 이 기록을 초기화합니다.
테스트를 시작하기 전 도입부의 `{{user}}`는 현재 선택한 추천 페르소나 이름으로 표시됩니다.
테스트를 시작한 뒤에는 당시 설정을 유지하고, 다시 시작할 때 현재 설정을 반영합니다.

전송 전 입력은 공통 [`components/useMessageDraft.ts`](../src/components/useMessageDraft.ts)가
각 대화방·작업공간·에이전트/테스트별로 localStorage에 즉시 저장합니다.
채팅을 입력할 때마다 대화 전체를 IndexedDB에 다시 저장하지 않습니다.
전송 버튼을 누르면 화면의 입력을 즉시 비웁니다. 응답 완료 전까지 저장된 복사본은 유지해
도중에 새로고침해도 복원할 수 있고, 완료되면 정리합니다. 실패·중단 시에는 입력을 복원합니다.
기다리며 새로 작성한 초안은 성공·실패 어느 경우에도 덮어쓰지 않습니다.
입력 초안은 작품·백업 파일에 포함되지 않습니다.

[`src/features/Assistant.tsx`](../src/features/Assistant.tsx)는 대화와 제안을 표시하고,
[`domain/creatorAssistant.ts`](../src/domain/creatorAssistant.ts)가 응답을 읽어 설명과 제안 원문을 보존합니다.
[`domain/creatorReview.ts`](../src/domain/creatorReview.ts)가 필드·목록 항목별 검증과 부분 적용을 담당합니다.
적용된 제안도 기록에 남습니다. 새 요청에는 최근 대화 10개와 마지막 미적용 제안·오류 안내를 참고자료로 전달합니다.
저장된 전체 기록을 매번 AI에 보내지는 않습니다.

응답은 [`engine/auxiliary.ts`](../src/engine/auxiliary.ts)의 `requestJson`으로 요청하고,
[`engine/jsonStream.ts`](../src/engine/jsonStream.ts)가 스트림을 읽어 설명과 수신 상태를 먼저 보여줍니다.
답변이나 제안에 오류가 있어도 원문을 기록에 남깁니다. 완성되지 않은 JSON도 원문과 형식 오류 안내를 표시하며,
그런 원문을 추측해서 작품 데이터로 바꾸지는 않습니다. 스트리밍 도중 오류가 나면 이미 받은 설명도 남깁니다.
모델의 내부 추론 내용은 화면에 표시하거나 저장하지 않습니다.

### 제작 제안의 오류 표시와 부분 적용

[`features/CreatorProposalCard.tsx`](../src/features/CreatorProposalCard.tsx)는 오류가 있는 필드나 목록 항목에
빨간 테두리와 구체적인 이유를 표시합니다. 정상 항목은 ‘적용하기’를 누를 때 함께 반영합니다.
잘못된 기존 항목의 수정안은 기존 값을 유지하고, 잘못된 새 항목은 추가하지 않습니다.
객관식 조건이 틀린 챕터는 그 챕터 전체를 제외합니다. 조건만 지우면 의도하지 않게 챕터가 열릴 수 있기 때문입니다.

검증은 기존 [`domain/engine.ts`](../src/domain/engine.ts)의 작품 규칙을 재사용합니다.
`workIssues`는 같은 검사를 오류 위치와 함께 모으고, 기존 제작 완료 검사는 계속 첫 오류를 안내합니다.
부분 적용 후보에서 잘못된 항목을 제외한 뒤 연결을 다시 검사합니다. 제외된 새 상태값을 참조하는 챕터도 제외하고,
기존 도입부가 참조하는 캐릭터를 삭제하는 변경처럼 연결을 깨뜨리는 변경은 기존 값을 유지합니다.
목록 자체의 중복 ID나 필수 항목 수 오류는 해당 목록 단위로 제외합니다.

응답 후 직접 수정한 필드는 현재 내용을 유지하며 오류 안내에 표시합니다. 다른 정상 필드는 계속 적용할 수 있습니다.
유효한 변경이 하나도 없으면 적용 버튼은 비활성화하고 이유를 표시합니다.
적용 결과와 당시 제외 안내는 `appliedIssues`에 남겨 재접속·작업공간 파일·전체 백업에도 보존합니다.
정상 부분 적용은 기존처럼 실행 취소 한 번으로 되돌릴 수 있습니다. 검증 자체에는 추가 AI 호출이 없습니다.

### 네 가지 공통 모델 선택

모델 선택은 브라우저의 프로필 한 곳에 저장합니다. 서로 다른 용도는 독립적이며,
같은 용도는 기존·새 대화방과 작업공간에서 모두 같은 모델을 사용합니다.

| 선택하는 화면               | 프로필의 저장 필드  | 적용 범위                    |
| --------------------------- | ------------------- | ---------------------------- |
| 대화방 입력창               | `defaultModel`      | 모든 대화방의 대화           |
| 대화방 기억관리 > 요약 설정 | `summaryModel`      | 모든 대화방의 수동·자동 요약 |
| 제작 서포터 > 대화 테스트   | `creatorTestModel`  | 모든 작업공간의 대화 테스트  |
| 제작 서포터 > AI 에이전트   | `creatorAgentModel` | 모든 작업공간의 AI 에이전트  |

최초 진입 화면에서는 대화·요약 모델을 받습니다. 그때 고른 대화 모델로 두 제작 모델도 처음 설정하고,
이후에는 각 화면의 모델 선택만 해당 용도의 값을 변경합니다. API 키 관리에서는 모델 선택을 표시하지 않습니다.
프로필의 변경은 `changeProfile`로 저장하고 `useLive`로 열린 화면에도 전달합니다.
공통 선택도 전체 백업에 포함되지만, 가져오기는 기존 프로필 선택을 유지하는 현재 병합 정책을 따릅니다.

[`domain/modelSettings.ts`](../src/domain/modelSettings.ts)의 `withChatModels`는 대화방 화면과
새 요청에 현재 공통 모델을 반영합니다. 이전 대화의 체크포인트·사용량 기록을 수정하거나
모든 대화방을 일괄 저장하지 않습니다. 전송·수동 요약 직전에는 프로필을 다시 읽어 최신 선택을 확인합니다.
이미 시작한 요청은 시작 시 선택한 모델로 마무리합니다.

[`persistence/db.ts`](../src/persistence/db.ts)의 `migrateSharedModels`는 예전 데이터에서
가장 최근 갱신된 대화방의 대화·요약 모델과 작업공간의 에이전트·테스트 모델을 공통 선택으로 한 번 옮깁니다.
기존 방·작업공간의 기록이나 수정 번호는 바꾸지 않으며, 다음 새로고침부터는 사용자가 고른 공통 값을 유지합니다.

## 대화가 전송되는 순서

[`src/features/Chat.tsx`](../src/features/Chat.tsx)는 대화 화면 배치와 메뉴·입력창·모달을 담당합니다.
전송과 저장은 [`src/features/chat/useChatSession.ts`](../src/features/chat/useChatSession.ts)로 분리했습니다.

```text
Chat.tsx의 전송 버튼
  → useChatSession.ts의 send
  → App.tsx의 resolveModel: 선택한 모델 확인, 목록이 로딩 중이면 기다림
  → engine/openrouter.ts의 generate
  → 같은 파일의 buildMessages: 프롬프트 조립
  → OpenRouter 요청 또는 체험 모드 응답
  → domain/engine.ts의 addResponse: 응답과 상태 적용
  → persistence/db.ts의 commitRoom: 대화방 저장
  → Chat.tsx에 새 응답 표시
```

자동 요약이 필요한 경우 대화를 먼저 저장한 뒤 `engine/auxiliary.ts`의 요약을 수행합니다.
요약이 실패해도 이미 저장한 대화를 잃지 않는 기존 정책을 유지합니다.

`useChatSession`에서 자주 볼 함수는 다음과 같습니다.

| 함수           | 역할                                              |
| -------------- | ------------------------------------------------- |
| `send()`       | 새 답변 생성. 리롤도 같은 경로를 사용             |
| `mutate()`     | 설정이나 응답 후보 등 대화방 변경을 순서대로 저장 |
| `summarize()`  | 기억 요약과 저장                                  |
| `makeBranch()` | 특정 시점에서 새로운 대화방 생성                  |
| `cancel()`     | 진행 중인 요청 중단                               |

훅 안의 `lock`은 요청 중복 실행을 막고, `queue`는 먼저 시작한 변경의 저장을 기다리게 합니다.
`revision`은 저장된 대화방의 변경 번호입니다.
다른 탭에서 수정한 내용을 오래된 화면이 덮어쓰지 않도록 `commitRoom`에서 번호를 확인합니다.
이 처리는 화면과 분리했지만 순서와 조건을 바꾸지 않았습니다.

## 색상·글자 크기·간격을 고치려면

| 대상                                    | 먼저 볼 파일                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| 공통 색상과 디자인 값                   | [`src/ui-tokens.css`](../src/ui-tokens.css)                                  |
| 제작·마이페이지·대화방의 공통 입력 카드 | [`src/components/EditingCard.css`](../src/components/EditingCard.css)        |
| 카드 접기·헤더 구조                     | [`src/components/DisclosureCard.tsx`](../src/components/DisclosureCard.tsx)  |
| 페르소나·유저노트의 개별 구조           | `PersonaCard.tsx`, `NoteLibrary.tsx`와 각 CSS                                |
| 제작 화면 전체 배치                     | [`src/features/Editor.css`](../src/features/Editor.css)                      |
| 개별 화면·컴포넌트                      | 해당 이름의 `.css` 파일                                                      |
| 기존 공통 배치·화면 디자인 규칙         | [`src/styles.css`](../src/styles.css), [`src/design.css`](../src/design.css) |

입력 카드의 배경·제목 16px·입력/라벨 14px·설명 12px·간격은 `EditingCard.css`에서 함께 관리합니다.
이 파일은 `main.tsx`에서 화면별 스타일 뒤에 불러와 공통 정책을 적용합니다.
기존 카드 클래스 이름 `edit-card-typography`는 계속 사용합니다.

삼성인터넷 식별은 `main.tsx` 한 곳에서 합니다.
삼성인터넷 모바일에만 필요한 얇은 외곽선은 `EditingCard.css` 마지막 부분에 모았습니다.
PC/모바일 화면 폭 판별은 공통 [`useMediaQuery.ts`](../src/components/useMediaQuery.ts)를 사용합니다.

`styles.css`와 `design.css`에는 아직 여러 화면의 기존 규칙이 있습니다.
이번에는 사용되지 않는 `edit-card` 규칙과 나중 규칙에 의해 항상 덮이는 일부 선언을 제거했습니다.
화면을 바꾸기 위해 해당 파일 맨 아래에 같은 선택자를 계속 덧붙이기보다,
관련 컴포넌트와 기존 규칙을 먼저 찾고 그 위치에서 수정하는 것이 좋습니다.

## 작은 수정부터 공부하는 순서

1. 공지 내용 수정: [`src/content/notices.ts`](../src/content/notices.ts), [공지 작성 방법](notices.md).
2. 공통 입력 카드의 크기나 간격: `EditingCard.css`의 `--edit-card-...` 값.
3. 아이템 입력 라벨: `creator/ItemsSection.tsx`의 `<Field label="...">`.
4. 입력값 변경 추적: 같은 파일의 `onChange`에서 `changeItem`과 `update`를 따라가기.
5. 실제 강화 규칙: `domain/engine.ts`와 관련 테스트에서 성공·실패 처리 읽기.
6. AI 전송 추적: `Chat.tsx` → `useChatSession.ts` → `engine/openrouter.ts`.

코드에서 `onClick`은 클릭했을 때 실행할 처리이고, `onChange`는 입력값이 바뀔 때 실행할 처리입니다.
`.tsx`는 주로 화면과 그 동작, `.css`는 모양, `.ts`는 데이터와 처리 함수에 사용합니다.
다만 폴더와 실제 함수를 함께 확인해야 합니다. 확장자만으로 역할이 전부 정해지는 것은 아닙니다.

## 확인 방법과 이번 정리의 범위

```sh
npm run build
npm test
npm run test:e2e
```

빌드는 타입 오류와 사용하지 않는 import를 검사합니다.
`noUnusedLocals`를 켜서 사용하지 않는 변수가 다시 쌓이면 빌드에서 알려주게 했습니다.
기본 테스트는 데이터 규칙을, 브라우저 테스트는 실제 화면 조작을 확인합니다.
섹션 분리 후 입력값 보존과 내부 선택·미리보기 초기화가 기존과 같은지 확인하는 테스트도 추가했습니다.

전체 검사 중 첫 대화 전에 실행한 제작 테스트의 연출이 결과를 반영하지 못하는 기존 문제를 발견했습니다.
`CreatorTest.tsx`에서 현재 표시 중인 임시 대화방을 기준으로 결과 반영 가능 여부를 확인하도록 고쳤습니다.
실제 대화방이나 라이브러리에 저장하지 않는 정책은 그대로입니다.

이번 정리는 파일을 찾고 실행 흐름을 읽기 쉽게 만드는 작업입니다.
데이터 형식·프롬프트 내용·저장 정책·기존 UI 값은 유지했습니다.
새 의존성은 추가하지 않았으며, 파일을 나누는 것만으로 초기 다운로드 크기가 크게 줄어드는 것은 아닙니다.
초기 로딩용 코드 분할은 CSS 적용 순서까지 함께 확인해야 하는 별도의 성능 작업입니다.

### 2026-10-12 검증 결과

- TypeScript 검사와 배포 빌드 통과.
- 기본 테스트 148개, 브라우저 테스트 193개 통과.
- 같은 데이터로 비교한 PC 1440px·모바일 393px의 주요 화면 34개는 화면 배치·글자·색상과 스크린샷이 동일.
- 사용하지 않는 카드 CSS 규칙 15개, 항상 덮이는 선언 3개와 사용하지 않는 import 제거.

## 작품 파일과 표시 규칙

- [`persistence/package.ts`](../src/persistence/package.ts): .xeno ZIP 입출력과 무결성 확인.
- [`persistence/risu.ts`](../src/persistence/risu.ts): Risu 컨테이너 읽기와 작품 데이터 매핑.
- [`persistence/assets.ts`](../src/persistence/assets.ts): 이미지 바이트·해시·화면 URL 관리.
- [`features/LocalMedia.tsx`](../src/features/LocalMedia.tsx): 이미지 업로드와 사용량.
- [`components/DisplayText.tsx`](../src/components/DisplayText.tsx): Worker를 통한 화면 정규식 치환.
- [`components/HtmlContent.tsx`](../src/components/HtmlContent.tsx): HTML 정제와 격리 표시.
- [`app/pwa.tsx`](../src/app/pwa.tsx): 웹앱 설치 안내와 파일 실행 연결.

지원 범위와 예시 파일 분석은 [제작·가져오기 안내](creation-and-import.md)를 참고하세요.

## 통합 이벤트 제작

- `domain/events.ts`: 이벤트 생성·작업 순서·공유 조건 연결을 해석하는 편집 모델.
- `domain/actions.ts`: 기존 행동과 같은 데이터로 직접 실행 및 자동 이벤트를 한 체크포인트에서 처리.
- `features/creator/EventsSection.tsx`, `EventResources.tsx`: 탭 없는 통합 페이지와 문맥에 맞는 공유 요소 편집기. 원래 편집 컴포넌트를 재사용하고 Work ID 한 벌을 유지.
- `features/creator/EventEditor.tsx`, `EventGraph.tsx`, `EventParts.tsx`: 노드형/블록형이 같은 조건과 순차 작업을 편집. 노드 안에서 편집하고 화살표로 순서를 변경.
- `features/creator/useEventWorkshop.ts`, `EventAddContent.tsx`: 선택·추가·포커스 이동과 새 요소의 작업 대상 연결. 드롭다운은 선택을 유지하며 명시적인 추가 버튼만 데이터를 변경.
- `features/creator/EventConnections.tsx`: 시나리오·내면 해금 조건 원본을 참조하고 편집.
- `features/creator/EventTest.tsx`: 실제 데이터를 쓰지 않는 초기값 기반 미리보기 실행.

## 제작 서포터 첨부 입력

- `features/AssistantAddMenu.tsx`: 위로 열리는 + 메뉴, 파일 선택, 공통 지침 편집.
- `features/AssistantFiles.tsx`: 첨부 표시·드롭·파일 준비 상태. `Assistant.tsx`에서 전송/복원 수명과 연결.
- `domain/creatorAttachments.ts`: 파일 메타데이터 스키마·용량 제한·최신 자료 선택과 중복 제거.
- `persistence/creatorAttachments.ts`: 형식 확인·Word/텍스트 추출과 기존 assets에 원본 보관.
- `engine/creatorReferences.ts`: 파일 읽기·멀티모달 part 구성·PDF 처리 엔진 선택.
- `engine/auxiliary.ts`: 기존 JSON/스트리밍 요청에 선택적인 content parts와 파일 파서 옵션 추가. 다른 요약 요청은 문자열 전송 유지.
- `persistence/files.ts`: 작업공간 초안/기록 첨부와 프로필 공통 지침의 호환 가능한 선택 필드. 기존 파일 버전·DB 테이블은 그대로 사용.
