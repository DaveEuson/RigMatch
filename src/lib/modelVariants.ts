// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What the letters in a model's name mean.
 *
 * `gemma4:e2b` and `gemma4:12b` arrive as two rows that differ only in a
 * string, and the app had nothing to say about the difference:
 * `getModelProfile` matches on the family name, so both return the same
 * archetype, the same specialties and the same colour. Simple Mode's
 * `collapseModelVariants` does not explain the choice either — it makes it for
 * you and moves on. So the first question a real user asks, "why is this one
 * better than that one, and what does e2b even stand for", had no answer
 * anywhere in the product.
 *
 * The `e` is the sharpest example and the reason this exists. Ollama's own
 * library page says it outright: "The 'E' in E2B and E4B stands for
 * 'effective' parameters, and are made for edge device deployments." An E2B is
 * 2.3B effective and 5.1B counting embeddings — a large model folded up to run
 * in a small one's memory, not a small model. Reading it as "2B" gets the
 * memory right and the capability wrong, which is exactly backwards from what
 * someone choosing between them needs to know.
 *
 * Deliberately generic: this decodes conventions, which are stable, and does
 * not carry per-model figures, which go stale the week a family is re-released.
 * Where an exact count matters the model page has it.
 *
 * Kept dependency-free so Node can import it directly for tests, like
 * runHistory.ts and wizardVariants.ts.
 */

export type VariantKind = 'effective' | 'params' | 'quant' | 'tuning' | 'guardrails';

export type VariantFact = {
  kind: VariantKind;
  /** Chip-sized, for sitting beside the model name. */
  label: string;
  /**
   * One sentence, to the glossary's standard: assume the reader has never run
   * a model and does not know what a graphics card is for.
   */
  plain: string;
};

/** Everything after the first colon, lowercased. `latest` when there is no tag. */
export function getModelTag(displayName: string): string {
  const afterSlash = String(displayName ?? '').split('/').pop() ?? '';
  const colon = afterSlash.indexOf(':');
  const tag = colon === -1 ? '' : afterSlash.slice(colon + 1);
  return (tag || 'latest').toLowerCase();
}

/**
 * The whole name, lowercased — not just the tag.
 *
 * The first version read only what followed the colon, which was wrong about
 * the catalogue as it actually is. Measured against the real list:
 * `lmstudio-community/qwen2.5-coder-7b-instruct` has no colon and says both its
 * size and its tuning in the name; `T5-XXL text encoder (fp8)` says its
 * compression in brackets; `phi3:mini` sizes itself in a word. All three
 * described nothing.
 */
function searchable(displayName: string): string {
  return String(displayName ?? '').toLowerCase();
}

const QUANT_PLAIN: Record<string, string> = {
  '2': 'Squeezed down hard — the smallest and fastest copy, and the one most likely to make mistakes.',
  '3': 'Squeezed down a long way. Fast and small, with a real cost to the answers.',
  '4': 'About half the size of the original and noticeably faster, for a small cost in quality. Most people should take this one.',
  '5': 'A middle setting: bigger than the usual choice, and a little closer to the original.',
  '6': 'Close to the original, and correspondingly larger.',
  '8': 'Barely squeezed at all. Keeps almost everything, and takes almost the full space.',
};

/**
 * `e2b` is matched before the plain `2b` rule on purpose. Both are true of the
 * string; only the first is true of the model.
 */
export function describeModelTag(displayName: string): VariantFact[] {
  const text = searchable(displayName);
  const facts: VariantFact[] = [];

  const effective = text.match(/(?:^|[-_:\s])e(\d+(?:\.\d+)?)b\b/);
  if (effective) {
    facts.push({
      kind: 'effective',
      label: `Effective ${effective[1]}B`,
      plain: `The E means "effective": it needs about as much room as a ${effective[1]} billion model, but there is more of it behind that number than the size suggests. Built to run well on laptops and phones.`,
    });
  } else {
    const billions = text.match(/(?:^|[-_:\s])(\d+(?:\.\d+)?)\s?b\b/);
    const millions = text.match(/(?:^|[-_:\s])(\d+(?:\.\d+)?)\s?m\b/);
    if (billions) {
      facts.push({
        kind: 'params',
        label: `${billions[1]}B`,
        plain: `Roughly ${billions[1]} billion things the model picked up during training. More usually means better answers, more room needed and more time.`,
      });
    } else if (millions) {
      facts.push({
        kind: 'params',
        label: `${millions[1]}M`,
        plain: `Roughly ${millions[1]} million things the model picked up during training — tiny, quick, and best kept to simple jobs.`,
      });
    } else {
      // Ollama ships plenty of tags that size themselves in words rather than
      // numbers — phi3:mini, phi3:medium. Without these they described nothing.
      const word = text.match(/(?:^|[-_:\s])(mini|small|medium|large)\b/);
      if (word) {
        const size = word[1];
        facts.push({
          kind: 'params',
          label: size.charAt(0).toUpperCase() + size.slice(1),
          plain: size === 'mini' || size === 'small'
            ? 'One of the smaller builds in this family — quicker and lighter than its siblings, and less capable with it.'
            : 'One of the larger builds in this family — better answers, and it needs more room and more time.',
        });
      }
    }
  }

  const quant = text.match(/(?:^|[-_:\s(])q(\d)(?:_(\w+))?/);
  const floatQuant = text.match(/\b(?:fp|f)(8|4)\b/);
  if (quant) {
    facts.push({
      kind: 'quant',
      label: `Q${quant[1]}`,
      plain: QUANT_PLAIN[quant[1]] ?? 'A smaller, squeezed-down copy of the same model.',
    });
  } else if (floatQuant) {
    // fp8 and fp4 are squeezed, not full — the opposite of fp16 and bf16, and
    // close enough in spelling to be worth separating deliberately.
    facts.push({
      kind: 'quant',
      label: `${floatQuant[1]}-bit`,
      plain: `A squeezed-down copy stored at ${floatQuant[1]} bits per value. Smaller and faster than the original, at some cost to the output.`,
    });
  } else if (/\b(?:fp16|f16|bf16|fp32|f32)\b/.test(text)) {
    facts.push({
      kind: 'quant',
      label: 'Full size',
      plain: 'Not squeezed down. The largest and slowest copy, and the closest to what its makers released.',
    });
  }

  // `-it` is Google's shorthand and appears only as a trailing word.
  if (/\b(?:instruct|chat)\b/.test(text) || /(?:^|[-_])it\b/.test(text)) {
    facts.push({
      kind: 'tuning',
      label: 'Instruction-tuned',
      plain: 'Trained to follow what you ask rather than just continue your sentence. This is the kind you want for chatting.',
    });
  } else if (/\b(?:base|pt)\b/.test(text)) {
    facts.push({
      kind: 'tuning',
      label: 'Base model',
      plain: 'A raw model that continues text rather than answering questions. Usually not the one you want.',
    });
  }

  if (/\b(?:uncensored|abliterated|dolphin)\b/.test(text)) {
    facts.push({
      kind: 'guardrails',
      label: 'Guardrails removed',
      plain: 'Someone has stripped out the refusals. It will attempt things the original declined, including things it gets badly wrong.',
    });
  }

  return facts;
}

/** One line for a table cell or tooltip. Null when the name says nothing useful. */
export function summariseModelTag(displayName: string): string | null {
  const facts = describeModelTag(displayName);
  return facts.length > 0 ? facts.map((fact) => fact.label).join(' · ') : null;
}

/**
 * What actually separates two variants, in the order a chooser cares about.
 *
 * Only differences: two models that share a trait do not need it listed twice,
 * and a list where most lines are identical is one nobody reads to the end.
 */
export function compareModelTags(left: string, right: string): Array<{
  kind: VariantKind;
  left: string | null;
  right: string | null;
}> {
  const byKind = (name: string) => new Map(describeModelTag(name).map((fact) => [fact.kind, fact.label]));
  const a = byKind(left);
  const b = byKind(right);
  const kinds: VariantKind[] = ['effective', 'params', 'quant', 'tuning', 'guardrails'];
  return kinds
    .filter((kind) => (a.get(kind) ?? null) !== (b.get(kind) ?? null))
    .map((kind) => ({ kind, left: a.get(kind) ?? null, right: b.get(kind) ?? null }));
}
