# csv-stream-parser

Parses CSV text as a Node.js transform stream, emitting one array of field strings per row, with support for quoted fields, escaped quotes, and a configurable delimiter.

```js
import { CsvParser, parseCsv } from 'csv-stream-parser';

// Whole string at once:
const rows = parseCsv('name,note\n"Ada","likes, commas"\n');
// rows === [['name', 'note'], ['Ada', 'likes, commas']]

// Or as a stream:
import { Readable } from 'node:stream';
const parser = new CsvParser({ delimiter: ',' });
Readable.from(['name,note\n', '"Ada","likes, commas"\n']).pipe(parser);
for await (const row of parser) {
  console.log(row);
}
```

## Why this exists

Most CSV parsers either buffer the whole file or require a third-party dependency. This library is a single, dependency-free transform stream that emits rows as they are completed, so memory stays proportional to the longest field rather than the file size. The trade-off is that it is deliberately lenient: it does not validate that every row has the same number of columns, and it does not attempt to guess types. It gives you strings and lets you decide what they mean.

## The awkward edge

Quoted fields may contain the delimiter and newlines, which means a row is not necessarily a line. If you are splitting input on newlines before feeding it to the parser, you will break on any quoted field containing a newline. Feed the parser raw text or a byte stream instead.

## API

### `new CsvParser(options?)`

Creates a transform stream in object mode. Options:

- `delimiter` — single character, default `,`.
- `quote` — single character, default `"`.
- `skipEmptyLines` — boolean, default `true`.

Emits one array of strings per row. A row is emitted when a newline is seen outside a quoted field, or when the stream ends.

### `parseCsv(input, options?)`

Synchronously parses a string and returns an array of rows. Uses the same parser, so behaviour is identical. Intended for inputs already in memory.

## Behaviour notes

- A quoted field is unquoted; doubled quotes inside it become a single quote.
- A CRLF pair ends a row, and a lone CR also ends a row.
- A file without a trailing newline still yields its final row.
- An unterminated quoted field at end of input is treated as a normal field value rather than an error. Real-world CSV sometimes truncates, and failing the whole stream on the last byte is rarely what you want.
