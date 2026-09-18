// RFC4180-style CSV helpers. Chemical active ingredients routinely contain commas
// ("Glyphosate, potassium salt 48.7%"), so naive split(",") corrupts them.

// Parse CSV text into rows of string cells.
export function parseCSV(text) {
  const src = text.replace(/^\uFEFF/, ""); // Excel writes a BOM
  const rows = [];
  let row = [], cell = "", inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"')       inQuotes = true;
    else if (ch === ",")  { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  row.push(cell);
  rows.push(row);

  return rows.filter(r => r.some(c => c.trim() !== ""));
}

// Render one value as a CSV cell, quoting and escaping only when needed.
export function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
