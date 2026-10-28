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

/**
 * Answer tokens for a drawing. Measured on nine models (2026-10-24, RTX 4070):
 * every pelican that ended on its own took 142 to 960 tokens, and the one that
 * did not end (llama3.2:3b) loops whatever the cap. 1,900 is twice the longest,
 * and with the question (72 to 91 tokens) it still fits the run's 2,048-token
 * context, so a drawing never makes Ollama reload the model. At 1,200, answers
 * to the older, wordier prompt were cut off.
 */
const DRAWING_ANSWER_TOKENS = 1900;
/**
 * The real limit on a slow PC: a drawing that takes longer than this scores as
 * no drawing and the show goes on. At 21 tokens a second, 1,900 tokens take 90 s.
 */
const DRAWING_TIMEOUT_MS = 90000;
/** Far more than 1,200 tokens can write, so only an imported or edited answer meets it. */
const DRAWING_SVG_MAX_CHARS = 32000;
/** The whole answer, checked before anything reads it: room for the SVG and the chat around it. */
const DRAWING_ANSWER_MAX_CHARS = 2 * DRAWING_SVG_MAX_CHARS;
/** Copies of a shape a drawing may place with <use>: a bicycle's wheels, not a render bomb. */
const DRAWING_MAX_USES = 64;
/** Past these the SVG is a render bomb rather than a picture. */
const DRAWING_MAX_ELEMENTS = 2000;
const DRAWING_MAX_DEPTH = 48;
/**
 * The most time the parse and the clean may take on one answer. A real drawing
 * takes a few milliseconds and the work grows in step with its size, so this
 * is a backstop, not a limit a picture meets: the main process runs this, and
 * no answer, however it is shaped, may hold it for longer. It is checked
 * between steps. An answer that runs past it scores as too complicated to
 * check.
 */
const DRAWING_CLEAN_BUDGET_MS = 500;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * The elements a drawing keeps, matched exactly (SVG names are case-sensitive).
 * Anything else goes with everything inside it: script, style (its simple rules
 * are copied onto the elements first, see addStyleRules), foreignObject (HTML
 * inside the SVG), image (it loads other content), a, and the animate family,
 * set included (they can rewrite an href). use stays only as a copy of a shape
 * or symbol in the same drawing (see keepUse). symbol, marker, pattern and mask
 * are kept as things the drawing refers to by #id, never drawn on their own.
 */
const KEPT_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'use', 'symbol',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'marker', 'pattern', 'mask',
]);

/**
 * The attributes a kept element keeps: shape, paint and text, nothing that
 * runs or loads. Everything else goes, every on* handler included, whatever
 * its case. href is kept only as a link to something in the drawing (#id),
 * and style is rebuilt from declarations that pass cleanDeclaration.
 */
const KEPT_ATTRIBUTES = new Set([
  'id', 'class', 'version', 'xml:space', 'href', 'xlink:href', 'style',
  'viewBox', 'preserveAspectRatio', 'transform',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr',
  'width', 'height', 'd', 'points', 'pathLength', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust',
  'offset', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'stop-color', 'stop-opacity',
  'clipPathUnits', 'clip-path', 'clip-rule',
  'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient',
  'patternUnits', 'patternContentUnits', 'patternTransform', 'mask', 'maskUnits', 'maskContentUnits',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'color', 'display', 'visibility', 'paint-order', 'vector-effect', 'shape-rendering',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'text-anchor',
  'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'letter-spacing', 'word-spacing',
  'text-decoration', 'writing-mode',
]);

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text']);
/** Shapes in here are not drawn where they stand: they are paint, clipping, metadata, or drawn by reference. */
const UNDRAWN = new Set(['defs', 'clipPath', 'linearGradient', 'radialGradient', 'title', 'desc', 'symbol', 'marker', 'pattern', 'mask']);
const XML_ENTITIES = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

/**
 * The answer without the notes a thinking model that ignores think:false
 * writes inline, which can mention <svg> long before the drawing. Found by
 * position, so it costs one pass however the answer is shaped.
 */
function withoutThinking(text) {
  let kept = '';
  let at = 0;
  for (let open = text.indexOf('<think>'); open >= 0; open = text.indexOf('<think>', at)) {
    const close = text.indexOf('</think>', open);
    if (close < 0) break;
    kept += text.slice(at, open);
    at = close + '</think>'.length;
  }
  return kept + text.slice(at);
}

/** The inside of each ``` code block, the last one running to the end when it never closes. */
function fencedBlocks(text) {
  const blocks = [];
  for (let at = text.indexOf('```'); at >= 0;) {
    const body = text.indexOf('\n', at);
    if (body < 0) break;
    const close = text.indexOf('```', body);
    blocks.push(text.slice(body + 1, close < 0 ? text.length : close));
    if (close < 0) break;
    at = text.indexOf('```', close + 3);
  }
  return blocks;
}

/**
 * The earliest complete <svg>...</svg> in some text, or, when none closes,
 * everything from the first <svg. Each </svg> closes the nearest open <svg,
 * so a mention that never closes ("one self-contained <svg> element") is
 * stepped over instead of swallowing the drawing after it.
 */
function findSvg(text) {
  const tags = /<svg(?=[\s>/])|<\/svg\s*>/gi;
  const open = [];
  let first = -1;
  let found = null;
  for (let match = tags.exec(text); match; match = tags.exec(text)) {
    if (match[0][1] !== '/') {
      if (first < 0) first = match.index;
      open.push(match.index);
    } else if (open.length > 0) {
      const start = open.pop();
      if (!found || start < found.start) found = { start, end: match.index + match[0].length };
    }
  }
  if (found) return text.slice(found.start, found.end);
  return first < 0 ? null : text.slice(first).trimEnd();
}

/**
 * The SVG in an answer. A code block that holds one is where the drawing is,
 * so it is read first; otherwise the whole answer. An answer cut off before
 * the SVG closed returns what there is, so the check reports it broken, not
 * missing.
 */
function extractSvg(answer) {
  const text = withoutThinking(String(answer ?? ''));
  const block = fencedBlocks(text).find((inside) => /<svg/i.test(inside));
  return findSvg(block ?? text);
}

/** What the cleaner throws when an answer outruns DRAWING_CLEAN_BUDGET_MS. */
class OutOfBudget extends Error {}

/**
 * A clock for one answer: call it between steps and it throws OutOfBudget
 * once `ms` have gone. It reads the time on the first call and then every
 * 32nd, so the check costs less than the steps it sits between.
 */
function newBudget(ms) {
  const deadline = Date.now() + ms;
  let calls = 0;
  return () => {
    calls += 1;
    if (calls % 32 === 1 && Date.now() >= deadline) throw new OutOfBudget('The drawing took too long to check.');
  };
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
 * null. Anything after the root closes is ignored. Throws OutOfBudget when
 * `tick` says the answer has taken too long (parseSvg below catches it).
 */
function readSvg(source, tick) {
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
    tick();
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
    const names = new Set();
    for (const attribute of open[2].matchAll(ATTRIBUTE)) {
      const value = attribute[2] ?? attribute[3] ?? '';
      if (names.has(attribute[1]) || XML_ENTITIES.test(value)) return null;
      names.add(attribute[1]);
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

/** The one url() a value may hold: a paint or clip from this drawing, url(#id). */
function onlyLocalUrls(value) {
  return (value.match(/url\s*\([^)]*\)?/gi) ?? []).every((url) => /^url\(\s*#[A-Za-z_][\w.-]*\s*\)$/i.test(url));
}

/**
 * Whether an attribute survives: it is on the list, and its value, decoded,
 * loads nothing and links to nothing outside the drawing. style is handled
 * apart, declaration by declaration (styleFor).
 */
function keepAttribute(name, value) {
  if (name === 'style' || !KEPT_ATTRIBUTES.has(name)) return false;
  const decoded = decodeEntities(value).trim();
  if (name === 'href' || name === 'xlink:href') return FRAGMENT.test(decoded);
  return onlyLocalUrls(decoded);
}

/** What a drawing may set through CSS: paint, stroke, text and placement. */
const STYLE_PROPERTIES = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'color',
  'display', 'visibility', 'stop-color', 'stop-opacity', 'clip-path', 'clip-rule', 'paint-order',
  'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'letter-spacing', 'transform', 'marker-start', 'marker-mid', 'marker-end', 'mask',
]);
/**
 * Colours, numbers with units, keywords, and calls such as rgb() or rotate():
 * no quotes, escapes, at-signs, colons, slashes or braces to hide anything in.
 */
const STYLE_VALUE = /^[\w\s#%.,()+-]+$/;

/** One declaration as it may be kept, [property, value], or null. */
function cleanDeclaration(property, rawValue) {
  const name = property.trim().toLowerCase();
  if (!STYLE_PROPERTIES.has(name)) return null;
  let value = rawValue.trim();
  if (value.toLowerCase().endsWith('!important')) value = value.slice(0, -'!important'.length).trim();
  // Font names are the one value models quote, and a quote is never needed.
  if (name === 'font-family') value = value.replace(/["']/g, '');
  if (!STYLE_VALUE.test(value) || /expression|javascript/i.test(value) || !onlyLocalUrls(value)) return null;
  return [name, value];
}

/**
 * The kept declarations in a block of CSS ("fill: red; stroke: blue"), each
 * property once: it stays where it first appears and takes the last value, as
 * it would in a browser. A looping model can repeat one declaration
 * thousands of times, and what follows does work for every one it keeps.
 */
function readDeclarations(css) {
  const declarations = new Map();
  for (const part of css.split(';')) {
    const colon = part.indexOf(':');
    const declaration = colon > 0 ? cleanDeclaration(part.slice(0, colon), part.slice(colon + 1)) : null;
    if (declaration) declarations.set(declaration[0], declaration[1]);
  }
  return [...declarations];
}

/** CSS without its comments, found by position. */
function withoutComments(css) {
  let kept = '';
  let at = 0;
  for (let open = css.indexOf('/*'); open >= 0; open = css.indexOf('/*', at)) {
    const close = css.indexOf('*/', open + 2);
    kept += css.slice(at, open);
    at = close < 0 ? css.length : close + 2;
  }
  return kept + css.slice(at);
}

const SPECIFICITY = { '#': 3, '.': 2, '': 1 };
const SIMPLE_SELECTOR = /^([.#]?)([A-Za-z_][\w-]*)$/;
/**
 * Rules are ranked by specificity, then by where they come in the drawing, as
 * one number: RULE_SPAN is more rules than 32,000 characters can hold, and a
 * rule never keeps more than DECLARATION_SPAN declarations (each property once,
 * and STYLE_PROPERTIES has fewer than that).
 */
const RULE_SPAN = 1e6;
const DECLARATION_SPAN = 64;

/**
 * Every rule in a drawing's <style> blocks that it can keep: ones that select
 * simply, by element, .class or #id. At-rules, nested blocks and any other
 * selector are left out. The <style> element itself is never kept; these rules
 * are copied onto the elements they select instead, because models colour
 * whole drawings this way, and without them every shape comes out black.
 *
 * The rules are folded as they are read, into one table per selector that
 * holds each property it sets once: where it first appears, which rule set it
 * last, and that rule's value. An element then looks up the few selectors that
 * match it (styleFor), however many rules the drawing has. Reading rule by
 * rule for every element cost selectors x declarations x elements, which took
 * minutes on a 20,000-character <style> of repeated selectors.
 */
function newStyleSheet() {
  return { tables: new Map(), rules: 0 };
}

function addStyleRules(sheet, css, tick) {
  for (const chunk of withoutComments(css).split('}')) {
    tick();
    const brace = chunk.indexOf('{');
    if (brace < 0) continue;
    const selectors = chunk.slice(0, brace);
    const body = chunk.slice(brace + 1);
    if (selectors.includes('@') || body.includes('{')) continue;
    const declarations = readDeclarations(body);
    if (declarations.length === 0) continue;
    for (const selector of selectors.split(',')) {
      tick();
      const simple = SIMPLE_SELECTOR.exec(selector.trim());
      if (!simple) continue;
      const key = simple[1] + simple[2];
      let table = sheet.tables.get(key);
      if (!table) {
        table = new Map();
        sheet.tables.set(key, table);
      }
      const order = sheet.rules;
      sheet.rules += 1;
      declarations.forEach(([property, value], index) => {
        const entry = table.get(property);
        if (entry) {
          entry.last = order;
          entry.value = value;
        } else {
          table.set(property, { first: order * DECLARATION_SPAN + index, last: order, value });
        }
      });
    }
  }
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

const attribute = (node, name) => {
  const found = node.attrs.find(([key]) => key === name);
  return found ? decodeEntities(found[1]).trim() : '';
};

/** The kept elements under a node, the node first. */
function* keptElements(node) {
  yield node;
  for (const child of node.children) {
    if (typeof child !== 'string' && KEPT_ELEMENTS.has(child.name)) yield* keptElements(child);
  }
}

/**
 * The cleaned drawing, rebuilt from the parse rather than edited in place, so
 * nothing the reader did not understand can survive into it. Counts the shapes
 * that would actually be drawn. Throws OutOfBudget when `tick` says it has
 * taken too long (sanitizeSvg below catches it).
 */
function serializeSvg(root, tick) {
  let shapes = 0;
  let uses = 0;
  const hasViewBox = root.attrs.some(([name, value]) => name === 'viewBox' && readViewBox(value));
  const elements = [...keptElements(root)];
  const byId = new Map();
  for (const element of elements) {
    const id = attribute(element, 'id');
    if (id && !byId.has(id)) byId.set(id, element);
  }
  const sheet = newStyleSheet();
  for (const element of elements) {
    for (const child of element.children) {
      if (typeof child !== 'string' && child.name === 'style') {
        addStyleRules(sheet, decodeEntities(child.children.filter((part) => typeof part === 'string').join('')), tick);
      }
    }
  }

  /**
   * The element's style: the rules that select it, the most specific last,
   * then its own style attribute, which wins as it does in a browser. Rules
   * beat presentation attributes there too, so carrying them in style keeps
   * the drawing as the model drew it.
   *
   * A property keeps the place where the first matching rule set it and the
   * value of the one that wins, which is the rule with the highest
   * specificity, and among those the latest. That is what applying every
   * matching rule in order would leave, read from the sheet's tables instead
   * of by going through the rules.
   */
  const styleFor = (node) => {
    tick();
    const declarations = new Map();
    if (sheet.tables.size > 0) {
      const wins = new Map();
      const firsts = new Map();
      const consider = (kind, name) => {
        const table = sheet.tables.get(kind + name);
        if (!table) return;
        const specificity = SPECIFICITY[kind];
        for (const [property, entry] of table) {
          const rank = specificity * RULE_SPAN + entry.last;
          if (!(wins.get(property)?.rank > rank)) wins.set(property, { rank, value: entry.value });
          const first = specificity * RULE_SPAN * DECLARATION_SPAN + entry.first;
          if (!(firsts.get(property) < first)) firsts.set(property, first);
        }
      };
      consider('', node.name);
      const id = attribute(node, 'id');
      if (id) consider('#', id);
      for (const name of new Set(attribute(node, 'class').split(/\s+/))) consider('.', name);
      for (const [property] of [...firsts].sort((a, b) => a[1] - b[1])) declarations.set(property, wins.get(property).value);
    }
    for (const [name, value] of readDeclarations(attribute(node, 'style'))) declarations.set(name, value);
    return [...declarations].map(([name, value]) => `${name}: ${value}`).join('; ');
  };

  /** Whether a kept element is a <use> or holds one, worked out once per element. */
  const holdsUse = new Map();
  const containsUse = (node) => {
    let found = holdsUse.get(node);
    if (found === undefined) {
      found = node.name === 'use' || node.children.some((child) => typeof child !== 'string' && KEPT_ELEMENTS.has(child.name) && containsUse(child));
      holdsUse.set(node, found);
    }
    return found;
  };

  /**
   * A <use> stays only as a copy of a kept shape or group in this drawing
   * that holds no <use> of its own (so copies cannot copy copies, or loop),
   * and only so many times.
   */
  const keepUse = (node) => {
    const href = attribute(node, 'href') || attribute(node, 'xlink:href');
    const target = FRAGMENT.test(href) ? byId.get(href.slice(1)) : undefined;
    if (!target || target.name === 'svg' || containsUse(target)) return false;
    uses += 1;
    return uses <= DRAWING_MAX_USES;
  };

  const write = (node, undrawn) => {
    if (typeof node === 'string') return node;
    tick();
    if (!KEPT_ELEMENTS.has(node.name) || (node.name === 'use' && !keepUse(node))) return '';
    const isRoot = node === root;
    const hidden = undrawn || UNDRAWN.has(node.name);
    const children = node.children.map((child) => write(child, hidden)).join('');
    if (!hidden && (SHAPES.has(node.name) || node.name === 'use') && (node.name !== 'text' || hasText(node))) shapes += 1;
    const style = styleFor(node);
    const attrs = node.attrs
      // With a viewBox, the drawing's own width and height are dropped so it
      // scales to whatever frame shows it.
      .filter(([name, value]) => keepAttribute(name, value) && !(isRoot && hasViewBox && (name === 'width' || name === 'height')))
      .map(([name, value]) => ` ${name}="${value.replace(/"/g, '&quot;')}"`)
      .join('') + (style ? ` style="${style}"` : '');
    // An <img> draws an SVG only when it says which namespace it is in, and
    // models often leave that out. xlink is declared too, so a kept
    // xlink:href="#..." can never be an unbound prefix that breaks the image.
    const ns = isRoot ? ` xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"` : '';
    return `<${node.name}${ns}${attrs}>${children}</${node.name}>`;
  };

  const svg = write(root, false);
  return { svg, shapes, hasViewBox };
}

/** `read`, or null when the answer outruns its time budget (see DRAWING_CLEAN_BUDGET_MS). */
function withinBudget(read) {
  try {
    return read(newBudget(DRAWING_CLEAN_BUDGET_MS));
  } catch (error) {
    if (error instanceof OutOfBudget) return null;
    throw error;
  }
}

/** The SVG's root element, or null when it does not parse in time. */
function parseSvg(source) {
  return withinBudget((tick) => readSvg(source, tick));
}

/** The cleaned SVG, or null when it does not parse in time. */
function sanitizeSvg(svg) {
  return withinBudget((tick) => {
    const root = readSvg(svg, tick);
    return root ? serializeSvg(root, tick).svg : null;
  });
}

// Short enough to read on the tile that stands in for the picture.
const PROBLEMS = {
  missing: { score: 0, note: 'No drawing: the answer had no SVG.' },
  'too-big': { score: 10, note: `No drawing: over the ${DRAWING_SVG_MAX_CHARS.toLocaleString('en-US')}-character limit.` },
  broken: { score: 10, note: 'No drawing: the SVG was cut off or does not parse.' },
  'too-complex': { score: 10, note: 'No drawing: the SVG was too complicated to check.' },
  empty: { score: 5, note: 'No drawing: the SVG draws nothing.' },
  'no-viewbox': { score: 30, note: 'Scored by rule: the SVG has no viewBox, which the question asked for.' },
  // Not a finding about the drawing: a slow PC, not a bad answer. The run
  // leaves it unmarked and out of stability, so slowness is not charged twice
  // (it is already in the speed score).
  timeout: { score: 0, note: `Ran out of time at ${DRAWING_TIMEOUT_MS / 1000} s, so it is not marked.` },
};

/** What the run records for a drawing still unfinished at its deadline. */
function drawingTimedOut() {
  return { ok: false, problem: 'timeout', score: PROBLEMS.timeout.score, svg: null, note: PROBLEMS.timeout.note };
}

/** The last answer checked and what the check found (checkDrawing). */
let lastCheck = null;

/**
 * The checks every drawing gets before a judge sees it: there is an SVG, it is
 * within the size cap, it parses, it draws something, and it has the viewBox
 * the question asked for. A failed check is a score on its own, with no judge.
 *
 * `svg` is the cleaned drawing whenever there is one to show, including a
 * drawing that parses but has no viewBox. `score` for a drawing that passed is
 * a placeholder: it is marked unjudged until a judge grades it.
 *
 * An answer that takes longer than `budgetMs` to read and clean fails as
 * too complicated to check, so no answer can hold the caller. Only a test
 * passes its own budget; such a result is not remembered.
 */
function checkDrawing(answer, budgetMs = DRAWING_CLEAN_BUDGET_MS) {
  const text = String(answer ?? '');
  if (budgetMs !== DRAWING_CLEAN_BUDGET_MS) return checkDrawingText(text, budgetMs);
  // The run asks this of the same answer three times (the scorer, the
  // grader and the run itself), so the last answer is remembered.
  if (lastCheck?.answer === text) return lastCheck.result;
  const result = checkDrawingText(text, budgetMs);
  lastCheck = { answer: text, result };
  return result;
}

function checkDrawingText(text, budgetMs) {
  const fail = (problem, svg = null) => ({ ok: false, problem, score: PROBLEMS[problem].score, svg, note: PROBLEMS[problem].note });
  // Length first, before anything reads the answer.
  if (text.length > DRAWING_ANSWER_MAX_CHARS) return fail('too-big');
  const raw = extractSvg(text);
  if (!raw) return fail('missing');
  if (raw.length > DRAWING_SVG_MAX_CHARS) return fail('too-big');
  try {
    const tick = newBudget(budgetMs);
    const root = readSvg(raw, tick);
    if (!root) return fail('broken');
    const { svg, shapes, hasViewBox } = serializeSvg(root, tick);
    if (shapes === 0) return fail('empty');
    if (!hasViewBox) return fail('no-viewbox', svg);
    return { ok: true, problem: null, score: 50, svg, note: '' };
  } catch (error) {
    if (error instanceof OutOfBudget) return fail('too-complex');
    throw error;
  }
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
  // Said of the route, not the judge: a model that cannot see, a cloud or LM
  // Studio judge, and a picture that failed to draw are all sent text.
  const how = judgedFrom === 'picture'
    ? 'Judged from the picture.'
    : 'Judged from the SVG code: this judge was sent text, not the picture.';
  return reason ? `${how} ${reason}` : how;
}

module.exports = {
  DRAWING_ANSWER_TOKENS,
  DRAWING_TIMEOUT_MS,
  DRAWING_SVG_MAX_CHARS,
  DRAWING_ANSWER_MAX_CHARS,
  DRAWING_MAX_USES,
  DRAWING_CLEAN_BUDGET_MS,
  KEPT_ELEMENTS,
  KEPT_ATTRIBUTES,
  extractSvg,
  parseSvg,
  sanitizeSvg,
  checkDrawing,
  drawingTimedOut,
  drawingJudgeMode,
  drawingNote,
};
