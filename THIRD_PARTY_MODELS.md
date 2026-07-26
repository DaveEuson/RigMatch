# Third-Party Model Notice

RigMatch benchmarks local models through the user's Ollama installation.
RigMatch does not bundle third-party model weights, sell model access, or claim endorsement from model providers.

Model downloads, model weights, model outputs, and model names may be governed by separate provider licenses, terms, acceptable-use policies, or prohibited-use policies. Users should review the applicable terms before downloading, using, sharing, or redistributing any model.

Benchmark prompts and generated outputs are test artifacts. They may be inaccurate, incomplete, or unsafe, and they are not legal, medical, financial, safety, or professional advice.

Useful provider links:

- Ollama model library: https://ollama.com/library
- Ollama terms: https://ollama.com/terms
- Google Gemma terms: https://ai.google.dev/gemma/terms
- Google Gemma prohibited use policy: https://ai.google.dev/gemma/prohibited_use_policy
- Google Gemma 4 license information: https://ai.google.dev/gemma/apache_2

Release checklist:

- Do not ship third-party model weights inside the RigMatch installer unless the required license, notice, attribution, and use-restriction files are included.
- If a release adds bundled model weights, review that model's current license before publishing.
- Keep third-party model notices visible in the app and in public project/release materials.
