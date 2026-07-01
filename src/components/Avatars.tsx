import type { NetworkHost } from '../types';
import { getModelFamily, type ModelFamilyId } from '../lib/modelOrigins';
import machineAvatarLocal from '../assets/machine-avatar-local.webp';
import modelAvatarDeepSeek from '../assets/model-avatar-deepseek.webp';
import modelAvatarGemma from '../assets/model-avatar-gemma.webp';
import modelAvatarGeneric from '../assets/model-avatar-generic.webp';
import modelAvatarLlama from '../assets/model-avatar-llama.webp';
import modelAvatarMistral from '../assets/model-avatar-mistral.webp';
import modelAvatarPhi from '../assets/model-avatar-phi.webp';
import modelAvatarQwen from '../assets/model-avatar-qwen.webp';

/** Contestant portrait art per model family, with a generic fallback. */
const MODEL_AVATAR_ASSETS: Record<ModelFamilyId, string> = {
  deepseek: modelAvatarDeepSeek,
  llama: modelAvatarLlama,
  qwen: modelAvatarQwen,
  mistral: modelAvatarMistral,
  gemma: modelAvatarGemma,
  phi: modelAvatarPhi,
  generic: modelAvatarGeneric,
};

export function AvatarBust({ model, size, extraClass }: { model: string; size: 'tiny' | 'small' | 'large'; extraClass?: string }) {
  const family = getModelFamily(model);
  const avatarSrc = MODEL_AVATAR_ASSETS[family] ?? modelAvatarGeneric;

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
      <img src={machineAvatarLocal} alt="" draggable={false} />
    </span>
  );
}
