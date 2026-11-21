// SwiftCsv — a fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// run(input) returns exactly csv-reader 1.0.0's answer, {columns, rows, errors},
// for every input {text, header}: the same broken-row policy, the same error
// records in the same order, the same line counting. It is only faster.
//
// How it stays fast on 1.4-2.0 MB files:
// - Most records are plain quoteless lines: one regex scan finds the first
//   special char (" , \r or \n) and, when it is the line break, the whole
//   record is split in native code (String.split) instead of field by field.
// - Inside a record that does hold a quote or a stray CR, unquoted fields are
//   found with indexOf (no match-object allocation) and quoted fields with
//   one regex scan per special character; a quoted field with no doubled
//   quotes and no line break inside is a single slice.
// - No result object is allocated per field: the last field read is kept in
//   three closure slots (fValue, fEnded, fAdded).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the
// next. Dependency-free ES module, Node 22.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

const FIRST = /["\r\n]/g; // first special char at-or-after pos
const QSCAN = /["\r\n]/g; // next special inside a quoted field

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // Slots for the last field read (avoids a fresh object per field).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Unquoted field starting at pos, with `value` already built ('', normally,
  // '"' for the unterminated-quote re-read). Sets fValue, fEnded, fAdded.
  // indexOf finds the nearer of ',' and '\n'; a '\r' in the chunk is either
  // the CRLF's (trailing, dropped) or stray (rare: walked char by char, one
  // stray_cr error each).
  function readUnquoted(value, added) {
    while (pos < len) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      let i;
      let isNL;
      if (ci === -1) { i = ni; isNL = true; }
      else if (ni === -1) { i = ci; isNL = false; }
      else if (ci < ni) { i = ci; isNL = false; }
      else { i = ni; isNL = true; }
      if (i === -1) {
        // The rest of the text is the field.
        const r = text.indexOf('\r', pos);
        if (r === -1) {
          fValue = value + text.slice(pos);
          fAdded = added + (len - pos);
          pos = len;
          fEnded = END;
          return;
        }
        let v = value;
        let a = added;
        let p = pos;
        while (p < len) {
          const c = text.charCodeAt(p);
          if (c === 13) { error('stray_cr'); p += 1; continue; }
          let e = p;
          while (e < len && text.charCodeAt(e) !== 13) e += 1;
          v += text.slice(p, e);
          a += e - p;
          p = e;
        }
        fValue = v;
        fAdded = a;
        pos = len;
        fEnded = END;
        return;
      }
      const chunk = text.slice(pos, i);
      const r = chunk.indexOf('\r');
      if (r === -1) {
        fValue = value + chunk;
        fAdded = added + chunk.length;
        pos = i + 1;
        if (isNL) { line += 1; fEnded = LINE_BREAK; }
        else fEnded = COMMA;
        return;
      }
      if (isNL && r === chunk.length - 1) {
        // CRLF: drop the trailing CR.
        fValue = value + chunk.slice(0, -1);
        fAdded = added + chunk.length - 1;
        pos = i + 1;
        line += 1;
        fEnded = LINE_BREAK;
        return;
      }
      // Stray CR(s) inside the chunk: walk it, dropping each with an error.
      let v = value;
      let a = added;
      let p = pos;
      const end = i;
      while (p < end) {
        const c = text.charCodeAt(p);
        if (c === 13) {
          if (p === end - 1 && isNL) { p = end; break; } // CRLF's CR
          error('stray_cr');
          p += 1;
          continue;
        }
        let e = p;
        while (e < end && text.charCodeAt(e) !== 13) e += 1;
        v += text.slice(p, e);
        a += e - p;
        p = e;
      }
      value = v;
      added = a;
      pos = p;
    }
    fValue = value;
    fAdded = added;
    fEnded = END;
  }

  // Quoted field whose opening quote is at pos. Sets fValue, fEnded, fAdded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let segStart = pos;
    let parts = null;
    let closed = false;
    let closePos = -1;
    while (pos < len) {
      QSCAN.lastIndex = pos;
      const m = QSCAN.exec(text);
      if (m === null) break;
      const i = m.index;
      const c = text.charCodeAt(i);
      if (c === 34) { // "
        if (text.charCodeAt(i + 1) === 34) {
          // Doubled quote: one literal quote, keep scanning.
          if (parts === null) parts = [];
          parts.push(text.slice(segStart, i), '"');
          pos = i + 2;
          segStart = pos;
          continue;
        }
        closed = true;
        closePos = i;
        pos = i + 1;
        break;
      }
      if (parts === null) parts = [];
      parts.push(text.slice(segStart, i));
      if (c === 13) { // \r -> \n (CRLF and a lone CR alike)
        parts.push('\n');
        line += 1;
        pos = text.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
      } else { // \n stays \n
        parts.push('\n');
        line += 1;
        pos = i + 1;
      }
      segStart = pos;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      readUnquoted('"', 0);
      return;
    }
    let value;
    if (parts === null) value = text.slice(open + 1, closePos);
    else {
      parts.push(text.slice(segStart, closePos));
      value = parts.join('');
    }
    fAdded = 0;
    if (pos >= len) { fValue = value; fEnded = END; return; }
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; fValue = value; fEnded = COMMA; return; }
    if (c === 10) { pos += 1; line += 1; fValue = value; fEnded = LINE_BREAK; return; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; fValue = value; fEnded = LINE_BREAK; return; }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    readUnquoted(value, 0);
    if (fAdded > 0) error('quote_junk');
  }

  // One record, field by field (the general path). The fields land in
  // slowFields and the last field's quoted flag in slowQuoted (no fresh
  // object per record).
  let slowFields = [];
  let slowQuoted = false;
  function readRecordSlow() {
    slowFields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted(); else readUnquoted('', 0);
      slowFields.push(fValue);
    } while (fEnded === COMMA);
    slowQuoted = quoted;
  }

  // Width, short/long-row errors and padding/cutting for one record.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; return; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the first special at-or-after pos tells whether this
    // record is a plain quoteless line. \n -> it ends here; \r\n -> it ends
    // here (the \r stripped); " or a lone \r -> the general path; none ->
    // it runs to the end of the text.
    FIRST.lastIndex = pos;
    const fm = FIRST.exec(text);
    if (fm === null) {
      const fields = text.slice(pos).split(',');
      pos = len;
      if (!(fields.length === 1 && fields[0] === '')) finishRecord(fields);
      continue;
    }
    const fi = fm.index;
    const fc = text.charCodeAt(fi);
    if (fc === 10) {
      const fields = text.slice(pos, fi).split(',');
      pos = fi + 1;
      line += 1;
      if (!(fields.length === 1 && fields[0] === '')) finishRecord(fields);
      continue;
    }
    if (fc === 13 && text.charCodeAt(fi + 1) === 10) {
      const fields = text.slice(pos, fi).split(',');
      pos = fi + 2;
      line += 1;
      if (!(fields.length === 1 && fields[0] === '')) finishRecord(fields);
      continue;
    }

    readRecordSlow();
    const fields = slowFields;
    const quoted = slowQuoted;
    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
