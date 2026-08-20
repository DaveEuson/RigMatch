// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { getModelFamily, type ModelFamilyId } from './modelOrigins.ts';
import machineAvatarLocal from '../assets/machine-avatar-local.webp';
import modelAvatarCohere from '../assets/model-avatar-cohere.webp';
import modelAvatarDeepSeek from '../assets/model-avatar-deepseek.webp';
import modelAvatarFalcon from '../assets/model-avatar-falcon.webp';
import modelAvatarGemma from '../assets/model-avatar-gemma.webp';
import modelAvatarGranite from '../assets/model-avatar-granite.webp';
import modelAvatarImageGen from '../assets/model-avatar-imagegen.webp';
import modelAvatarGeneric from '../assets/model-avatar-generic.webp';
import modelAvatarLlama from '../assets/model-avatar-llama.webp';
import modelAvatarMistral from '../assets/model-avatar-mistral.webp';
import modelAvatarPhi from '../assets/model-avatar-phi.webp';
import modelAvatarQwen from '../assets/model-avatar-qwen.webp';
import modelAvatarSmolLM from '../assets/model-avatar-smollm.webp';
import modelAvatarSolar from '../assets/model-avatar-solar.webp';
import modelAvatarStableLM from '../assets/model-avatar-stablelm.webp';
import modelAvatarStarCoder from '../assets/model-avatar-starcoder.webp';
import modelAvatarVision from '../assets/model-avatar-vision.webp';
import modelAvatarYi from '../assets/model-avatar-yi.webp';

/** Contestant portrait art per model family, with a generic fallback. */
export const MODEL_AVATAR_ASSETS: Record<ModelFamilyId, string> = {
  deepseek: modelAvatarDeepSeek,
  llama: modelAvatarLlama,
  qwen: modelAvatarQwen,
  mistral: modelAvatarMistral,
  gemma: modelAvatarGemma,
  phi: modelAvatarPhi,

  granite: modelAvatarGranite,
  cohere: modelAvatarCohere,
  vision: modelAvatarVision,
  yi: modelAvatarYi,
  solar: modelAvatarSolar,
  falcon: modelAvatarFalcon,
  starcoder: modelAvatarStarCoder,
  smollm: modelAvatarSmolLM,
  stablelm: modelAvatarStableLM,
  imagegen: modelAvatarImageGen,

  // Fallback for community fine-tunes and anything unrecognized. To add a new
  // family portrait, see docs/avatar-art-direction.md.
  generic: modelAvatarGeneric,
};

/** Raw avatar image URL for a model, for custom-sized `<img>` (e.g. wizard cards). */
export function getModelAvatarSrc(model: string): string {
  return MODEL_AVATAR_ASSETS[getModelFamily(model)] ?? modelAvatarGeneric;
}

/**
 * The portrait for a generation model, chosen by what it makes.
 *
 * Name matching cannot do this job: "LTX-Video 2B (distilled)" and "Stable
 * Diffusion 1.5" both fall through to the generic robot, and the imagegen
 * portrait that already exists goes unused. What a row makes is known
 * outright, so it picks the picture.
 *
 * Video and text-encoder portraits do not exist yet and fall back — video to
 * the image-generation one, since it is closer than a generic chat robot, and
 * encoders to generic because they are the least contestant-like thing here.
 * Both light up the moment art with those names is added; see
 * docs/avatar-art-direction.md.
 */
export function getGenerationAvatarSrc(kind: 'image' | 'video' | 'text-encoder'): string {
  if (kind === 'text-encoder') return modelAvatarGeneric;
  return modelAvatarImageGen;
}

export const GENERIC_MODEL_AVATAR = modelAvatarGeneric;

/** The retro-computer host avatar. */
export const HOST_AVATAR_SRC = machineAvatarLocal;
