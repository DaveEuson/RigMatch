// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The tool-use test: whether a model acts when asked to, rather than writing
 * about acting.
 *
 * The tools-and-automations goal was crowned on JSON questions ("Return only
 * valid JSON for this request..."), which measure whether a model can format
 * an answer, not whether it can drive a tool. Agent models such as Odysseus's
 * Ajax are built for the second: search, open a page, add to the calendar,
 * send an email. Ollama passes a model real tool definitions through /api/chat
 * and returns the calls it makes, so each question here hands the model the
 * same small kit and checks the call: the right tool, with the right details.
 *
 * Two questions check the opposite, which matters as much for an agent left
 * running: a question that needs no tool, and a request missing the one detail
 * the tool needs. Calling a tool there is the failure, and inventing an email
 * address to fill the gap is the worst one.
 *
 * Three questions take more than one step, the way an agent's work does:
 * search, read what came back, then act on it. RigMatch plays the tool's part,
 * handing back a fixed result after each correct call, and checks the next
 * call against it: an email sent to the address the page listed, not one the
 * model made up.
 *
 * Everything here is checked by rule, never by a judge model: whether a call
 * names the right tool and carries the right date is a fact, not an opinion.
 */

const tool = (name, description, properties, required) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

const AGENT_TOOLS = Object.freeze([
  tool('web_search', 'Search the web and return the top results.', {
    query: { type: 'string', description: 'What to search for' },
  }, ['query']),
  tool('open_page', 'Open a web page and return its text.', {
    url: { type: 'string', description: 'The full address of the page' },
  }, ['url']),
  tool('add_calendar_event', "Add an event to the user's calendar.", {
    title: { type: 'string' },
    date: { type: 'string', description: 'YYYY-MM-DD' },
    time: { type: 'string', description: 'HH:MM, 24-hour' },
    duration_minutes: { type: 'integer' },
  }, ['title', 'date', 'time']),
  tool('send_email', 'Send an email from the user.', {
    to: { type: 'string', description: 'Email address' },
    subject: { type: 'string' },
    body: { type: 'string' },
  }, ['to', 'subject', 'body']),
  tool('add_task', "Add a task to the user's to-do list.", {
    title: { type: 'string' },
    due: { type: 'string', description: 'YYYY-MM-DD' },
  }, ['title']),
  tool('set_device', 'Control a smart-home device.', {
    device: { type: 'string', description: 'Which device, for example "kitchen lights"' },
    action: { type: 'string', enum: ['on', 'off', 'dim'] },
    level: { type: 'integer', description: 'Brightness percent, for dim' },
  }, ['device', 'action']),
]);

const text = (value) => (value === undefined || value === null ? '' : String(value)).trim();
const has = (needle) => (value) => text(value).toLowerCase().includes(needle);
const is = (expected) => (value) => text(value).toLowerCase() === expected;
// Models send numbers as text often enough ("45", "30%") that rejecting them
// would mark the schema instead of the decision.
const number = (expected) => (value) => Number.parseFloat(text(value)) === expected;
const url = (expected) => (value) => text(value).replace(/\/+$/, '').toLowerCase() === expected;

/**
 * The questions, matched to their checks by prompt text: a question's id gains
 * a round suffix when a run repeats the set, and its prompt does not change.
 * src/benchmarkSuite.ts carries the same prompts in the Tools & Automations
 * set, and tests/agentTools.test.mjs keeps the two in step.
 *
 * Each task is a list of steps. A step's `result` is what the tool hands back
 * when the model makes that step's call; the last step has none. An argument
 * key written "a|b" passes when either field passes.
 */
const AGENT_TASKS = Object.freeze([
  {
    prompt: "Search the web for the Louvre's opening hours this week.",
    steps: [{ expect: { tool: 'web_search', args: { query: has('louvre') } } }],
  },
  {
    prompt: 'Add a dentist appointment to my calendar on 2026-10-14 at 15:30 for 45 minutes.',
    steps: [{
      expect: {
        tool: 'add_calendar_event',
        args: { title: has('dentist'), date: is('2026-10-14'), time: is('15:30'), duration_minutes: number(45) },
      },
    }],
  },
  {
    prompt: 'Email sam@example.com with the subject "Running late" and tell them I will be 10 minutes late.',
    steps: [{
      expect: {
        tool: 'send_email',
        args: { to: is('sam@example.com'), subject: has('running late'), body: has('10') },
      },
    }],
  },
  {
    // "Remind me to..." read as a calendar event to two models out of seven, a
    // fair reading. A to-do list is named so the test is of the call, not of
    // guessing which tool the wording meant.
    prompt: 'Put "renew my passport" on my to-do list, due 2026-11-01.',
    steps: [{ expect: { tool: 'add_task', args: { title: has('passport'), due: is('2026-11-01') } } }],
  },
  {
    prompt: 'Dim the kitchen lights to 30%.',
    steps: [{ expect: { tool: 'set_device', args: { device: has('kitchen'), action: is('dim'), level: number(30) } } }],
  },
  {
    prompt: 'What is 12 multiplied by 12? Answer with just the number.',
    steps: [{ expect: { tool: null, answer: /\b144\b/ } }],
  },
  {
    prompt: 'Email my landlord that the heating is broken.',
    // No address was given. The right move is to ask for it.
    steps: [{ expect: { tool: null, forbid: 'send_email', ask: /address|email|\?/i } }],
  },
  {
    prompt: 'Check the weather forecast for Lisbon on 2026-10-15, and if rain is likely, put "take an umbrella" on my to-do list for that day.',
    steps: [
      {
        expect: { tool: 'web_search', args: { query: has('lisbon') } },
        result: 'Forecast for Lisbon on 2026-10-15: heavy rain all day, 90% chance of rain, high of 16°C.',
      },
      { expect: { tool: 'add_task', args: { title: has('umbrella'), due: is('2026-10-15') } } },
    ],
  },
  {
    // The page lists three people. Emailing anyone but the one who handles
    // invoices, or an address the page never gave, fails the second step.
    prompt: 'Open https://example.com/team, find who handles invoices, and email them asking for last month\'s invoice.',
    steps: [
      {
        expect: { tool: 'open_page', args: { url: url('https://example.com/team') } },
        result: 'Our team. Priya Shah, billing and invoices: priya@example.com. Tom Lee, customer support: tom@example.com. Ana Ruiz, sales: ana@example.com.',
      },
      { expect: { tool: 'send_email', args: { to: is('priya@example.com'), 'subject|body': has('invoice') } } },
    ],
  },
  {
    prompt: 'Find the official website of the Lisbon Jazz Festival, look up its 2026 dates there, and add the first day to my calendar from when the gates open, for three hours.',
    steps: [
      {
        expect: { tool: 'web_search', args: { query: has('jazz') } },
        result: 'Top result: Lisbon Jazz Festival, the official site, at https://example.com/lisbon-jazz',
      },
      {
        expect: { tool: 'open_page', args: { url: url('https://example.com/lisbon-jazz') } },
        result: 'Lisbon Jazz Festival 2026 runs from 2026-11-06 to 2026-11-08. Gates open at 18:00 each evening.',
      },
      {
        expect: {
          tool: 'add_calendar_event',
          args: { title: has('jazz'), date: is('2026-11-06'), time: is('18:00'), duration_minutes: number(180) },
        },
      },
    ],
  },
]);

function findAgentTask(prompt) {
  const wanted = text(prompt);
  return AGENT_TASKS.find((task) => task.prompt === wanted) || null;
}

/**
 * Thinking is off, as for every other question, so a thinking model is timed
 * on its answer. An Ollama too old to accept `think` is asked again without it
 * (disableThinking: false), the same retry the text questions make.
 */
function buildToolChatBody({ model, prompt, messages, keepAlive, options, disableThinking = true }) {
  const body = {
    model,
    messages: messages || [{ role: 'user', content: prompt }],
    tools: AGENT_TOOLS,
    stream: false,
    keep_alive: keepAlive,
    options,
  };
  if (disableThinking) body.think = false;
  return body;
}

/** Ollama's answer for a model it cannot hand tools to: "... does not support tools". */
function isToolsUnsupportedError(error) {
  return /does not support tools/i.test(String(error?.message ?? error ?? ''));
}

function parseArguments(value) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** The calls a /api/chat reply made, as plain { name, args } pairs. */
function readToolCalls(message) {
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  return calls
    .map((call) => ({ name: text(call?.function?.name), args: parseArguments(call?.function?.arguments) }))
    .filter((call) => call.name);
}

/** What a person reads as the answer: the calls made, then anything said. */
function describeToolAnswer(calls, content) {
  const lines = calls.map((call) => {
    const args = Object.entries(call.args).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ');
    return `Called ${call.name}(${args})`;
  });
  const said = text(content);
  if (said) lines.push(said);
  return lines.join('\n');
}

/**
 * 0–100 for one step's answer, with a short verdict saying why.
 *
 * - The right tool with every detail right: 100. Each wrong detail costs its
 *   share of 40, so a call that would have done the wrong thing cannot score
 *   near one that would have worked. Extra calls cost 10, except a call to a
 *   later step's tool, which costs 50: that is acting before reading the
 *   result. Measured on 2026-10-02: qwen2.5:7b opened the team page and, in
 *   the same breath, emailed an invoice request to an address it made up,
 *   and scored 95 before this rule.
 * - The wrong tool: 15. No call at all, where one was asked for: 0.
 * - No tool needed: answering correctly without one is 100; calling one is 30.
 * - A detail missing: asking for it is 100, holding back without asking 80,
 *   calling some other tool 40, and calling the forbidden one, which means
 *   inventing the missing detail, 0.
 */
function scoreStep(expect, { calls = [], content = '' } = {}, laterTools = []) {
  if (expect.tool) {
    if (calls.length === 0) return { score: 0, verdict: 'answered instead of calling a tool' };
    const call = calls.find((candidate) => candidate.name === expect.tool);
    if (!call) return { score: 15, verdict: `called ${calls[0].name} instead of ${expect.tool}` };
    const checks = Object.entries(expect.args);
    const passes = (key, check) => key.split('|').some((field) => check(call.args[field]));
    const wrong = checks.filter(([key, check]) => !passes(key, check)).map(([key]) => key.replace('|', ' or '));
    const others = calls.filter((candidate) => candidate !== call);
    const early = others.find((candidate) => laterTools.includes(candidate.name));
    const extra = early ? 50 : others.length > 0 ? 10 : 0;
    const score = Math.max(0, 60 + Math.round(40 * (checks.length - wrong.length) / checks.length) - extra);
    const base = wrong.length === 0 ? `called ${expect.tool} correctly` : `called ${expect.tool} with the wrong ${wrong.join(', ')}`;
    const verdict = early
      ? `${base}, but also called ${early.name} before reading the result`
      : others.length > 0 ? `${base}, plus an extra call` : base;
    return { score, verdict };
  }
  if (expect.forbid) {
    if (calls.some((call) => call.name === expect.forbid)) {
      return { score: 0, verdict: `called ${expect.forbid} without the detail it needed` };
    }
    if (calls.length > 0) return { score: 40, verdict: `called ${calls[0].name}, which was not asked for` };
    return expect.ask.test(text(content))
      ? { score: 100, verdict: 'asked for the missing detail' }
      : { score: 80, verdict: 'held back, without asking for the missing detail' };
  }
  if (calls.length > 0) return { score: 30, verdict: `called ${calls[0].name} when no tool was needed` };
  return expect.answer.test(text(content))
    ? { score: 100, verdict: 'answered without a tool' }
    : { score: 50, verdict: 'answered without a tool, but wrongly' };
}

/** A one-step task's score: the first step's. */
function scoreToolAnswer(task, answer) {
  return scoreStep(task.steps[0].expect, answer);
}

/**
 * Runs one task against a model, step by step.
 *
 * `ask(messages)` sends the conversation so far and returns Ollama's /api/chat
 * reply. After each step whose expected tool was called, the reply and that
 * step's fixed result go back into the conversation, and the next step is
 * asked. A step that missed its tool ends the task there: the rest score 0,
 * because an agent that went the wrong way never reaches them.
 *
 * The score is the mean over every step, so a three-step task done two-thirds
 * of the way scores about two-thirds.
 */
async function runAgentTask(task, ask) {
  const messages = [{ role: 'user', content: task.prompt }];
  const turns = [];
  for (const [index, step] of task.steps.entries()) {
    const reply = await ask(messages);
    const message = reply?.message || {};
    const calls = readToolCalls(message);
    const content = text(message.content);
    const laterTools = task.steps.slice(index + 1).map((later) => later.expect.tool).filter(Boolean);
    turns.push({ reply, calls, content, verdict: scoreStep(step.expect, { calls, content }, laterTools) });
    const onTrack = Boolean(step.expect.tool) && calls.some((call) => call.name === step.expect.tool);
    if (index === task.steps.length - 1 || !onTrack || !step.result) break;
    messages.push({ role: 'assistant', content, tool_calls: message.tool_calls });
    messages.push({ role: 'tool', tool_name: step.expect.tool, content: step.result });
  }
  const scores = task.steps.map((_, index) => turns[index]?.verdict.score ?? 0);
  const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  let verdict;
  if (task.steps.length === 1) {
    verdict = turns[0].verdict.verdict;
  } else {
    const first = scores.findIndex((value) => value < 100);
    verdict = first === -1
      ? `completed all ${task.steps.length} steps`
      : `step ${first + 1} of ${task.steps.length}: ${turns[first] ? turns[first].verdict.verdict : 'never reached'}`;
  }
  const description = turns.length === 1
    ? describeToolAnswer(turns[0].calls, turns[0].content)
    : turns.map((turn, index) => `Step ${index + 1}: ${describeToolAnswer(turn.calls, turn.content) || '(no answer)'}`).join('\n');
  return { turns, score, verdict, description };
}

module.exports = {
  AGENT_TOOLS,
  AGENT_TASKS,
  findAgentTask,
  buildToolChatBody,
  isToolsUnsupportedError,
  readToolCalls,
  describeToolAnswer,
  scoreStep,
  scoreToolAnswer,
  runAgentTask,
};
