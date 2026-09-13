// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { fetchComfyOutput } from '../lib/comfyTransport';
import type { ComfyImageRef } from '../lib/comfyui';
import { dataUrlToBlob } from '../lib/dataUrl';
import { getErrorMessage } from '../lib/format';

/**
 * A clip ComfyUI made, fetched only when someone asks to hear it.
 *
 * Results keep where the clip is, not the clip: thirty seconds is a megabyte,
 * and storage would be full after a few comparisons. So the player starts as a
 * button, and the clip comes from ComfyUI's output folder when it is pressed.
 * Keyed by the file, so a newer clip for the same model starts fresh.
 */
export function AudioClipPlayer({ audioRef, label }: { audioRef: ComfyImageRef; label: string }) {
  return <ClipPlayer key={`${audioRef.type}/${audioRef.subfolder}/${audioRef.filename}`} audioRef={audioRef} label={label} />;
}

function ClipPlayer({ audioRef, label }: { audioRef: ComfyImageRef; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const urlRef = useRef<string | null>(null);

  // An object URL outlives the player unless revoked, and pins the clip in memory.
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const blob = dataUrlToBlob(await fetchComfyOutput(audioRef));
      // ComfyUI names the type from the extension; an unnamed one is still an MP3.
      const typed = blob.type.startsWith('audio/') ? blob : new Blob([blob], { type: 'audio/mpeg' });
      const next = URL.createObjectURL(typed);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next;
      setUrl(next);
    } catch (reason) {
      // Usually the clip was cleared from ComfyUI's output folder since the run.
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  if (url) return <audio className="audio-clip-player" src={url} controls autoPlay aria-label={label} />;
  return (
    <div className="audio-clip-load">
      <button type="button" className="mini-button outline" onClick={() => void load()} disabled={loading} aria-label={label}>
        <Play aria-hidden="true" />
        {loading ? 'Loading' : 'Play the clip'}
      </button>
      {error && <em className="video-lineup-error">Could not load the clip. {error}</em>}
    </div>
  );
}
