// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
// Static validity check for App Builder results.
//
// The structural scorer only asks "does this LOOK like an app?" — canvas present,
// has event listeners, has functions. A model can pass every one of those and still
// ship code that never runs. The clearest, reliably-detectable case is a SYNTAX
// error: phi3:mini left `if (x && /* comment */)`, which doesn't parse, so the
// script never executes and you get a blank screen — yet it scored 100/S.
//
// This module catches that class deterministically by parse-checking every script.
//
// What it deliberately does NOT do: execute the code to catch *runtime* crashes
// (e.g. qwen2.5 built a valid-but-wrong Tetris that throws `.map is not a function`
// on the first tick). An execution probe needs a sandboxed iframe whose behavior
// varies with the host's CSP/sandbox and couldn't be verified reliably — a check
// that silently passes everything is worse than none. Catching runtime/logic
// breakage is the job of the LLM judge, which reads and reasons about the code.

// Parse-checks every <script> block without executing it (the Function constructor
// compiles the body but does not run it). Returns the first syntax error message,
// or null if all scripts parse. Pure and node-testable — no DOM required.
export function findScriptSyntaxError(html: string): string | null {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((src) => src.trim());
  for (const src of scripts) {
    try {
      new Function(src);
    } catch (error) {
      // Only syntax errors surface at parse time; anything else means it parsed.
      if (error instanceof SyntaxError) return error.message;
    }
  }
  return null;
}

// Whether the app's code is at least syntactically valid (i.e. it will actually
// execute rather than dying at parse time). `error` explains the failure when not.
export function checkAppParses(html: string): { parses: boolean; error: string | null } {
  const syntaxError = findScriptSyntaxError(html);
  return syntaxError ? { parses: false, error: `Syntax error: ${syntaxError}` } : { parses: true, error: null };
}
