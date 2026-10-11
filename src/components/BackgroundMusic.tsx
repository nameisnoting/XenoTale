import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { IconButton, useNotify } from './UI';

export function BackgroundMusic({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(true);
  const notify = useNotify();
  useEffect(() => {
    const player = audio.current!;
    if (!enabled) {
      player.pause();
      return;
    }
    let cancelled = false;
    let pending = false;
    const stopRetry = () => {
      document.removeEventListener('pointerup', play);
      document.removeEventListener('keydown', play);
    };
    const play = () => {
      if (cancelled || pending) return;
      pending = true;
      void player
        .play()
        .then(() => {
          if (cancelled) player.pause();
          else stopRetry();
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          // Browsers may require a user gesture before the first audible playback.
          if (
            !(error instanceof DOMException) ||
            !['NotAllowedError', 'AbortError'].includes(error.name)
          )
            setEnabled(false);
        })
        .finally(() => {
          pending = false;
        });
    };
    document.addEventListener('pointerup', play);
    document.addEventListener('keydown', play);
    play();
    return () => {
      cancelled = true;
      stopRetry();
      player.pause();
    };
  }, [enabled, src]);
  return (
    <>
      <audio
        ref={audio}
        src={src}
        loop
        onError={() => {
          setEnabled(false);
          notify('BGM을 재생하지 못했습니다.');
        }}
      />
      <IconButton
        title={enabled ? 'BGM 끄기' : 'BGM 켜기'}
        aria-pressed={enabled}
        onClick={() => setEnabled(!enabled)}
      >
        {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </IconButton>
    </>
  );
}
