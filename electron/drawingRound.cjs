// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
//
// The drawing round: every contestant is asked for the same picture as one SVG,
// the idea behind Simon Willison's "pelican riding a bicycle" benchmark
// (https://simonwillison.net/tags/pelican-riding-a-bicycle/). It tests turning
// a description into code that works, and the pictures show a newcomer the
// difference between models at a glance.
//
// This module is everything about the answer that does not need a model:
// finding the SVG in it, checking it, and cleaning it. The main process runs
// it on every drawing, so a broken one scores low without waiting for a judge,
// and stores only the cleaned copy, which is all the renderer ever draws.
//
// Pure and dependency-free (no DOM here), so tests run it as it ships.

/** Answer tokens for a drawing: a compact SVG fits, an endless one is cut off. */
const DRAWING_ANSWER_TOKENS = 1200;
/** A drawing that takes longer than this scores as no drawing; the show goes on. */
const DRAWING_TIMEOUT_MS = 90000;
/** Far more than 1,200 tokens can write, so only an imported or edited answer meets it. */
const DRAWING_SVG_MAX_CHARS = 32000;
/** Past these the SVG is a render bomb rather than a picture. */
const DRAWING_MAX_ELEMENTS = 2000;
const DRAWING_MAX_DEPTH = 48;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * The elements a drawing keeps, matched exactly (SVG names are case-sensitive).
 * Anything else goes with everything inside it: script, style, foreignObject
 * (HTML inside the SVG), image and use (they load or repeat other content), a,
 * and the animate family, set included (they can rewrite an href).
 */
const KEPT_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'linearGradient', 'radialGradient', 'stop', 'clipPath',
]);

/**
 * The attributes a kept element keeps: shape, paint and text, nothing that
 * runs or loads. Everything else goes, every on* handler included, whatever
 * its case. href is kept only as a link to something in the drawing (#id),
 * and style only as plain declarations (see keepAttribute).
 */
const KEPT_ATTRIBUTES = new Set([
  'id', 'class', 'version', 'xml:space', 'href', 'xlink:href', 'style',
  'viewBox', 'preserveAspectRatio', 'transform',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr',
  'width', 'height', 'd', 'points', 'pathLength', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust',
  'offset', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'stop-color', 'stop-opacity',
  'clipPathUnits', 'clip-path', 'clip-rule',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'color', 'display', 'visibility', 'paint-order', 'vector-effect', 'shape-rendering',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'text-anchor',
  'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'letter-spacing', 'word-spacing',
  'text-decoration', 'writing-mode',
]);

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text']);
/** Shapes in here are not drawn: they are paint, clipping or metadata. */
const UNDRAWN = new Set(['defs', 'clipPath', 'linearGradient', 'radialGradient', 'title', 'desc']);
const XML_ENTITIES = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

/**
 * The SVG in an answer: from its first <svg to the </svg> that closes it,
 * whether it sits in a code fence or in the open. An answer cut off before it
 * closed returns what there is, so the check reports it broken, not missing.
 */
function extractSvg(answer) {
  // A thinking model that ignores think:false writes its notes inline, and
  // they can mention <svg> long before the drawing.
  const text = String(answer ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const tags = /<svg(?=[\s>/])|<\/svg\s*>/gi;
  let start = -1;
  let depth = 0;
  for (let match = tags.exec(text); match; match = tags.exec(text)) {
    if (match[0][1] !== '/') {
      if (depth === 0) start = match.index;
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) return text.slice(start, match.index + match[0].length);
    }
  }
  if (start < 0) return null;
  return text.slice(start).replace(/\s*```[\s\S]*$/, '');
}

const OPEN_TAG = /<([A-Za-z][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const CLOSE_TAG = /<\/([A-Za-z][\w.:-]*)\s*>/y;
const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g;

/**
 * A strict little XML reader, enough to say whether the SVG parses.
 *
 * It fails where a browser's XML parser would: unbalanced or mismatched tags,
 * unquoted or duplicate attributes, a bare & or an HTML entity, a DTD. A
 * drawing that fails here would show as a broken image, so it scores as one.
 * Returns the root element as { name, attrs: [[name, value]], children }, or
 * null. Anything after the root closes is ignored.
 */
function parseSvg(source) {
  const text = String(source ?? '');
  const top = { name: '#document', attrs: [], children: [] };
  const stack = [top];
  let elements = 0;
  let index = 0;
  const addText = (value) => {
    if (XML_ENTITIES.test(value)) return false;
    stack[stack.length - 1].children.push(value);
    return true;
  };

  while (index < text.length) {
    if (stack.length === 1 && top.children.some((child) => typeof child !== 'string')) break;
    const lt = text.indexOf('<', index);
    if (lt < 0) {
      if (stack.length > 1) return null;
      break;
    }
    if (lt > index && stack.length > 1 && !addText(text.slice(index, lt))) return null;

    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) return null;
      index = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt);
      if (end < 0 || stack.length === 1) return null;
      stack[stack.length - 1].children.push(escapeXml(text.slice(lt + 9, end)));
      index = end + 3;
      continue;
    }
    // <?xml ...?> and <!DOCTYPE>. A DTD can declare entities, so one never parses.
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt);
      if (end < 0) return null;
      index = end + 2;
      continue;
    }
    if (text.startsWith('<!', lt)) return null;

    CLOSE_TAG.lastIndex = lt;
    const close = CLOSE_TAG.exec(text);
    if (close) {
      if (stack.length === 1 || stack[stack.length - 1].name !== close[1]) return null;
      stack.pop();
      index = CLOSE_TAG.lastIndex;
      continue;
    }

    OPEN_TAG.lastIndex = lt;
    const open = OPEN_TAG.exec(text);
    if (!open) return null;
    const attrs = [];
    for (const attribute of open[2].matchAll(ATTRIBUTE)) {
      const value = attribute[2] ?? attribute[3] ?? '';
      if (attrs.some(([name]) => name === attribute[1]) || XML_ENTITIES.test(value)) return null;
      attrs.push([attribute[1], value]);
    }
    elements += 1;
    if (elements > DRAWING_MAX_ELEMENTS || stack.length > DRAWING_MAX_DEPTH) return null;
    const element = { name: open[1], attrs, children: [] };
    stack[stack.length - 1].children.push(element);
    if (!open[3]) stack.push(element);
    index = OPEN_TAG.lastIndex;
  }

  const root = top.children.find((child) => typeof child !== 'string');
  if (stack.length > 1 || !root || root.name !== 'svg') return null;
  return root;
}

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * An attribute value as the browser will read it. Every check runs on this,
 * so `&#106;avascript:` is seen as the `javascript:` it spells.
 */
function decodeEntities(value) {
  return value.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (_entity, decimal, hex, named) => (
    named ? NAMED_ENTITIES[named] : String.fromCodePoint(Math.min(Number.parseInt(decimal ?? hex, decimal ? 10 : 16), 0x10ffff))
  ));
}

/** A link to something in this drawing, and nothing else. */
const FRAGMENT = /^#[A-Za-z_][\w.-]*$/;
/** Plain CSS declarations: no quotes, escapes, at-rules, comments or markup to hide anything in. */
const PLAIN_STYLE = /^[\w\s#%.,:;()!+-]*$/;

/**
 * Whether an attribute survives: it is on the list, and its value, decoded,
 * loads nothing and links to nothing outside the drawing. The one url() a
 * value may hold is a paint or clip from this drawing, url(#id).
 */
function keepAttribute(name, value) {
  if (!KEPT_ATTRIBUTES.has(name)) return false;
  const decoded = decodeEntities(value).trim();
  if (name === 'href' || name === 'xlink:href') return FRAGMENT.test(decoded);
  if (name === 'style' && !PLAIN_STYLE.test(decoded)) return false;
  const urls = decoded.match(/url\s*\([^)]*\)?/gi) ?? [];
  return urls.every((url) => /^url\(\s*#[A-Za-z_][\w.-]*\s*\)$/i.test(url));
}

/** Whether an element holds any text that is kept, from the parse rather than from markup. */
function hasText(node) {
  return node.children.some((child) => (typeof child === 'string'
    ? decodeEntities(child).trim() !== ''
    : KEPT_ELEMENTS.has(child.name) && hasText(child)));
}

function readViewBox(value) {
  const numbers = String(value ?? '').trim().split(/[\s,]+/).map(Number);
  return numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0;
}

/**
 * The cleaned drawing, rebuilt from the parse rather than edited in place, so
 * nothing the reader did not understand can survive into it. Counts the shapes
 * that would actually be drawn.
 */
function serializeSvg(root) {
  let shapes = 0;
  const hasViewBox = root.attrs.some(([name, value]) => name === 'viewBox' && readViewBox(value));

  const write = (node, undrawn) => {
    if (typeof node === 'string') return node;
    if (!KEPT_ELEMENTS.has(node.name)) return '';
    const isRoot = node === root;
    const hidden = undrawn || UNDRAWN.has(node.name);
    const children = node.children.map((child) => write(child, hidden)).join('');
    if (!hidden && SHAPES.has(node.name) && (node.name !== 'text' || hasText(node))) shapes += 1;
    const attrs = node.attrs
      // With a viewBox, the drawing's own width and height are dropped so it
      // scales to whatever frame shows it.
      .filter(([name, value]) => keepAttribute(name, value) && !(isRoot && hasViewBox && (name === 'width' || name === 'height')))
      .map(([name, value]) => ` ${name}="${value.replace(/"/g, '&quot;')}"`)
      .join('');
    // An <img> draws an SVG only when it says which namespace it is in, and
    // models often leave that out. xlink is declared too, so a kept
    // xlink:href="#..." can never be an unbound prefix that breaks the image.
    const ns = isRoot ? ` xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"` : '';
    return `<${node.name}${ns}${attrs}>${children}</${node.name}>`;
  };

  const svg = write(root, false);
  return { svg, shapes, hasViewBox };
}

/** The cleaned SVG, or null when it does not parse. */
function sanitizeSvg(svg) {
  const root = parseSvg(svg);
  return root ? serializeSvg(root).svg : null;
}

const PROBLEMS = {
  missing: { score: 0, note: 'No drawing: the answer had no SVG in it.' },
  'too-big': { score: 10, note: `No drawing: the SVG was over the ${DRAWING_SVG_MAX_CHARS.toLocaleString('en-US')}-character limit.` },
  broken: { score: 10, note: 'No drawing: the SVG does not parse, usually because it was cut off before it ended.' },
  empty: { score: 5, note: 'No drawing: the SVG has nothing in it to see.' },
  'no-viewbox': { score: 30, note: 'Scored by rule: the SVG has no viewBox, which the question asked for.' },
};

/**
 * The checks every drawing gets before a judge sees it: there is an SVG, it is
 * within the size cap, it parses, it draws something, and it has the viewBox
 * the question asked for. A failed check is a score on its own, with no judge.
 *
 * `svg` is the cleaned drawing whenever there is one to show, including a
 * drawing that parses but has no viewBox. `score` for a drawing that passed is
 * a placeholder: it is marked unjudged until a judge grades it.
 */
function checkDrawing(answer) {
  const fail = (problem, svg = null) => ({ ok: false, problem, score: PROBLEMS[problem].score, svg, note: PROBLEMS[problem].note });
  const raw = extractSvg(answer);
  if (!raw) return fail('missing');
  if (raw.length > DRAWING_SVG_MAX_CHARS) return fail('too-big');
  const root = parseSvg(raw);
  if (!root) return fail('broken');
  const { svg, shapes, hasViewBox } = serializeSvg(root);
  if (shapes === 0) return fail('empty');
  if (!hasViewBox) return fail('no-viewbox', svg);
  return { ok: true, problem: null, score: 50, svg, note: '' };
}

/**
 * How the judge sees a drawing: as the picture, when it is a local Ollama
 * model that reports the `vision` capability, or as the SVG code otherwise.
 * LM Studio and cloud judges get the code: LM Studio reports what a model can
 * see differently, and the cloud judge is sent text only.
 */
function drawingJudgeMode({ local, provider, capabilities }) {
  const sees = Array.isArray(capabilities) && capabilities.includes('vision');
  return local && provider === 'ollama' && sees ? 'picture' : 'code';
}

/** The line under a drawing that says how its score was reached. */
function drawingNote({ check, judgedFrom, judged, reason }) {
  if (!check.ok) return check.note;
  if (!judged) return 'Not marked: no judge could look at it, so it does not count toward the score.';
  const how = judgedFrom === 'picture'
    ? 'Judged from the picture.'
    : 'Judged from the SVG code, because the judge cannot see pictures.';
  return reason ? `${how} ${reason}` : how;
}

module.exports = {
  DRAWING_ANSWER_TOKENS,
  DRAWING_TIMEOUT_MS,
  DRAWING_SVG_MAX_CHARS,
  KEPT_ELEMENTS,
  KEPT_ATTRIBUTES,
  extractSvg,
  parseSvg,
  sanitizeSvg,
  checkDrawing,
  drawingJudgeMode,
  drawingNote,
};
