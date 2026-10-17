import { useState } from 'react';
import type { Work } from '../domain/types';
import { Button, safeUrl } from '../components/UI';
export function UploadedGallery({ assets }: { assets: NonNullable<Work['media']['assets']> }) {
  const [limit, setLimit] = useState(40);
  return (
    <>
      <div className="chat-gallery">
        {assets.slice(0, limit).map((a) => (
          <figure key={a.id + a.name}>
            <img src={safeUrl(a.url)} alt={a.name} loading="lazy" />
            <figcaption>{a.name}</figcaption>
          </figure>
        ))}
      </div>
      {assets.length > limit && (
        <Button className="full" onClick={() => setLimit(limit + 40)}>
          더 보기 ({limit} / {assets.length})
        </Button>
      )}
    </>
  );
}
