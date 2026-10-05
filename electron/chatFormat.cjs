// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Whether an installed model can hold a conversation, from what Ollama's
 * /api/show says about it.
 *
 * Ollama turns a chat into the text a model reads with the model's template,
 * or, for newer families, with a built-in renderer named in the Modelfile
 * (`RENDERER qwen3.5`). A model with neither has nowhere to put a system
 * prompt, earlier turns or the end of its own reply. Found on Dave's machine:
 *
 *  - deepseek-ocr: `{{ .Prompt }}`, made to turn a page into text. In Chat it
 *    printed "<|im_end|>", then RigMatch's own system prompt.
 *  - starcoder2 and codegemma:2b: fill-in-the-middle code completion
 *    (`<fim_prefix>{{ .Prompt }}<fim_suffix>`), not instructions.
 *
 * Asked a show's questions, models like these lose for a reason the show never
 * states, so RigMatch leaves them out of conversations and says why.
 */

/** Anything in a template that means it knows about turns or roles. */
const CHAT_SIGNS = /\.Messages|\.System|\.Role|<\|im_start\|>|<\|start_header_id\|>|<start_of_turn>|\[INST\]|<\|user\|>|\bUSER:|\bUser:|### Instruction|\bHuman:/;

/**
 * True when the model has a chat format, false when it plainly has none, and
 * undefined when Ollama sent nothing to judge by (an older Ollama, or another
 * provider), so callers can tell "no" from "unknown".
 */
function hasChatFormat(shown) {
  const template = typeof shown?.template === 'string' ? shown.template : null;
  const modelfile = typeof shown?.modelfile === 'string' ? shown.modelfile : '';
  if (/^RENDERER\s+\S/m.test(modelfile)) return true;
  if (template === null) return undefined;
  return CHAT_SIGNS.test(template);
}

module.exports = { hasChatFormat };
