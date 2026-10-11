// Test-only legacy sample; never imported by application code.
import type { Work } from '../../src/domain/types';

export function populateGarden(w: Work): Work {
  w.id = 'example-garden';
  w.version = 1;
  w.title = '정원 앞에서';
  w.cover = '/artwork.png';
  w.description =
    '낯선 저택, 닫힌 서고, 그리고 당신을 기다리던 안내인.\n서두르지 않아도 괜찮습니다. 이야기는 대화에서 시작되니까요.';
  w.prompt =
    '고요한 저택의 정원과 서고를 탐험하는 이야기. 약속과 신뢰를 중요하게 다룬다. 무리한 시간 이동 없이 현재 장면을 이어간다.';
  w.characters = [
    {
      id: 'aria',
      name: '아리아',
      role: 'main',
      image: '/artwork.png',
      trigger: '',
      prompt: '차분하고 예의 바른 저택의 안내인. 처음에는 경계하지만 호의를 받으면 마음을 연다.',
      lore: [],
      group: '저택 관리인',
    },
    {
      id: 'sera',
      name: '세라',
      role: 'supporting',
      image: '',
      trigger: '서고에 들어오면 만날 수 있는 사서.',
      prompt: '기록과 약속을 중요하게 생각하는 사서. 짧고 정확한 문장으로 말한다.',
      lore: [],
      group: '저택 관리인',
    },
  ];
  w.openings = [
    {
      id: 'start',
      name: '저택의 문 앞',
      body: '*비가 갠 오후, 담장 너머에서 젖은 잎의 향기가 밀려온다. 닫혀 있던 철문 앞에 한 사람이 서 있다.*\n\n@아리아: 기다리고 있었습니다. 길을 잃으신 건가요, 아니면… 이곳을 찾아오신 건가요?\n\n*아리아는 손에 쥔 작은 열쇠를 주머니에 넣는다. 문틈 사이로 오래된 정원과 불이 켜진 서고가 보인다.*',
      suggestions: [
        '이곳은 어떤 곳인가요?',
        '정원을 둘러보고 싶어요.',
        '저 열쇠는 어디에 쓰는 건가요?',
      ],
      bgm: '',
      presence: ['aria'],
    },
  ];
  w.statuses = [
    {
      id: 'affinity',
      name: '아리아 호감도',
      type: 'number',
      initial: 10,
      min: 0,
      max: 100,
      unit: '',
      options: [],
      prompt: '배려하는 대화에 +1~3, 모욕에 -1~3.',
    },
    {
      id: 'gold',
      name: '골드',
      type: 'number',
      initial: 100,
      min: 0,
      max: 99999,
      unit: 'G',
      options: [],
      prompt: '확정된 보상과 지출만 변경.',
    },
    {
      id: 'power',
      name: '공격력',
      type: 'number',
      initial: 5,
      min: 0,
      max: 9999,
      unit: '',
      options: [],
      prompt: '강화 보너스는 코드가 계산.',
    },
    {
      id: 'place',
      name: '현재 장소',
      type: 'choice',
      initial: '문 앞',
      min: 0,
      max: 100,
      unit: '',
      options: ['문 앞', '정원', '서고'],
      prompt: '실제로 이동한 경우 변경.',
    },
  ];
  w.items = [
    {
      id: 'key',
      name: '서고 열쇠',
      image: '',
      owned: false,
      prompt: '아리아가 신뢰하게 되었을 때 얻는다.',
      enhancement: null,
    },
    {
      id: 'sword',
      name: '수련검',
      image: '',
      owned: true,
      prompt: '연습용 검.',
      enhancement: {
        currency: 'gold',
        target: 'power',
        costBase: 10,
        costStep: 10,
        gainBase: 10,
        gainStep: 10,
        probabilities: [
          1, 1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1, 0.08, 0.05, 0.03,
          0.02, 0.01, 0.005,
        ],
        keepWeight: 7,
        resetWeight: 3,
      },
    },
  ];
  w.relations = [{ id: 'aria-user', from: 'aria', to: 'user', label: '낯선 방문객' }];
  w.chapters = [
    {
      id: 'archive',
      name: '서고의 문',
      type: 'chapter',
      from: 'start',
      mode: 'all',
      conditions: [{ id: 'cond-1', kind: 'number', ref: 'affinity', op: 'gte', value: 16 }],
      prologue: '*아리아가 서고의 문을 연다. 먼지 낀 책장 사이에서 세라가 고개를 든다.*',
      prompt: '서고 안으로 이어지는 이야기. 세라와 기록에 대해 대화할 수 있다.',
      afterstory: true,
    },
    {
      id: 'end',
      name: '다시 만날 약속',
      type: 'ending',
      from: 'archive',
      mode: 'all',
      conditions: [],
      prologue:
        '*해가 저문다. 저택을 떠나는 길, 뒤에서 내일도 문을 열어 두겠다는 인사가 들려온다.*',
      prompt: '',
      afterstory: true,
    },
  ];
  w.personas = [{ id: 'visitor', name: '여행자', image: '', prompt: '저택을 처음 방문한 여행자.' }];
  w.lore = [
    {
      id: 'garden',
      name: '정원의 돌판',
      keywords: ['정원'],
      prompt: '정원 한가운데에는 방문객들이 약속을 새겨 두는 작은 돌판이 있다.',
    },
  ];
  w.guide =
    '천천히 대화하며 저택의 이야기를 알아가세요. 호감도가 쌓이면 새로운 챕터가 열립니다.\n\n**체험 모드**에서는 정해진 예제 응답으로 저장·리롤·분기를 확인할 수 있습니다. 자유로운 대화는 API 키를 연결해 시작하세요.';
  return w;
}
