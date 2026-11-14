import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { CsvParser, parseCsv } from '../src/index.js';

test('parses a simple row', () => {
  assert.deepEqual(parseCsv('a,b,c\n'), [['a', 'b', 'c']]);
});

test('parses multiple rows', () => {
  assert.deepEqual(parseCsv('a,b\nc,d\n'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('handles quoted fields containing the delimiter', () => {
  assert.deepEqual(parseCsv('"a,b",c\n'), [['a,b', 'c']]);
});

test('handles quoted fields containing newlines', () => {
  assert.deepEqual(parseCsv('"line1\nline2",x\n'), [['line1\nline2', 'x']]);
});

test('handles escaped quotes inside quoted fields', () => {
  assert.deepEqual(parseCsv('"say ""hi""",x\n'), [['say "hi"', 'x']]);
});

test('supports a custom delimiter', () => {
  assert.deepEqual(parseCsv('a;b;c\n', { delimiter: ';' }), [['a', 'b', 'c']]);
});

test('supports a custom quote character', () => {
  assert.deepEqual(parseCsv("'a,b',c\n", { quote: "'" }), [['a,b', 'c']]);
});

test('skips empty lines by default', () => {
  assert.deepEqual(parseCsv('a,b\n\nc,d\n'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('can keep empty lines when asked', () => {
  assert.deepEqual(parseCsv('a,b\n\nc,d\n', { skipEmptyLines: false }), [
    ['a', 'b'],
    [''],
    ['c', 'd'],
  ]);
});

test('handles a final row without a trailing newline', () => {
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']]);
});

test('handles CRLF line endings', () => {
  assert.deepEqual(parseCsv('a,b\r\nc,d\r\n'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('handles an empty field between delimiters', () => {
  assert.deepEqual(parseCsv('a,,c\n'), [['a', '', 'c']]);
});

test('handles a trailing empty field', () => {
  assert.deepEqual(parseCsv('a,b,\n'), [['a', 'b', '']]);
});

test('streams rows from a Readable', async () => {
  const input = Readable.from(['a,b\n', 'c,d\n']);
  const parser = new CsvParser();
  input.pipe(parser);
  const rows = [];
  for await (const row of parser) {
    rows.push(row);
  }
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('rejects a delimiter that is not a single character', () => {
  assert.throws(() => new CsvParser({ delimiter: '::' }), TypeError);
});

test('rejects delimiter equal to quote', () => {
  assert.throws(() => new CsvParser({ delimiter: '"', quote: '"' }), TypeError);
});
