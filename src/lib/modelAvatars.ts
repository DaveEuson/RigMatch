import { getModelFamily, type ModelFamilyId } from './modelOrigins';
import machineAvatarLocal from '../assets/machine-avatar-local.webp';
import modelAvatarDeepSeek from '../assets/model-avatar-deepseek.webp';
import modelAvatarGemma from '../assets/model-avatar-gemma.webp';
import modelAvatarGeneric from '../assets/model-avatar-generic.webp';
import modelAvatarLlama from '../assets/model-avatar-llama.webp';
import modelAvatarMistral from '../assets/model-avatar-mistral.webp';
import modelAvatarPhi from '../assets/model-avatar-phi.webp';
import modelAvatarQwen from '../assets/model-avatar-qwen.webp';

/** Contestant portrait art per model family, with a generic fallback. */
export const MODEL_AVATAR_ASSETS: Record<ModelFamilyId, string> = {
  deepseek: modelAvatarDeepSeek,
  llama: modelAvatarLlama,
  qwen: modelAvatarQwen,
  mistral: modelAvatarMistral,
  gemma: modelAvatarGemma,
  phi: modelAvatarPhi,
  generic: modelAvatarGeneric,
};

/** Raw avatar image URL for a model, for custom-sized `<img>` (e.g. wizard cards). */
export function getModelAvatarSrc(model: string): string {
  return MODEL_AVATAR_ASSETS[getModelFamily(model)] ?? modelAvatarGeneric;
}

export const GENERIC_MODEL_AVATAR = modelAvatarGeneric;

/** The retro-computer host avatar. */
export const HOST_AVATAR_SRC = machineAvatarLocal;
