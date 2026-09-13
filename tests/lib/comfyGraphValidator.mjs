// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Refusing a ComfyUI graph the way ComfyUI would, but in a test.
 *
 * A video graph that names a node class this ComfyUI does not have, forgets a
 * required input, or wires a LATENT into a slot that wants a MODEL, fails the
 * moment it is submitted — which for a lineup model is after a 50 GB download
 * and a cold start. This reads the graph against /object_info from a pinned
 * ComfyUI build and lists everything that build would reject.
 *
 * Two things the snapshot cannot be taken at its word on:
 *
 * It came from a working machine, so it lists that machine's custom nodes —
 * ComfyUI-GGUF, and videobench's own — beside the stock ones. A graph that
 * validates against it could still need a node the user never installed. So
 * each class is also checked for where it came from: custom nodes are refused,
 * and so are ComfyUI's API nodes, which hand the work to a paid service off the
 * machine.
 *
 * And its file pickers list what that machine had on disk: one diffusion
 * model, three VAEs. Those lists say nothing about what another machine may
 * load, so a picker is recognised by its contents and its value left alone.
 * Which files a graph loads is checked against RigMatch's own catalogue
 * instead.
 *
 * /object_info describes an input three ways, and this reads all three: a
 * legacy combo is [[...values]], a typed combo is ["COMBO", {options}], and a
 * dynamic combo is ["COMFY_DYNAMICCOMBO_V3", {options: [{key, inputs}]}].
 */

const PRIMITIVES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN']);
const MODEL_FILE = /\.(safetensors|sft|ckpt|pt|pt2|pth|bin|pkl|gguf)$/i;

/** [nodeId, outputIndex] — the only shape a link takes in API format. */
export function isLink(value) {
  return Array.isArray(value) && value.length === 2
    && typeof value[0] === 'string' && Number.isInteger(value[1]);
}

/** A list of files on the snapshot machine, as opposed to a list of settings. */
function isFilePicker(values) {
  return values.length === 0 || values.some((value) => MODEL_FILE.test(String(value)));
}

/** Why a class would not be on the user's ComfyUI, or not run on it; null when it would. */
function foreignOrigin(def) {
  const module = String(def.python_module ?? '');
  if (module.startsWith('custom_nodes')) {
    return `is a custom node (${module.slice('custom_nodes.'.length)}), which a stock ComfyUI does not have`;
  }
  if (module.startsWith('comfy_api_nodes')) {
    return 'is an API node, which sends the work to a paid service off this machine';
  }
  return null;
}

function readSpec(spec) {
  if (Array.isArray(spec[0])) return { kind: 'combo', values: spec[0] };
  const type = String(spec[0]);
  const options = spec[1] ?? {};
  if (type === 'COMBO') return { kind: 'combo', values: options.options ?? [] };
  if (type === 'COMFY_DYNAMICCOMBO_V3') {
    return { kind: 'combo', values: (options.options ?? []).map((option) => option.key) };
  }
  // "FLOAT,INT" and friends: any of the listed types will do.
  return { kind: 'typed', types: type.split(','), options };
}

function literalMatches(type, value) {
  if (type === 'STRING') return typeof value === 'string';
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  if (type === 'INT') return Number.isInteger(value);
  if (type === 'FLOAT') return typeof value === 'number' && Number.isFinite(value);
  return false;
}

/**
 * Everything a stock ComfyUI of this build would reject in the graph, or
 * refuse to run locally. Empty means it would accept the graph as submitted.
 */
export function validateGraph(graph, objectInfo) {
  const errors = [];

  for (const [id, node] of Object.entries(graph)) {
    const where = `node ${id} (${node.class_type})`;
    const def = objectInfo[node.class_type];
    if (!def) {
      errors.push(`${where}: this ComfyUI has no such node class`);
      continue;
    }
    const foreign = foreignOrigin(def);
    if (foreign) errors.push(`${where} ${foreign}`);

    const required = def.input?.required ?? {};
    const optional = def.input?.optional ?? {};
    const inputs = node.inputs ?? {};

    for (const name of Object.keys(required)) {
      if (!(name in inputs)) errors.push(`${where}: missing required input "${name}"`);
    }

    for (const [name, value] of Object.entries(inputs)) {
      const spec = required[name] ?? optional[name];
      if (!spec) {
        errors.push(`${where}: has no input called "${name}"`);
        continue;
      }
      const read = readSpec(spec);

      if (isLink(value)) {
        const [sourceId, index] = value;
        const source = graph[sourceId];
        if (!source) {
          errors.push(`${where}.${name}: links to node ${sourceId}, which is not in the graph`);
          continue;
        }
        const outputs = objectInfo[source.class_type]?.output ?? [];
        if (index >= outputs.length) {
          errors.push(`${where}.${name}: links to output ${index} of node ${sourceId} (${source.class_type}), which has ${outputs.length}`);
          continue;
        }
        if (read.kind === 'combo') {
          errors.push(`${where}.${name}: a choice list was given a link`);
          continue;
        }
        const produced = outputs[index];
        if (!read.types.includes('*') && !read.types.includes(produced)) {
          errors.push(`${where}.${name}: wants ${read.types.join(' or ')}, but node ${sourceId} (${source.class_type}) output ${index} is ${produced}`);
        }
        continue;
      }

      if (read.kind === 'combo') {
        if (!isFilePicker(read.values) && !read.values.includes(value)) {
          errors.push(`${where}.${name}: ${JSON.stringify(value)} is not one of ${JSON.stringify(read.values)}`);
        }
        continue;
      }

      const primitive = read.types.filter((type) => PRIMITIVES.has(type));
      if (primitive.length === 0) {
        // V3 wrapper types that are not links are left alone; a plain link type
        // given a literal is exactly the mistake this is here to catch.
        if (read.types.every((type) => type.startsWith('COMFY_'))) continue;
        errors.push(`${where}.${name}: wants a ${read.types.join(' or ')} link, but was given ${JSON.stringify(value)}`);
        continue;
      }
      if (!primitive.some((type) => literalMatches(type, value))) {
        errors.push(`${where}.${name}: ${JSON.stringify(value)} is not a ${primitive.join(' or ')}`);
        continue;
      }
      if (typeof value === 'number') {
        const { min, max } = read.options;
        if (typeof min === 'number' && value < min) errors.push(`${where}.${name}: ${value} is below the minimum ${min}`);
        if (typeof max === 'number' && value > max) errors.push(`${where}.${name}: ${value} is above the maximum ${max}`);
      }
    }
  }

  return errors;
}
