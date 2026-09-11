// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { CUSTOM_IMAGE_PROMPT_ID, IMAGE_BENCHMARK_PROMPTS } from '../lib/imageGenScoring';

/**
 * The prompt for a generation run: one of the benchmark scenes, or your own.
 *
 * Two things were wrong before. The image panel offered three fixed prompts
 * and no way to type one, and the video panel showed no prompt control at all
 * while its own description said it "checks a frame against the prompt" — it
 * had been quietly using whatever the image panel was set to.
 *
 * The honesty note matters as much as the input. Every benchmark prompt ships
 * with propositions — concrete yes/no questions a judge answers from the
 * picture — and those are the whole basis of the adherence score. Text somebody
 * just typed has none. Rather than invent questions about a scene nobody has
 * seen, a custom run renders and times, and says outright that adherence is not
 * scored. Same rule the rest of the app follows: measure what can be measured,
 * and say what cannot.
 */
export function PromptPicker({
  idPrefix,
  value,
  onChange,
  customPrompt,
  onCustomPromptChange,
  disabled,
}: {
  idPrefix: string;
  value: string;
  onChange: (id: string) => void;
  customPrompt: string;
  onCustomPromptChange: (text: string) => void;
  disabled: boolean;
}) {
  const custom = value === CUSTOM_IMAGE_PROMPT_ID;
  return (
    <>
      <div className="advanced-lab-image-controls">
        <label htmlFor={`${idPrefix}-prompt`}>Prompt</label>
        <select
          id={`${idPrefix}-prompt`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          {IMAGE_BENCHMARK_PROMPTS.map((prompt) => (
            <option key={prompt.id} value={prompt.id}>{prompt.prompt}</option>
          ))}
          <option value={CUSTOM_IMAGE_PROMPT_ID}>Write my own…</option>
        </select>
      </div>
      {custom && (
        <div className="advanced-lab-image-controls">
          <label htmlFor={`${idPrefix}-custom`}>Your prompt</label>
          <textarea
            id={`${idPrefix}-custom`}
            className="advanced-lab-custom-prompt"
            value={customPrompt}
            onChange={(event) => onCustomPromptChange(event.target.value)}
            disabled={disabled}
            rows={2}
            placeholder="Describe the scene"
          />
          <p className="advanced-lab-custom-note">
            Your own wording renders and is timed, but adherence is not scored — the
            built-in prompts ship with specific questions a judge checks the picture
            against, and there are none for a scene we have not seen.
          </p>
        </div>
      )}
    </>
  );
}
