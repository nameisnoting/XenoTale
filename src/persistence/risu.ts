import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js';
import { emptyWork } from '../domain/defaults';
import { id } from '../domain/types';
import { makeAsset, MEDIA_LIMIT, type StoredAsset } from './assets';
import type { ImportData } from './files';

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const decode = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
const mime = (name: string) =>
  /\.webp$/i.test(name)
    ? 'image/webp'
    : /\.gif$/i.test(name)
      ? 'image/gif'
      : /\.jpe?g$/i.test(name)
        ? 'image/jpeg'
        : /\.svg$/i.test(name)
          ? 'image/svg+xml'
          : 'image/png';

export async function readRisu(file: File): Promise<ImportData> {
  if (file.size > MEDIA_LIMIT + 50 * 1024 ** 2) throw new Error('Risu 파일의 용량이 너무 큽니다.');
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const blobs = new Map<string, Blob>();
  const warnings: string[] = [];
  let card: any;
  if (head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71) {
    const bytes = new Uint8Array(await file.arrayBuffer()),
      view = new DataView(bytes.buffer);
    let offset = 8,
      encoded = '',
      v3 = '';
    const picture: BlobPart[] = [bytes.slice(0, 8)];
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset);
      const end = offset + size + 12;
      if (end > bytes.length) throw new Error('PNG 카드가 손상되었습니다.');
      const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
      if (type === 'tEXt') {
        const chunk = bytes.slice(offset + 8, end - 4);
        const zero = chunk.indexOf(0);
        if (zero >= 0) {
          const key = new TextDecoder().decode(chunk.slice(0, zero)),
            value = new TextDecoder().decode(chunk.slice(zero + 1));
          if (key === 'ccv3') v3 = value;
          else if (key === 'chara') encoded = value;
          else if (key.startsWith('chara-ext-asset_')) {
            const assetBytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
            blobs.set(
              key.replace(/^chara-ext-asset_\:?/, ''),
              new Blob([assetBytes], { type: 'image/png' }),
            );
          }
        }
      } else if (!['iTXt', 'zTXt'].includes(type)) picture.push(bytes.slice(offset, end));
      offset = end;
      if (type === 'IEND') break;
    }
    if (!(v3 || encoded)) throw new Error('이 PNG에는 Risu 캐릭터 카드가 없습니다.');
    card = JSON.parse(decode(v3 || encoded));
    blobs.set('ccdefault:', new Blob(picture, { type: 'image/png' }));
  } else {
    const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
    try {
      const entries = await reader.getEntries();
      const json = entries.find((e) => e.filename === 'card.json');
      if (!json || json.directory || json.uncompressedSize > 20 * 1024 ** 2)
        throw new Error('Risu 카드 정보를 찾을 수 없습니다.');
      card = JSON.parse(await json.getData!(new TextWriter()));
      let total = 0;
      for (const entry of entries) {
        if (entry.filename === 'module.risum')
          warnings.push(
            'module.risum의 Risu 전용 스크립트는 자동 실행하지 않습니다. 원본 Risu에서의 동작과 차이가 있을 수 있습니다.',
          );
        if (entry.directory || !/\.(png|jpe?g|webp|gif|svg)$/i.test(entry.filename)) continue;
        total += entry.uncompressedSize;
        if (total > MEDIA_LIMIT || blobs.size >= 10000)
          throw new Error('내장 이미지는 2GB·10,000개 이하로 불러올 수 있습니다.');
        blobs.set(entry.filename, await entry.getData!(new BlobWriter(mime(entry.filename))));
      }
    } finally {
      await reader.close();
    }
  }
  return preserveRisuSource(await convertRisu(card, file.name, blobs, warnings), file);
}

/** Keep unsupported scripts/modules as original bytes, without running or sending them to AI. */
export async function preserveRisuSource(result: ImportData, file: File): Promise<ImportData> {
  if (result.kind !== 'work') return result;
  const source = await makeAsset(file, file.name);
  result.work.importSource = { format: 'risu', fileName: file.name, url: `asset:${source.id}` };
  result.assets = [...(result.assets ?? []), source];
  return result;
}

export async function convertRisu(
  card: any,
  filename: string,
  blobs = new Map<string, Blob>(),
  warnings: string[] = [],
): Promise<ImportData> {
  if (
    !['chara_card_v2', 'chara_card_v3'].includes(card?.spec) ||
    !card.data ||
    typeof card.data !== 'object'
  )
    throw new Error('지원하는 Risu V2/V3 카드가 아닙니다.');
  const d = card.data,
    r = d.extensions?.risuai ?? {},
    work = emptyWork(text(d.creator) || 'Risu 제작자');
  work.title = text(d.name) || filename.replace(/\.[^.]+$/, '');
  const translate = (s: unknown) =>
    text(s)
      .replaceAll('{{char}}', work.title)
      .replace(/\{\{(?:img|image|asset)::([^{}]+)\}\}/g, '{{$1}}');
  work.description = translate(d.creator_notes);
  work.prompt =
    [d.description, d.personality, d.scenario].map(translate).filter(Boolean).join('\n\n') ||
    '이 작품의 설정에 맞춰 대화를 진행합니다.';
  if (text(d.system_prompt).trim()) work.customSystem = translate(d.system_prompt);
  work.systemMode = 'custom';
  work.customSystem =
    translate(d.system_prompt) ||
    '작품의 설정과 대화 맥락에 맞춰 응답합니다. 요청에 게임 상태와 규칙이 있으면 그 값을 따릅니다.';
  work.characters = [];
  const greetings = [
    d.first_mes,
    ...(Array.isArray(d.alternate_greetings) ? d.alternate_greetings : []),
  ]
    .map(translate)
    .filter((s) => s.trim());
  work.openings = (greetings.length ? greetings : ['{{user}}님, 이야기를 시작해 주세요.']).map(
    (body, i) => ({
      id: id(),
      name: `도입부 ${i + 1}`,
      body,
      suggestions: [],
      bgm: '',
      presence: [],
    }),
  );
  if (!greetings.length)
    warnings.push(
      '원본 카드에 도입부가 없어 시작 안내문을 넣었습니다. 제작 화면에서 도입부를 확인해 주세요.',
    );
  const entries = Array.isArray(d.character_book?.entries) ? d.character_book.entries : [];
  const isFolder = (entry: any) =>
    entry.mode === 'folder' ||
    (!text(entry.content).trim() &&
      Array.isArray(entry.keys) &&
      entry.keys.some((key: unknown) => /^folder:/.test(text(key))));
  const folders = new Map<string, string>();
  for (const entry of entries.filter(isFolder))
    for (const key of entry.keys ?? [])
      folders.set(text(key), text(entry.name) || text(entry.comment));
  work.lore = entries
    .filter((e: any) => e.enabled !== false && !isFolder(e))
    .slice(0, 10000)
    .map((e: any, i: number) => ({
      id: id(),
      name: text(e.name) || text(e.comment) || `로어북 ${i + 1}`,
      keywords: Array.isArray(e.keys)
        ? e.keys
            .map(text)
            .map((key: string) => key.trim())
            .filter(Boolean)
        : [],
      prompt: translate(e.content),
      activation: e.constant
        ? 'always'
        : e.use_regex ||
            e.selective ||
            !(Array.isArray(e.keys) && e.keys.some((key: unknown) => text(key).trim()))
          ? 'reference'
          : 'keyword',
      ...(folders.has(text(e.folder)) ? { group: folders.get(text(e.folder)) } : {}),
    }));
  if (folders.size)
    warnings.push(`로어북 폴더 ${entries.filter(isFolder).length}개는 항목의 분류로 옮겼습니다.`);
  const references = work.lore.filter((l) => l.activation === 'reference').length;
  if (references)
    warnings.push(
      `참조용 로어북 ${references}개는 스크립트가 필요할 때 조회합니다. AI에게 자동으로 전부 보내지 않습니다.`,
    );
  if (entries.some((e: any) => e.use_regex || e.selective))
    warnings.push(
      '정규식·보조 키워드 조건의 로어북은 참조용으로 보관합니다. 복합 조건·원본 우선순위·정확한 토큰 예산은 동일하게 지원하지 않습니다.',
    );
  const scripts = Array.isArray(r.customScripts) ? r.customScripts : [];
  const rules = scripts
    .filter((s: any) => ['editdisplay', 'editprocess', 'editinput', 'editoutput'].includes(s.type))
    .map((s: any, i: number) => ({
      id: id(),
      name: text(s.comment) || `Risu 규칙 ${i + 1}`,
      type: s.type,
      pattern: text(s.in),
      replacement: text(s.out),
      flags: s.ableFlag ? text(s.flag) || 'g' : 'g',
      cbs: text(s.flag).includes('<cbs>'),
    }));
  const luaScripts = (r.triggerscript ?? []).flatMap((trigger: any, index: number) =>
    (trigger.effect ?? [])
      .filter((e: any) => e.type === 'triggerlua')
      .map((e: any) => ({
        id: id(),
        name: text(trigger.comment) || `가져온 Lua ${index + 1}`,
        code: text(e.code),
      })),
  );
  work.risu = {
    version: 1,
    scripts: luaScripts,
    styles: text(r.backgroundHTML),
    rules,
    variables: text(r.defaultVariables),
    postHistory: translate(d.post_history_instructions),
    examples: translate(d.mes_example),
    loreSettings: {
      scanDepth: Number(d.character_book?.scan_depth ?? 5),
      tokenBudget: Number(d.character_book?.token_budget ?? 800),
      recursive: d.character_book?.recursive_scanning ?? true,
    },
  };
  work.displayRules = scripts
    .filter((s: any) => s.type === 'editdisplay')
    .map((s: any, i: number) => ({
      id: rules.filter((r: any) => r.type === 'editdisplay')[i].id,
      name: text(s.comment) || `Risu 표시 규칙 ${i + 1}`,
      pattern: text(s.in),
      flags:
        text(s.flag)
          .replace(/<[^>]*>/g, '')
          .replace(/[^gimsu]/g, '') || 'g',
      replacement: translate(s.out),
      enabled: true,
    }));
  if (scripts.length)
    warnings.push(
      `정규식 ${scripts.length}개를 가져왔습니다. 화면 표시 규칙은 자동연출, 요청·응답 규칙은 규칙의 Risu 설정에서 확인할 수 있습니다.`,
    );
  if (r.triggerscript?.length || r.virtualscript || r.defaultVariables || r.backgroundHTML)
    warnings.push(
      `Lua ${luaScripts.length}개와 원본 화면 스타일을 규칙에 보관합니다. 격리 실행기에서 처리하며 외부 요청·추가 AI 호출 등 일부 Risu API는 지원하지 않습니다.`,
    );
  const assets: StoredAsset[] = [];
  work.media.assets = [];
  const byPath = new Map<string, string>();
  let total = 0;
  const metadata = Array.isArray(d.assets) ? d.assets : [];
  for (const [path, blob] of blobs) {
    total += blob.size;
    if (total > MEDIA_LIMIT) throw new Error('이미지 합계가 2GB를 초과합니다.');
    if (blob.type === 'image/svg+xml') {
      warnings.push(
        '내장 SVG는 자동 미디어 등록에서 제외했습니다. 정제된 HTML/SVG 표시로 옮길 수 있습니다.',
      );
      continue;
    }
    const meta = metadata.find(
      (a: any) => text(a.uri).replace(/^embeded:\/\//, '') === path || a.uri === path,
    );
    const name =
      text(meta?.name) ||
      path
        .split('/')
        .at(-1)
        ?.replace(/\.[^.]+$/, '') ||
      `이미지 ${assets.length + 1}`;
    const asset = await makeAsset(blob, name);
    assets.push(asset);
    const url = `asset:${asset.id}`;
    byPath.set(path, url);
    work.media.assets.push({
      id: id(),
      name: work.media.assets.some((a) => a.name === name) ? `${name}_${assets.length}` : name,
      url,
      size: blob.size,
      type: blob.type,
    });
    if (meta?.type === 'icon' || path === 'ccdefault:') work.cover ||= url;
  }
  work.cover ||= byPath.get('assets/icon/image/main.png') || '';
  if (
    metadata.some(
      (a: any) => !blobs.has(text(a.uri).replace(/^embeded:\/\//, '')) && a.uri !== 'ccdefault:',
    )
  )
    warnings.push('일부 외부/내장 리소스 참조를 찾지 못했습니다. 미디어 목록을 확인해 주세요.');
  warnings.unshift(
    `도입부 ${work.openings.length}개 · 로어북 ${work.lore.length}개 · 내장 이미지 ${assets.length}개를 가져옵니다. 캐릭터 원문 설정은 작품 프롬프트에 보관합니다.`,
  );
  return { kind: 'work', work, assets, warnings: [...new Set(warnings)] };
}
