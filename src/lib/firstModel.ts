/**
 * What a first-time user should download, given what they want and what their
 * card can hold.
 *
 * Data and rules, no rendering — so the wizard presenting it lives in its own
 * component file, and so these picks can be checked without mounting anything.
 */

export type FirstModelUseCase = 'chat' | 'code' | 'writing' | 'reasoning' | 'speed';

export const USE_CASES: Array<{ id: FirstModelUseCase; emoji: string; label: string; description: string }> = [
  { id: 'chat',      emoji: '💬', label: 'Chat & Daily Help',   description: 'Ask questions, get summaries, brainstorm ideas' },
  { id: 'code',      emoji: '💻', label: 'Coding',              description: 'Write code, debug, explain errors' },
  { id: 'writing',   emoji: '✍️',  label: 'Writing',            description: 'Drafts, emails, creative content' },
  { id: 'reasoning', emoji: '🧠', label: 'Research & Analysis', description: 'Deep thinking, comparisons, long documents' },
  { id: 'speed',     emoji: '⚡', label: 'Just the Fastest',    description: 'Quick answers, low-latency, lightweight' },
];

export type FirstModelPick = { id: string; name: string; size: string; why: string; vramNote: string };

export function getFirstModelPicks(useCase: FirstModelUseCase, vramGb: number): FirstModelPick[] {
  const tier = vramGb >= 16 ? 'large' : vramGb >= 10 ? 'medium' : vramGb >= 6 ? 'small' : 'tiny';

  const picks: Record<FirstModelUseCase, Record<string, FirstModelPick[]>> = {
    chat: {
      large:  [
        { id: 'llama3.1:8b',   name: 'Llama 3.1 8B',   size: '4.9 GB', why: 'Meta\'s flagship chat model — balanced, articulate, great for everyday conversation', vramNote: 'Runs fully in VRAM' },
        { id: 'gemma3:4b',     name: 'Gemma 3 4B',     size: '3.3 GB', why: 'Google\'s compact model — fast, friendly, surprisingly capable for its size', vramNote: 'Runs fully in VRAM' },
      ],
      medium: [
        { id: 'gemma3:4b',     name: 'Gemma 3 4B',     size: '3.3 GB', why: 'Google\'s compact model — fast, friendly, great for daily chat', vramNote: 'Runs fully in VRAM' },
        { id: 'llama3.2:3b',   name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Meta\'s small but sharp chat model — snappy and reliable', vramNote: 'Runs fully in VRAM' },
      ],
      small:  [
        { id: 'llama3.2:3b',   name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Meta\'s small but sharp chat model — snappy and reliable', vramNote: 'Runs fully in VRAM' },
        { id: 'phi3:mini',     name: 'Phi-3 Mini',     size: '2.3 GB', why: 'Microsoft\'s tiny powerhouse — efficient and surprisingly good at conversation', vramNote: 'Runs fully in VRAM' },
      ],
      tiny:   [
        { id: 'phi3:mini',     name: 'Phi-3 Mini',     size: '2.3 GB', why: 'Microsoft\'s tiny powerhouse — the best chat you\'ll get on limited hardware', vramNote: 'May use system RAM' },
        { id: 'llama3.2:1b',   name: 'Llama 3.2 1B',   size: '1.3 GB', why: 'Ultra-light — runs anywhere, answers quickly', vramNote: 'Runs on CPU too' },
      ],
    },
    code: {
      large:  [
        { id: 'qwen2.5-coder:7b',  name: 'Qwen 2.5 Coder 7B',  size: '4.7 GB', why: 'Best-in-class local coding model — great at completions, explanations, and debugging', vramNote: 'Runs fully in VRAM' },
        { id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder 7B', size: '3.8 GB', why: 'Built specifically for code — strong on Python, JS, and TypeScript', vramNote: 'Runs fully in VRAM' },
      ],
      medium: [
        { id: 'qwen2.5-coder:7b',  name: 'Qwen 2.5 Coder 7B',  size: '4.7 GB', why: 'Best-in-class local coding model — completions, debugging, and explanations', vramNote: 'Runs fully in VRAM' },
        { id: 'qwen2.5-coder:3b',  name: 'Qwen 2.5 Coder 3B',  size: '2.0 GB', why: 'Smaller but still very capable — good fallback if 7B is too slow', vramNote: 'Runs fully in VRAM' },
      ],
      small:  [
        { id: 'qwen2.5-coder:3b',  name: 'Qwen 2.5 Coder 3B',  size: '2.0 GB', why: 'Compact coding model — better at code than most general models twice its size', vramNote: 'Runs fully in VRAM' },
        { id: 'qwen2.5-coder:1.5b',name: 'Qwen 2.5 Coder 1.5B',size: '1.0 GB', why: 'Tiny but surprisingly good at short code tasks and explaining errors', vramNote: 'Runs fully in VRAM' },
      ],
      tiny:   [
        { id: 'qwen2.5-coder:1.5b',name: 'Qwen 2.5 Coder 1.5B',size: '1.0 GB', why: 'The best coding help you can get on minimal hardware', vramNote: 'Runs on CPU too' },
      ],
    },
    writing: {
      large:  [
        { id: 'llama3.1:8b',   name: 'Llama 3.1 8B',   size: '4.9 GB', why: 'Excellent writer — handles tone, structure, and style with ease', vramNote: 'Runs fully in VRAM' },
        { id: 'mistral:7b',    name: 'Mistral 7B',     size: '4.1 GB', why: 'Strong prose model — clean, confident writing output', vramNote: 'Runs fully in VRAM' },
      ],
      medium: [
        { id: 'mistral:7b',    name: 'Mistral 7B',     size: '4.1 GB', why: 'Strong prose model — clean, confident writing output', vramNote: 'Runs fully in VRAM' },
        { id: 'gemma3:4b',     name: 'Gemma 3 4B',     size: '3.3 GB', why: 'Great at summaries, emails, and short-form creative writing', vramNote: 'Runs fully in VRAM' },
      ],
      small:  [
        { id: 'gemma3:4b',     name: 'Gemma 3 4B',     size: '3.3 GB', why: 'Great at summaries, emails, and short-form creative writing', vramNote: 'Runs fully in VRAM' },
        { id: 'phi3:mini',     name: 'Phi-3 Mini',     size: '2.3 GB', why: 'Compact and surprisingly good at structured writing tasks', vramNote: 'Runs fully in VRAM' },
      ],
      tiny:   [
        { id: 'phi3:mini',     name: 'Phi-3 Mini',     size: '2.3 GB', why: 'Best writing quality available on limited hardware', vramNote: 'May use system RAM' },
      ],
    },
    reasoning: {
      large:  [
        { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B', size: '4.7 GB', why: 'Built for step-by-step reasoning — explains its thinking, great for analysis', vramNote: 'Runs fully in VRAM' },
        { id: 'qwen2.5:7b',     name: 'Qwen 2.5 7B',    size: '4.7 GB', why: 'Excellent at following complex instructions and multi-step tasks', vramNote: 'Runs fully in VRAM' },
      ],
      medium: [
        { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B', size: '4.7 GB', why: 'Built for step-by-step reasoning — explains its thinking, great for analysis', vramNote: 'Runs fully in VRAM' },
        { id: 'llama3.2:3b',    name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Solid reasoning for its size — good for structured Q&A and comparisons', vramNote: 'Runs fully in VRAM' },
      ],
      small:  [
        { id: 'llama3.2:3b',    name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Best reasoning option at this VRAM level — follows instructions well', vramNote: 'Runs fully in VRAM' },
        { id: 'phi3:mini',      name: 'Phi-3 Mini',      size: '2.3 GB', why: 'Microsoft trained it specifically for logical tasks — punches above its weight', vramNote: 'Runs fully in VRAM' },
      ],
      tiny:   [
        { id: 'phi3:mini',      name: 'Phi-3 Mini',      size: '2.3 GB', why: 'The reasoning standout at this size — Microsoft\'s focus was logic and instruction-following', vramNote: 'May use system RAM' },
      ],
    },
    speed: {
      large:  [
        { id: 'llama3.2:3b',    name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Tiny model on a capable GPU = instant responses. Best speed/quality ratio for quick answers', vramNote: 'Flies in VRAM' },
        { id: 'gemma3:1b',      name: 'Gemma 3 1B',     size: '0.8 GB', why: 'Google\'s smallest model — basically instant on modern hardware', vramNote: 'Flies in VRAM' },
      ],
      medium: [
        { id: 'llama3.2:3b',    name: 'Llama 3.2 3B',   size: '2.0 GB', why: 'Fast and capable — the sweet spot for quick, reliable responses', vramNote: 'Flies in VRAM' },
        { id: 'phi3:mini',      name: 'Phi-3 Mini',      size: '2.3 GB', why: 'Snappy and smart — responds quickly without sacrificing too much quality', vramNote: 'Flies in VRAM' },
      ],
      small:  [
        { id: 'llama3.2:1b',    name: 'Llama 3.2 1B',   size: '1.3 GB', why: 'Ultra-light — the fastest responses you\'ll get on any hardware', vramNote: 'Very fast even on CPU' },
        { id: 'gemma3:1b',      name: 'Gemma 3 1B',     size: '0.8 GB', why: 'Google\'s smallest — basically instant responses', vramNote: 'Runs on CPU too' },
      ],
      tiny:   [
        { id: 'llama3.2:1b',    name: 'Llama 3.2 1B',   size: '1.3 GB', why: 'The speed king at any VRAM level — downloads fast, responds fast', vramNote: 'Runs on CPU' },
        { id: 'gemma3:1b',      name: 'Gemma 3 1B',     size: '0.8 GB', why: 'Tiny but functional — a good first download just to see it work', vramNote: 'Runs on CPU' },
      ],
    },
  };

  return picks[useCase][tier] ?? picks[useCase].small ?? [];
}
