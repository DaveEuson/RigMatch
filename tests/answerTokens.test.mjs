// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * A scripted run can let answers run past the show's 300 tokens, and every
 * judged answer keeps the judge's reason. Found judging the Ajax report with a
 * cloud judge: six of ten "harmless but edgy" answers were cut at 300 tokens
 * and marked incomplete, and three answers came back unjudged with no reason.
 */

const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const lift = (start, end) => main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start)));

test('the show keeps 300 tokens; a scripted run can ask for more, and the context grows with it', () => {
  const defaults = lift('const BENCHMARK_GENERATE_OPTIONS', '});') + '});';
  const helper = lift('function benchmarkGenerateOptions()', '\n}\n') + '\n}\n';
  const make = (activeBenchmark) => new Function('activeBenchmark', `${defaults}\n${helper}\nreturn benchmarkGenerateOptions();`)(activeBenchmark);
  assert.equal(make(null).num_predict, 300);
  assert.equal(make({ answerTokens: null }).num_ctx, 2048);
  const long = make({ answerTokens: 1000 });
  assert.equal(long.num_predict, 1000);
  assert.ok(long.num_ctx >= 1000 + 1024, 'question and whole answer fit');
  // Clamped where the run starts.
  assert.match(main, /answerTokens: Number\.isInteger\(request\.answerTokens\) \? Math\.max\(64, Math\.min\(2000, request\.answerTokens\)\) : null,/);
  // Every question path reads the run's allowance, not the constant.
  assert.equal((main.replace(helper, '').match(/BENCHMARK_GENERATE_OPTIONS/g) ?? []).length, 1, 'outside the helper, only its definition names it');
});

test('a judged answer keeps the judge\'s reason, and a missing mark says why', () => {
  assert.match(main, /promptJudgeReason = verdict\?\.reason \?\? '';/);
  assert.match(main, /\.\.\.\(promptJudgeReason \? \{ judgeReason: promptJudgeReason \} : \{\}\)/);
  assert.match(main, /\.\.\.\(promptJudgeIssue \? \{ judgeIssue: promptJudgeIssue \} : \{\}\)/);
  // A cloud judge has room for its sentence.
  assert.match(main, /openRouterGenerateText\(judgeApiKey, judgeModel, judgePrompt, 400, signal\)/);
});
