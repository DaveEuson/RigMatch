// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { NetworkHost } from '../types';
import { getModelFamily } from '../lib/modelOrigins';
import { MODEL_AVATAR_ASSETS, GENERIC_MODEL_AVATAR, HOST_AVATAR_SRC, getGenerationAvatarSrc } from '../lib/modelAvatars';

export function AvatarBust({ model, size, extraClass, generationKind }: {
  model: string;
  size: 'tiny' | 'small' | 'large';
  extraClass?: string;
  /**
   * Set for ComfyUI rows. Their names match no Ollama family, so without it a
   * video model wears the generic chat robot and the image-generation portrait
   * that already exists never appears.
   */
  generationKind?: 'image' | 'video' | 'text-encoder';
}) {
  const family = generationKind ? `gen-${generationKind}` : getModelFamily(model);
  const avatarSrc = generationKind
    ? getGenerationAvatarSrc(generationKind)
    : MODEL_AVATAR_ASSETS[getModelFamily(model)] ?? GENERIC_MODEL_AVATAR;

  return (
    <span
      className={['avatar-bust', size, `family-${family}`, extraClass].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <img src={avatarSrc} alt="" draggable={false} />
    </span>
  );
}

export function MachineAvatar({
  host,
  size,
}: {
  host?: Pick<NetworkHost, 'hostname' | 'ip' | 'isLocal'>;
  size: 'tiny' | 'small' | 'medium';
}) {
  return (
    <span
      className={`machine-avatar ${size} ${host?.isLocal ? 'local' : 'remote'}`}
      aria-hidden="true"
    >
      <img src={HOST_AVATAR_SRC} alt="" draggable={false} />
    </span>
  );
}
