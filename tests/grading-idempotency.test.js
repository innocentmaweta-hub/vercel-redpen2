import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGradingIdempotencyKey,
  getCompletedGrading,
  normalizeGradingIdempotencyKey,
  rememberCompletedGrading,
} from '../api/grading-idempotency.js';

test('accepts safe grading idempotency keys', () => {
  assert.equal(normalizeGradingIdempotencyKey('abc-123_test:v1'), 'abc-123_test:v1');
  assert.equal(normalizeGradingIdempotencyKey(''), null);
  assert.equal(normalizeGradingIdempotencyKey('bad key'), null);
  assert.equal(normalizeGradingIdempotencyKey('x'.repeat(129)), null);
});

test('creates unique grading keys', () => {
  const a = createGradingIdempotencyKey();
  const b = createGradingIdempotencyKey();
  assert.ok(a);
  assert.notEqual(a, b);
});

test('remembers and retrieves completed grading results', () => {
  const key = createGradingIdempotencyKey();
  const result = { total_score: '8/10', grade: 'A' };

  assert.equal(getCompletedGrading(key), null);
  rememberCompletedGrading(key, result);
  assert.deepEqual(getCompletedGrading(key), result);
});
