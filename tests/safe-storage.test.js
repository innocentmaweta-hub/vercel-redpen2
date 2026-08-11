import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStoredValue,
  setStoredValue,
  removeStoredValue,
  getStoredString,
  setStoredString,
  removeStoredString,
} from '../src/lib/safeStorage.js';

function installStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  global.window = {
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  };
  return values;
}

test('safe storage reads and writes JSON values', () => {
  const values = installStorage();
  assert.equal(setStoredValue('settings', { dark: false }), true);
  assert.deepEqual(getStoredValue('settings', {}), { dark: false });
  assert.equal(removeStoredValue('settings'), true);
  assert.deepEqual(getStoredValue('settings', { fallback: true }), { fallback: true });
  assert.equal(values.size, 0);
});

test('safe storage returns fallback for malformed JSON', () => {
  installStorage({ broken: '{not-json' });
  assert.deepEqual(getStoredValue('broken', ['fallback']), ['fallback']);
});

test('safe storage handles storage exceptions without throwing', () => {
  global.window = {
    localStorage: {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    },
  };

  assert.equal(getStoredString('token'), null);
  assert.equal(setStoredString('token', 'abc'), false);
  assert.equal(removeStoredString('token'), false);
  assert.deepEqual(getStoredValue('data', { safe: true }), { safe: true });
  assert.equal(setStoredValue('data', { safe: true }), false);
  assert.equal(removeStoredValue('data'), false);
});
