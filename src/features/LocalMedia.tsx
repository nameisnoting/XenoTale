import { useRef, useState, useEffect } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import type { Work } from '../domain/types';
import { id } from '../domain/types';
import { Button, IconButton, TextInput, safeUrl, useNotify } from '../components/UI';
import { formatBytes, makeAsset, MEDIA_LIMIT, saveAssets } from '../persistence/assets';

export function LocalMedia({ work, onChange }: { work: Work; onChange: (w: Work) => void }) {
  const input = useRef<HTMLInputElement>(null),
    notify = useNotify(),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [page, setPage] = useState(0);
  const latest = useRef({ work, onChange }),
    mounted = useRef(true);
  latest.current = { work, onChange };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const assets = work.media.assets ?? [],
    used = [...new Map(assets.map((a) => [a.url, a.size])).values()].reduce(
      (n, size) => n + size,
      0,
    ),
    pages = Math.max(1, Math.ceil(assets.length / 20)),
    current = Math.min(page, pages - 1);
  const upload = async (files: File[]) => {
    if (busy) return;
    setBusy(true);
    setProgress(0);
    try {
      if (
        files.some((f) => !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type))
      )
        throw new Error('PNG, JPG, WebP, GIF 이미지를 선택해 주세요.');
      if (files.some((f) => f.size > MEDIA_LIMIT))
        throw new Error('이미지 합계는 2GB까지 등록할 수 있습니다.');
      if (assets.length + files.length > 10000)
        throw new Error('이미지는 최대 10,000개까지 등록할 수 있습니다.');
      const added: NonNullable<Work['media']['assets']> = [];
      const rows = [];
      const names = new Set([
        ...assets.map((a) => a.name),
        ...work.effects.map((e) => e.name),
        'user',
      ]);
      for (let i = 0; i < files.length; i++) {
        if (!mounted.current) return;
        const file = files[i];
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        const base =
          file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[{}:/]/g, '_')
            .slice(0, 200) || '이미지';
        let name = base,
          suffix = 2;
        while (names.has(name)) name = `${base}_${suffix++}`;
        names.add(name);
        const asset = await makeAsset(file, name);
        rows.push(asset);
        added.push({
          id: id(),
          name,
          url: `asset:${asset.id}`,
          size: file.size,
          type: file.type,
        });
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      if (
        [...new Map([...assets, ...added].map((a) => [a.url, a.size])).values()].reduce(
          (n, size) => n + size,
          0,
        ) > MEDIA_LIMIT
      )
        throw new Error('이미지 합계는 2GB까지 등록할 수 있습니다.');
      await saveAssets(rows);
      if (mounted.current) {
        const { work: current, onChange: change } = latest.current;
        change({
          ...current,
          media: { ...current.media, assets: [...(current.media.assets ?? []), ...added] },
        });
      }
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="local-media">
      <div className="local-media-usage">
        <span>
          {formatBytes(used)} / 2 GB · {assets.length.toLocaleString()}개
        </span>
        <progress max={MEDIA_LIMIT} value={used} aria-label="내장 이미지 용량" />
      </div>
      <Button disabled={busy} onClick={() => input.current?.click()}>
        <Upload size={16} />
        {busy ? `이미지 처리 중 ${progress}%` : '이미지 업로드'}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void upload(files);
        }}
      />
      <p className="muted">
        이미지는 작품 파일에 포함됩니다. 이름을 등록하면 AI가 {'{{이름}}'} 태그로 표시할 수
        있습니다.
      </p>
      <div className="local-media-grid">
        {assets.slice(current * 20, current * 20 + 20).map((asset) => (
          <div className="local-media-item" key={asset.id}>
            <img src={safeUrl(asset.url)} alt={asset.name} loading="lazy" />
            <TextInput
              disabled={busy}
              aria-label={`${asset.name} 이미지 이름`}
              value={asset.name}
              onChange={(name) =>
                onChange({
                  ...work,
                  media: {
                    ...work.media,
                    assets: assets.map((a) => (a.id === asset.id ? { ...a, name } : a)),
                  },
                })
              }
            />
            <small>
              {formatBytes(asset.size)} · {'{{' + asset.name + '}}'}
            </small>
            <IconButton
              title={`${asset.name} 이미지 제거`}
              disabled={busy}
              onClick={() =>
                onChange({
                  ...work,
                  media: { ...work.media, assets: assets.filter((a) => a.id !== asset.id) },
                })
              }
            >
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="pagination">
          <Button disabled={!current} onClick={() => setPage(current - 1)}>
            이전
          </Button>
          <span>
            {current + 1} / {pages}
          </span>
          <Button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
            다음
          </Button>
        </div>
      )}
    </section>
  );
}
