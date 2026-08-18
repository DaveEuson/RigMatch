/**
 * Remove comments and string literals from TypeScript source, so that tools
 * which read code with regexes are not fooled by prose.
 *
 * Ordering is why this is a scanner and not a chain of .replace() calls. Strip
 * comments first and `'https://ollama.com/library'` loses its tail — the `//`
 * inside the string reads as a comment, taking the closing brace with it. Strip
 * strings first and a `/* ... *​/` block holding an apostrophe desynchronises
 * instead. Neither order is safe; only tracking the state character by
 * character is.
 *
 * Both failures are quiet. In move-declaration the eaten brace showed up as
 * "brackets never balanced" and stopped the tool, which is the good case. In
 * analyze-coupling it silently dropped identifiers, under-reporting a
 * component's dependencies and making it look cheaper to extract than it was.
 *
 * Newlines inside removed spans are preserved, so line numbers still line up
 * with the original and a caller can scrub once, then work line by line.
 */

/**
 * @param keepTemplateExpressions  Keep the code inside `${...}`. Identifier
 *   collection wants it (those are real references); bracket counting does not
 *   (a complete template is balanced, so dropping it whole is safe).
 */
export function scrubSource(text, { keepTemplateExpressions = false } = {}) {
  let out = '';
  let i = 0;
  const n = text.length;

  const carryNewlines = (from, to) => {
    for (let k = from; k < to; k += 1) if (text[k] === '\n') out += '\n';
  };

  while (i < n) {
    const c = text[i];
    const d = text[i + 1];

    if (c === '/' && d === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }

    if (c === '/' && d === '*') {
      const from = i;
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i = Math.min(i + 2, n);
      carryNewlines(from, i);
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      const from = i;
      i += 1;
      while (i < n && text[i] !== quote) {
        if (text[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      out += quote + quote;
      carryNewlines(from, i);
      continue;
    }

    if (c === '`') {
      i += 1;
      let literalStart = i;
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === '`') { i += 1; break; }
        if (text[i] === '$' && text[i + 1] === '{') {
          carryNewlines(literalStart, i);
          i += 2;
          const exprStart = i;
          let braces = 1;
          while (i < n && braces > 0) {
            if (text[i] === '{') braces += 1;
            else if (text[i] === '}') braces -= 1;
            if (braces === 0) break;
            i += 1;
          }
          if (keepTemplateExpressions) out += ` ${scrubSource(text.slice(exprStart, i), { keepTemplateExpressions })} `;
          else carryNewlines(exprStart, i);
          i += 1;
          literalStart = i;
          continue;
        }
        i += 1;
      }
      carryNewlines(literalStart, i);
      out += '``';
      if (false) carryNewlines(from, i);
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}
