import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GRADE_SCALE, compareModelTotal, validateAndNormalizeGradingResult } from '../api/grading-validation.js';

test('calculates total and grade from question scores', () => {
  const result = validateAndNormalizeGradingResult({
    total_score: '100/100', grade: 'A+',
    questions: [
      { q: 1, score: '8/10', feedback: 'Good.' },
      { q: 2, score: '12/20', feedback: 'Needs more detail.' },
      { q: 3, score: '15/20', feedback: 'Good.' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.result.total_score, '35/50');
  assert.equal(result.result.percentage, 70);
  assert.equal(result.result.grade, 'B+');
  assert.equal(compareModelTotal({ total_score: '100/100' }, result.result).matches, false);
});

test('rejects scores above the question maximum', () => {
  const result = validateAndNormalizeGradingResult({ questions: [{ q: 1, score: '11/10' }] });
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid score/i);
});

test('rejects missing question scores', () => {
  const result = validateAndNormalizeGradingResult({ total_score: '10/10', questions: [] });
  assert.equal(result.ok, false);
  assert.match(result.error, /no question scores/i);
});

test('rejects numeric scores without a maximum', () => {
  const result = validateAndNormalizeGradingResult({
    questions: [{ q: 1, score: 75 }, { q: 2, score: '0/25' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /X\/Y format/i);
});

test('keeps the default grade scale deterministic', () => {
  assert.deepEqual(DEFAULT_GRADE_SCALE.map(({ min, grade }) => ({ min, grade })), [
    { min: 80, grade: 'A+' }, { min: 75, grade: 'A' }, { min: 70, grade: 'B+' },
    { min: 65, grade: 'B' }, { min: 60, grade: 'C+' }, { min: 55, grade: 'C' },
    { min: 50, grade: 'D' }, { min: 0, grade: 'F' },
  ]);
});
