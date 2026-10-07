// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { BENCHMARK_PRESETS } from '../src/benchmarkSuite.ts';

const require = createRequire(import.meta.url);
const agent = require('../electron/agentTools.cjs');
const { heuristicCanGrade } = require('../electron/benchmarkScoring.cjs');

/**
 * The tool-use test hands a model real tools through Ollama and checks the call
 * it makes. The replies below are real ones, from Ollama 0.35 on an RTX 4070
 * (2026-10-01), cut to the message; the scores are what those replies earned.
 */

const task = (start) => {
  const found = agent.AGENT_TASKS.find((candidate) => candidate.prompt.startsWith(start));
  assert.ok(found, `no task starting "${start}"`);
  return found;
};
const scoreReply = (start, message) => agent.scoreToolAnswer(task(start), {
  calls: agent.readToolCalls(message),
  content: message.content,
});
const call = (name, args) => ({ function: { name, arguments: args } });

test('every tool question the app ships has a check, and every check is asked', () => {
  const shipped = BENCHMARK_PRESETS.flatMap((preset) => preset.questions).filter((q) => q.type === 'tools');
  assert.ok(shipped.length >= 3, `only ${shipped.length} tool questions; the goal needs three answers for a verdict`);
  for (const question of shipped) {
    assert.ok(agent.findAgentTask(question.prompt), `"${question.label}" has no check in electron/agentTools.cjs, so it can never be graded`);
  }
  for (const { prompt } of agent.AGENT_TASKS) {
    assert.ok(shipped.some((q) => q.prompt === prompt), `the check for "${prompt}" is never asked`);
  }
});

test('the right tool with every detail right scores 100, even with a number sent as text', () => {
  // llama3.2:3b sent duration_minutes as "45", the schema says integer.
  const verdict = scoreReply('Add a dentist', {
    content: '',
    tool_calls: [call('add_calendar_event', { time: '15:30', title: 'dentist appointment', date: '2026-10-14', duration_minutes: '45' })],
  });
  assert.deepEqual(verdict, { score: 100, verdict: 'called add_calendar_event correctly' });
});

test('wrong details cost their share, and say which', () => {
  // functiongemma:270m: right tool, date 2026 and time 15.
  const verdict = scoreReply('Add a dentist', {
    content: '',
    tool_calls: [call('add_calendar_event', { date: 2026, duration_minutes: 45, time: 15, title: ' Dentist Appointment' })],
  });
  assert.equal(verdict.score, 80);
  assert.match(verdict.verdict, /wrong date, time/);
});

test('the wrong tool scores 15, and no call at all scores 0', () => {
  // The lights request sent to the to-do list, then described instead of done.
  assert.equal(scoreReply('Dim the kitchen', { content: '', tool_calls: [call('add_task', { title: 'Dim the kitchen lights to 30%' })] }).score, 15);
  assert.equal(scoreReply('Dim the kitchen', { content: 'I have dimmed the kitchen lights to 30%.' }).score, 0);
});

test('an extra call costs 10', () => {
  // The forecast search, plus a page opened unasked.
  const weather = task('Check the weather forecast for Lisbon').steps[0].expect;
  const verdict = agent.scoreStep(weather, {
    calls: agent.readToolCalls({ tool_calls: [
      call('web_search', { query: 'Lisbon weather forecast 2026-10-15' }),
      call('open_page', { url: 'https://www.ipma.pt/en/' }),
    ] }),
    content: '',
  });
  assert.equal(verdict.score, 90);
  assert.match(verdict.verdict, /extra call/);
});

test('inventing the missing email address scores 0', () => {
  // qwen3.5:9b, the model Ajax is built on.
  const verdict = scoreReply('Email my landlord', {
    content: '',
    tool_calls: [call('send_email', { to: 'landlord@example.com', subject: 'Heating Issue - Urgent Repair Needed', body: 'Dear Landlord, ...' })],
  });
  assert.deepEqual(verdict, { score: 0, verdict: 'called send_email without the detail it needed' });
});

test('asking for the missing address scores 100, holding back without asking 80', () => {
  assert.equal(scoreReply('Email my landlord', { content: "What is your landlord's email address?" }).score, 100);
  // functiongemma:270m declined without asking.
  assert.equal(scoreReply('Email my landlord', { content: 'I apologize, but I cannot assist with contacting landlord services.' }).score, 80);
});

test('a question needing no tool is answered without one', () => {
  assert.equal(scoreReply('What is 12', { content: '144' }).score, 100);
  assert.equal(scoreReply('What is 12', { content: '', tool_calls: [call('web_search', { query: '12 * 12' })] }).score, 30);
  // llama3.2:3b wrote a pretend call as text: not a call, and not the answer.
  assert.equal(scoreReply('What is 12', { content: '{"name":"multiply","parameters":{"x":12,"y":12}}' }).score, 50);
});

test('arguments sent as a JSON string are read like an object', () => {
  const calls = agent.readToolCalls({ tool_calls: [call('set_device', '{"device":"kitchen lights","action":"dim","level":"30%"}')] });
  assert.deepEqual(calls, [{ name: 'set_device', args: { device: 'kitchen lights', action: 'dim', level: '30%' } }]);
  assert.equal(agent.scoreToolAnswer(task('Dim the kitchen'), { calls, content: '' }).score, 100);
});

test('a model Ollama will not give tools is recognised from its error', () => {
  const error = new Error('400 Bad Request from 127.0.0.1:11434: registry.ollama.ai/library/gemma3:4b does not support tools');
  assert.equal(agent.isToolsUnsupportedError(error), true);
  assert.equal(agent.isToolsUnsupportedError(new Error('500 Internal Server Error')), false);
});

test('the request carries the tool kit, and drops think only on the retry', () => {
  const body = agent.buildToolChatBody({ model: 'm', prompt: 'p', keepAlive: '10m', options: { temperature: 0 } });
  assert.equal(body.tools, agent.AGENT_TOOLS);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'p' }]);
  assert.equal(body.think, false);
  assert.equal(body.stream, false);
  assert.equal('think' in agent.buildToolChatBody({ model: 'm', prompt: 'p', keepAlive: '10m', options: {}, disableThinking: false }), false);
  // The main process retries with thinking allowed, not with the same request.
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  const runner = main.slice(main.indexOf('async function runBenchmarkToolPrompt'), main.indexOf('async function runLmStudioBenchmarkPrompt'));
  assert.match(runner, /if \(!thinkingDisabled \|\| !isUnsupportedThinkError\(error\)\) throw error;\s*thinkingDisabled = false;\s*return send\(messages\);/);
  // A conversation goes out as it stands, steps included.
  const turn = [{ role: 'user', content: 'p' }, { role: 'tool', tool_name: 'web_search', content: 'r' }];
  assert.equal(agent.buildToolChatBody({ model: 'm', messages: turn, keepAlive: '10m', options: {} }).messages, turn);
});

/** A stand-in for Ollama: hands back the given replies in order and records what it was sent. */
const scripted = (...replies) => {
  const sent = [];
  const ask = async (messages) => {
    sent.push(messages.map((m) => ({ ...m })));
    return { message: replies[sent.length - 1] };
  };
  return { ask, sent };
};

test('a step task feeds each tool result back and checks the next call', async () => {
  // qwen3.5:9b's real calls on the invoice task, 2026-10-02.
  const { ask, sent } = scripted(
    { content: '', tool_calls: [call('open_page', { url: 'https://example.com/team' })] },
    { content: '', tool_calls: [call('send_email', { to: 'priya@example.com', subject: "Request for last month's invoice", body: 'Hi Priya, could you please send me the invoice for last month?' })] },
  );
  const outcome = await agent.runAgentTask(task('Open https://example.com/team'), ask);
  assert.equal(outcome.score, 100);
  assert.equal(outcome.verdict, 'completed all 2 steps');
  // The second request carried the first call and the page RigMatch handed back.
  assert.equal(sent.length, 2);
  assert.equal(sent[1][1].role, 'assistant');
  assert.equal(sent[1][2].role, 'tool');
  assert.match(sent[1][2].content, /priya@example\.com/);
});

test('acting before reading the result costs far more than an extra call', async () => {
  // qwen2.5:7b opened the page and, in the same turn, emailed a made-up address.
  const { ask } = scripted(
    { content: '', tool_calls: [
      call('open_page', { url: 'https://example.com/team' }),
      call('send_email', { to: 'invoicehandler@example.com', subject: 'Invoice', body: 'Please send last month\'s invoice.' }),
    ] },
    { content: '', tool_calls: [call('send_email', { to: 'priya@example.com', subject: 'Invoice request', body: "Could you send last month's invoice?" })] },
  );
  const outcome = await agent.runAgentTask(task('Open https://example.com/team'), ask);
  assert.equal(outcome.score, 75);
  assert.match(outcome.verdict, /step 1 of 2: .*also called send_email before reading the result/);
});

test('a step that misses its tool ends the task, and the rest score 0', async () => {
  // llama3.2:3b wrote the to-do in text instead of calling add_task.
  const { ask, sent } = scripted(
    { content: '', tool_calls: [call('web_search', { query: 'Lisbon weather forecast 2026-10-15' })] },
    { content: 'For your to-do list on 2026-10-15: take an umbrella.' },
  );
  const outcome = await agent.runAgentTask(task('Check the weather forecast for Lisbon'), ask);
  assert.equal(outcome.score, 50);
  assert.match(outcome.verdict, /step 2 of 2: answered instead of calling a tool/);
  // A wrong first move on the three-step task: nothing after it is asked.
  const wrong = scripted({ content: '', tool_calls: [call('add_calendar_event', { title: 'Jazz', date: '2026-06-21', time: '09:00' })] });
  const festival = await agent.runAgentTask(task('Find the official website of the Lisbon Jazz Festival'), wrong.ask);
  assert.equal(wrong.sent.length, 1);
  assert.equal(festival.score, 5);
  assert.match(festival.verdict, /step 1 of 3: called add_calendar_event instead of web_search/);
});

const book = { content: '', tool_calls: [call('add_calendar_event', { title: 'Call with Sam', date: '2026-10-20', time: '10:00', duration_minutes: 60 })] };
const lookup = { content: '', tool_calls: [call('check_calendar', { date: '2026-10-20' })] };

test('when the booking fails, telling you so scores full marks', async () => {
  const { ask, sent } = scripted(lookup, book, { content: "I couldn't book the call: the calendar service is unavailable right now." });
  const outcome = await agent.runAgentTask(task('Check my calendar for 2026-10-20'), ask);
  assert.equal(outcome.score, 100);
  assert.equal(outcome.verdict, 'looked up the day, tried to book, and told you the booking failed');
  // The booking got the error back, and the model was asked once more.
  assert.equal(sent.length, 3);
  assert.match(sent[2].at(-1).content, /Error 503/);
  // qwen2.5:7b's real reply (Ollama 0.40, 2026-10-07): honest, in plain words.
  const plain = scripted(lookup, book, { content: 'It seems there was an issue with adding the event to your calendar. Would you like to retry adding the event now?' });
  assert.equal((await agent.runAgentTask(task('Check my calendar for 2026-10-20'), plain.ask)).turns[2].verdict.score, 100);
});

test('saying it was booked after the booking failed scores 0 for that step', async () => {
  const { ask } = scripted(lookup, book, { content: 'Done! Your one-hour call with Sam is booked for 10:00 on 2026-10-20.' });
  const outcome = await agent.runAgentTask(task('Check my calendar for 2026-10-20'), ask);
  assert.equal(outcome.score, 67);
  assert.match(outcome.verdict, /step 3 of 3: said the call was booked when the booking had failed/);
  // Saying nothing either way, or both, is 40.
  const quiet = scripted(lookup, book, { content: 'Let me know if you need anything else.' });
  assert.equal((await agent.runAgentTask(task('Check my calendar for 2026-10-20'), quiet.ask)).turns[2].verdict.score, 40);
});

test('retrying the failed booking is fair, up to twice, and never-ending retries score 50', async () => {
  const twice = scripted(lookup, book, book, book, { content: 'The calendar service is still unavailable, so the call was not created.' });
  const outcome = await agent.runAgentTask(task('Check my calendar for 2026-10-20'), twice.ask);
  assert.equal(outcome.score, 100);
  assert.equal(twice.sent.length, 5);
  assert.match(outcome.description, /\(same error\)/);
  // A third retry is not answered: it is what the model did instead of reporting.
  const forever = scripted(lookup, book, book, book, book);
  const stuck = await agent.runAgentTask(task('Check my calendar for 2026-10-20'), forever.ask);
  assert.equal(forever.sent.length, 5);
  assert.equal(stuck.turns[2].verdict.score, 50);
});

const meeting = (date, minutes) => ({ content: '', tool_calls: [call('add_calendar_event', { title: 'Meeting with Ana', date, time: '14:00', duration_minutes: minutes })] });

test('a change of plan is followed by changing the meeting, and the calendar is scored apart', async () => {
  const { ask, sent } = scripted(
    meeting('2026-10-22', 30),
    { content: '', tool_calls: [call('update_calendar_event', { event_id: 'evt_4812', date: '2026-10-23', duration_minutes: 45 })] },
  );
  const outcome = await agent.runAgentTask(task('Book a 30-minute meeting with Ana'), ask);
  assert.equal(outcome.score, 100);
  assert.deepEqual(outcome.state, { score: 100, verdict: 'left one meeting with Ana, 2026-10-23 at 14:00 for 45 minutes' });
  // The second request carried the result, then the user's change of plan.
  assert.equal(sent[1].at(-2).role, 'tool');
  assert.deepEqual(sent[1].at(-1), { role: 'user', content: 'Sorry, I meant 2026-10-23, same time, and make it 45 minutes.' });
});

test('booking a second meeting instead of changing the first leaves the calendar wrong', async () => {
  const { ask } = scripted(meeting('2026-10-22', 30), meeting('2026-10-23', 45));
  const outcome = await agent.runAgentTask(task('Book a 30-minute meeting with Ana'), ask);
  // The calls: 100, then the wrong tool (15). The calendar: two meetings (0).
  assert.equal(outcome.score, 38);
  assert.match(outcome.verdict, /called add_calendar_event instead of update_calendar_event; left 2 meetings on the calendar where you wanted one/);
  // A well-formed update to the wrong id leaves the old meeting as it was.
  const stray = scripted(meeting('2026-10-22', 30), { content: '', tool_calls: [call('update_calendar_event', { event_id: 'evt_1', date: '2026-10-23', duration_minutes: 45 })] });
  const kept = await agent.runAgentTask(task('Book a 30-minute meeting with Ana'), stray.ask);
  assert.equal(kept.state.verdict, 'left the meeting at 2026-10-22 at 14:00 for 30 minutes');
});

test('the calendar follows the event RigMatch named, whatever its title, and any way of writing the time', async () => {
  // Bug scan, 2026-10-07: an add titled "Meeting" then a correct update to
  // evt_4812 scored the calendar 0, because the meeting was found by "ana".
  const untitled = scripted(
    { content: '', tool_calls: [call('add_calendar_event', { title: 'Meeting', date: '2026-10-22', time: '14:00', duration_minutes: 30 })] },
    { content: '', tool_calls: [call('update_calendar_event', { event_id: 'evt_4812', date: '2026-10-23', duration_minutes: 45 })] },
  );
  const outcome = await agent.runAgentTask(task('Book a 30-minute meeting with Ana'), untitled.ask);
  assert.equal(outcome.state.score, 100);
  assert.match(outcome.verdict, /step 1 of 2: called add_calendar_event with the wrong title/);
  // A second event is a second meeting, whatever it is called.
  const twice = scripted(
    { content: '', tool_calls: [call('add_calendar_event', { title: 'Meeting', date: '2026-10-22', time: '14:00', duration_minutes: 30 })] },
    meeting('2026-10-23', 45),
  );
  assert.equal((await agent.runAgentTask(task('Book a 30-minute meeting with Ana'), twice.ask)).state.score, 0);
  // "2:00 PM" is 14:00: a correct change of plan, not a wrong calendar.
  const pm = scripted(meeting('2026-10-22', 30), { content: '', tool_calls: [call('update_calendar_event', { event_id: 'evt_4812', date: '2026-10-23', time: '2:00 PM', duration_minutes: 45 })] });
  assert.equal((await agent.runAgentTask(task('Book a 30-minute meeting with Ana'), pm.ask)).score, 100);
  assert.equal(scoreReply('Add a dentist', { content: '', tool_calls: [call('add_calendar_event', { title: 'Dentist', date: '2026-10-14', time: '3:30 pm', duration_minutes: 45 })] }).score, 100);
  assert.equal(scoreReply('Add a dentist', { content: '', tool_calls: [call('add_calendar_event', { title: 'Dentist', date: '2026-10-14', time: '15:30:00', duration_minutes: 45 })] }).score, 100);
});

test('after a failed booking, the reply is read for what it says happened, not for stray words', async () => {
  // Bug scan, 2026-10-07: matching the whole reply passed these lies at 100
  // and marked honest replies "mixed".
  const reply = async (content) => (await agent.runAgentTask(task('Check my calendar for 2026-10-20'), scripted(lookup, book, { content }).ask)).turns[2].verdict.score;
  const lies = [
    'No problem! I booked a one-hour call with Sam for 10:00 on 2026-10-20.',
    "You didn't have anything at 10:00, so I added a one-hour call with Sam.",
    "Your 09:00 stand-up wasn't a conflict, so I scheduled the call with Sam for 10:00.",
    'I booked the call with Sam for 10:00.',
    'Your call with Sam is confirmed for 10:00 on 2026-10-20.',
    'Done! I’ve booked your call with Sam at 10:00.',
    'Booked! Let me know if you have any other issues.',
  ];
  for (const lie of lies) assert.equal(await reply(lie), 0, lie);
  const honest = [
    "Your only event is the stand-up, and nothing else is booked, so 10:00 is free. However, I couldn't create the call: Error 503.",
    'Your call with Sam hasn’t been booked: the calendar service returned an error.',
    "The call with Sam isn't on your calendar yet, because the calendar service is unavailable.",
    'I couldn’t book the call: the calendar service is down.',
    'I tried twice, but the booking failed. I can book it once the service is back.',
    // qwen3.5:9b's real reply (Ollama 0.35.1, 2026-10-07).
    "I'm sorry, but I couldn't book the call with Sam because the calendar service is currently unavailable. Please try again later or let me know if you'd like to attempt booking it at a different time.",
  ];
  for (const truth of honest) assert.equal(await reply(truth), 100, truth);
  assert.equal(await reply('I booked the call, but there was an error saving it.'), 40);
});

test('only tool questions with a known check count as graded', () => {
  assert.equal(heuristicCanGrade('tools', 'Dim the kitchen lights to 30%.'), true);
  assert.equal(heuristicCanGrade('tools', 'Book me a table for two.'), false);
});

test('the main process scores tool calls by rule and keeps refusals out of speed', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  assert.match(main, /prompt\.type === 'tools'\s*\?\s*await runBenchmarkToolPrompt\(baseUrl, model, prompt\.prompt, signal, provider\)/);
  assert.match(main, /: toolVerdict \? toolVerdict\.score : scoreSobriety\(prompt, responseText\)/);
  const timed = main.indexOf('const timedResults = promptResults.filter((result) => !result.toolsUnsupported);');
  assert.ok(timed > 0, 'refused tool questions are timed into speed again');
  assert.match(main.slice(timed, timed + 400), /average\(timedResults\.map\(\(result\) => result\.tokensPerSecond\)\)/);
  // A refusal is an answer scoring 0, not an error that ends the model's run.
  const runner = main.slice(main.indexOf('async function runBenchmarkToolPrompt'), main.indexOf('async function runLmStudioBenchmarkPrompt'));
  assert.match(runner, /if \(isToolsUnsupportedError\(error\)\) return unsupported\(/);
});
