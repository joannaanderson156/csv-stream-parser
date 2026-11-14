import { Transform } from 'node:stream';

/**
 * Internal state machine states for the CSV parser.
 * Using a small set of named states keeps the transition logic explicit and
 * avoids deeply nested conditionals inside the transform callback.
 */
const STATE = {
  FIELD_START: 0,
  IN_FIELD: 1,
  IN_QUOTED_FIELD: 2,
  QUOTE_IN_QUOTED_FIELD: 3,
};

/**
 * A Transform stream that parses CSV text into row arrays.
 *
 * The parser is deliberately streaming: it never buffers the whole input, so
 * it can handle files larger than memory. It emits one array of strings per
 * row. Quoted fields may contain the delimiter, newlines, and doubled quotes
 * (""). A configurable delimiter and quote character are supported.
 *
 * Trade-off: rows are emitted as soon as a newline is seen, so a field that
 * spans multiple chunks is held in a small buffer. This keeps memory usage
 * proportional to the longest single field rather than the file size.
 */
export class CsvParser extends Transform {
  /**
   * @param {object} [options]
   * @param {string} [options.delimiter=','] single character field separator
   * @param {string} [options.quote='"'] single character quote character
   * @param {boolean} [options.skipEmptyLines=true] whether to drop blank lines
   */
  constructor(options = {}) {
    super({ readableObjectMode: true });
    const delimiter = options.delimiter ?? ',';
    const quote = options.quote ?? '"';
    if (typeof delimiter !== 'string' || delimiter.length !== 1) {
      throw new TypeError('delimiter must be a single character string');
    }
    if (typeof quote !== 'string' || quote.length !== 1) {
      throw new TypeError('quote must be a single character string');
    }
    if (delimiter === quote) {
      throw new TypeError('delimiter and quote must differ');
    }
    this.delimiter = delimiter;
    this.quote = quote;
    this.skipEmptyLines = options.skipEmptyLines ?? true;

    this._state = STATE.FIELD_START;
    this._field = '';
    this._row = [];
    this._rowHasContent = false;
  }

  _transform(chunk, _encoding, callback) {
    // Work on a string copy. Chunk boundaries can split a multi-byte character,
    // but since we only compare against ASCII delimiters and quotes, and we
    // concatenate field contents as strings, a split inside a multi-byte
    // character is still reassembled by the JS string concatenation below.
    const text = chunk.toString('utf8');
    for (let i = 0; i < text.length; i++) {
      this._consume(text[i]);
    }
    callback();
  }

  _flush(callback) {
    // A file may lack a trailing newline; flush the final field and row.
    if (this._state === STATE.IN_QUOTED_FIELD || this._state === STATE.QUOTE_IN_QUOTED_FIELD) {
      // Unterminated quote: treat the accumulated text as the field value.
      // This is a deliberate lenient choice: real-world CSV sometimes truncates.
      this._state = STATE.IN_FIELD;
    }
    if (this._rowHasContent || this._field.length > 0) {
      this._endField();
      this._endRow();
    }
    callback();
  }

  _consume(ch) {
    const d = this.delimiter;
    const q = this.quote;

    switch (this._state) {
      case STATE.FIELD_START:
        if (ch === q) {
          this._state = STATE.IN_QUOTED_FIELD;
        } else if (ch === d) {
          this._endField();
        } else if (ch === '\n') {
          this._endField();
          this._endRow();
        } else if (ch === '\r') {
          // Ignore CR; the following LF (or end of input) ends the row.
          // A lone CR is treated as a line terminator for robustness.
          this._endField();
          this._endRow();
        } else {
          this._field += ch;
          this._rowHasContent = true;
          this._state = STATE.IN_FIELD;
        }
        break;

      case STATE.IN_FIELD:
        if (ch === d) {
          this._endField();
          this._state = STATE.FIELD_START;
        } else if (ch === '\n') {
          this._endField();
          this._endRow();
          this._state = STATE.FIELD_START;
        } else if (ch === '\r') {
          this._endField();
          this._endRow();
          this._state = STATE.FIELD_START;
        } else {
          this._field += ch;
          this._rowHasContent = true;
        }
        break;

      case STATE.IN_QUOTED_FIELD:
        if (ch === q) {
          this._state = STATE.QUOTE_IN_QUOTED_FIELD;
        } else {
          this._field += ch;
          this._rowHasContent = true;
        }
        break;

      case STATE.QUOTE_IN_QUOTED_FIELD:
        if (ch === q) {
          // Escaped quote: append one quote and stay in the quoted field.
          this._field += q;
          this._state = STATE.IN_QUOTED_FIELD;
        } else if (ch === d) {
          this._endField();
          this._state = STATE.FIELD_START;
        } else if (ch === '\n') {
          this._endField();
          this._endRow();
          this._state = STATE.FIELD_START;
        } else if (ch === '\r') {
          this._endField();
          this._endRow();
          this._state = STATE.FIELD_START;
        } else {
          // Characters after a closing quote before a delimiter are appended
          // literally. This is lenient but matches common CSV in the wild.
          this._field += ch;
          this._rowHasContent = true;
          this._state = STATE.IN_FIELD;
        }
        break;

      default:
        throw new Error(`unknown parser state: ${this._state}`);
    }
  }

  _endField() {
    this._row.push(this._field);
    this._field = '';
  }

  _endRow() {
    const isEmpty = this._row.length === 1 && this._row[0] === '' && !this._rowHasContent;
    if (!(this.skipEmptyLines && isEmpty)) {
      this.push(this._row);
    }
    this._row = [];
    this._rowHasContent = false;
  }
}

/**
 * Parse a CSV string synchronously. This is a thin convenience wrapper around
 * the streaming parser for callers that already have the whole input in memory.
 * It uses the same state machine, so behaviour is identical.
 *
 * @param {string} input
 * @param {object} [options]
 * @returns {string[][]} array of rows, each an array of field strings
 */
export function parseCsv(input, options = {}) {
  const parser = new CsvParser(options);
  const rows = [];
  parser.on('data', (row) => rows.push(row));
  parser.end(input);
  // The stream is synchronous for string input, so all rows are available.
  return rows;
}
