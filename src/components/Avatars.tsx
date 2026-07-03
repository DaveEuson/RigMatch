import type { NetworkHost } from '../types';
import { getModelFamily } from '../lib/modelOrigins';
import { MODEL_AVATAR_ASSETS, GENERIC_MODEL_AVATAR, HOST_AVATAR_SRC } from '../lib/modelAvatars';

export function AvatarBust({ model, size, extraClass }: { model: string; size: 'tiny' | 'small' | 'large'; extraClass?: string }) {
  const family = getModelFamily(model);
  const avatarSrc = MODEL_AVATAR_ASSETS[family] ?? GENERIC_MODEL_AVATAR;

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
