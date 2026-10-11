# XenoTale

나만의 작품과 캐릭터를 만들고 AI와 이야기를 진행하는 웹 앱입니다.

React · TypeScript · Vite · IndexedDB로 구성되어 있으며, 별도 백엔드 없이 브라우저에서 실행됩니다. 실제 AI 대화에는 사용자가 자신의 OpenRouter API 키를 입력합니다. 키 없이 먼저 둘러보기도 지원합니다.

## 주요 기능

- 작품 제작: 캐릭터, 도입부, 로어북, 상태창, 아이템, 관계도, 시나리오, 연출, 플레이가이드
- 대화: 페르소나와 유저노트, 상태와 소지품 갱신, 관계 변화, 기억 요약, 응답 후보와 대화 분기
- 개인 라이브러리와 작품 파일 공유, 전체 백업과 복원
- PC와 모바일 화면, PC 패널 크기 조절
- 공지사항 목록·분류 탭·상세 페이지 ([공지 관리 방법](docs/notices.md))

## 로컬 실행

Node.js 22.12 이상이 필요합니다. Node.js 22.16에서 설치와 빌드를 확인했습니다.

```sh
npm ci
npm run dev
```

기본 주소는 `http://127.0.0.1:5173/`입니다.

배포용 빌드와 테스트:

```sh
npm run build
npm test
```

빌드 결과는 `dist/`에 생성됩니다. `npm run preview`로 빌드한 앱을 확인할 수 있습니다. 브라우저 테스트는 `npm run test:e2e`로 실행하며, 기본 설정은 Microsoft Edge를 사용합니다.

## Vercel 배포

1. Vercel에 GitHub 계정으로 로그인합니다.
2. New Project에서 `nameisnoting/XenoTale` 저장소를 Import합니다.
3. 프로젝트 루트는 `./`, Framework Preset은 Vite를 사용합니다.
4. Deploy를 누릅니다.

`vercel.json`에 설치 명령 `npm ci`, 빌드 명령 `npm run build`, 결과 폴더 `dist`가 지정되어 있습니다. 현재 구조에서는 서버 환경변수에 API 키를 등록할 필요가 없습니다.

앱은 `/#/profile`, `/#/chat/...` 형태의 해시 경로를 사용하므로 페이지 경로를 위한 별도 서버 재작성 규칙은 필요하지 않습니다.

## 데이터와 API 키

작품, 대화, 개인 설정은 각 사용자의 브라우저 IndexedDB에 저장됩니다. 로그인이나 서버 동기화 기능은 제공하지 않습니다. 사이트 주소나 브라우저가 달라지면 별도의 저장소를 사용합니다. 로컬 앱에서 배포 사이트로 이동할 때는 전체 백업을 내려받아 새 사이트에서 가져오세요.

전체 백업 가져오기는 기존 데이터를 유지하고 복사본을 추가합니다. 자동 덮어쓰기가 아닙니다. 친구에게 작품을 전달할 때는 작품 파일을 내보내 공유할 수 있습니다.

API 키는 AES-GCM으로 암호화되어 브라우저에 저장되고 새로고침 후 자동 복원됩니다. 같은 브라우저의 앱 코드가 키를 사용할 수 있는 구조입니다. 전체 백업에서 API 키 포함을 선택하면 키가 백업 파일에 평문으로 포함되므로 파일 공유 시 주의하세요. 작품 파일에는 API 키가 포함되지 않습니다.

이 저장소에는 사용자 백업, 실제 API 키, 브라우저의 개인 작품·대화 데이터가 포함되지 않습니다.

## 코드 구조

파일별 역할과 제작·대화·저장의 실행 흐름은 [코드 읽기 지도](docs/code-map.md)를 참고하세요.

```text
src/domain/       작품·대화 타입과 상태 처리
src/persistence/  IndexedDB, 파일 검증, 백업과 복원
src/engine/       OpenRouter 요청, 프롬프트, 기억 요약
src/features/     작품 라이브러리, 제작기, 대화방, 마이페이지
src/content/      공지사항, 개발자 캐러셀 표시 설정
src/components/   공통 UI
public/           정적 이미지와 아이콘
e2e/              브라우저 테스트
tests/fixtures/   배포에 포함되지 않는 테스트용 작품
```

## 라이선스

앱 코드는 [MIT License](LICENSE)로 제공됩니다. 저작권 표시는 `Copyright (c) 2026 SLFF`입니다.

사용한 라이브러리, 글꼴 및 타사 자산에는 각각의 라이선스가 적용됩니다. Pretendard 글꼴의 라이선스는 [docs/Pretendard-LICENSE.txt](docs/Pretendard-LICENSE.txt)를 참고하세요.

개발자: [nameisnoting](https://github.com/nameisnoting)
