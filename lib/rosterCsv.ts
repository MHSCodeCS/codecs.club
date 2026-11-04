/** CSV exports from spreadsheets: quoted commas/newlines and doubled quotes. */
export function parseRosterCsv(source: string): string[][] {
  if (source.length > 1_000_000) throw new Error("CSV files must be at most 1 MB.");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ""; closed = false; if (row.length > 50) throw new Error("Use at most 50 columns."); };
  const finishRow = () => { finishCell(); if (row.some(value => value.trim())) rows.push(row); row = []; if (rows.length > 101) throw new Error("Import at most 100 students at a time."); };
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === ',') finishCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (char === '"' && !cell && !closed) quoted = true;
    else if (closed || char === '"') throw new Error("Malformed CSV quoting. Export the spreadsheet as CSV again.");
    else cell += char;
  }
  if (quoted) throw new Error("Unclosed quoted field in CSV.");
  if (cell || row.length || closed) finishRow();
  if (rows.length < 2) throw new Error("Include a header row and at least one student.");
  const columns = rows[0].length;
  if (rows.some(row => row.length !== columns)) throw new Error("Every CSV row must have the same number of columns as the header.");
  return rows;
}
