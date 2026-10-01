// Report formats: text for a terminal, Markdown for a pull request or job summary, JSON for other tools, CSV for a spreadsheet.
// Every format shows only the first line of each commit message, never the body.

function versions(r) {
  return `${r.from.text || '(none)'} -> ${r.to.text || '(none)'}${r.to.source ? ` (from ${r.to.source})` : ''}`;
}

function findingSummary(r) {
  return `${r.counts.error} error, ${r.counts.warning} warning, ${r.counts.info} info`;
}

function commitSummary(r) {
  const c = r.commitCounts;
  return `${c.total} commit(s): ${c.major} breaking, ${c.minor} minor, ${c.patch} patch, ${c.none} none, ${c.unknown} not parsed`;
}

function bumpLine(r) {
  const b = r.bump;
  const parts = [`bump: ${b.actual || 'not measured'}`];
  parts.push(`the commits need: ${b.required || 'not checked'}`);
  if (b.smallest) parts.push(`smallest correct version: ${b.smallest}`);
  return parts.join('; ');
}

export function toText(r) {
  const lines = [
    `version-bump-check: ${versions(r)}`,
    bumpLine(r),
    commitSummary(r),
    `findings: ${findingSummary(r)}`
  ];
  if (!r.findings.length) lines.push('', r.bump.required === null ? 'no findings in the version numbers' : 'no findings: the version number matches the commits');
  for (const f of r.findings) lines.push('', `${f.severity.toUpperCase().padEnd(8)}  ${f.id.padEnd(15)}  ${f.message}`);
  if (r.commits.length) {
    lines.push('', 'commits (first line only):', `  ${'EFFECT'.padEnd(8)}  ${'TYPE'.padEnd(10)}  ${'SCOPE'.padEnd(12)}  ${'BREAKING'.padEnd(8)}  FIRST LINE`);
    for (const c of r.commits) {
      lines.push(`  ${c.effect.padEnd(8)}  ${(c.type || '-').padEnd(10)}  ${(c.scope || '-').padEnd(12)}  ${(c.breaking ? 'yes' : '').padEnd(8)}  ${c.firstLine}`);
    }
  }
  if (r.notes.length) lines.push('');
  for (const n of r.notes) lines.push(`note: ${n}`);
  lines.push('', r.gate.pass ? `GATE: PASS (--fail-on ${r.gate.failOn})` : `GATE: FAIL - ${r.gate.reason}`);
  return lines.join('\n') + '\n';
}

// A Markdown table cell: backslashes and pipes escaped, line breaks flattened, so text from a commit cannot break the table.
export function mdCell(t) {
  return String(t).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n|\r/g, ' ');
}

export function toMarkdown(r) {
  const lines = [
    `## version-bump-check: ${findingSummary(r)}`,
    '',
    `${mdCell(versions(r))}. ${mdCell(bumpLine(r))}. ${mdCell(commitSummary(r))}.`
  ];
  if (!r.findings.length) lines.push('', r.bump.required === null ? 'No findings in the version numbers.' : 'No findings: the version number matches the commits.');
  else {
    lines.push('', '| Severity | Finding | Message |', '| --- | --- | --- |');
    for (const f of r.findings) lines.push(`| ${f.severity} | ${mdCell(f.id)} | ${mdCell(f.message)} |`);
  }
  if (r.commits.length) {
    lines.push('', '| Effect | Type | Scope | Breaking | First line |', '| --- | --- | --- | --- | --- |');
    for (const c of r.commits) {
      lines.push(`| ${c.effect} | ${mdCell(c.type || '')} | ${mdCell(c.scope || '')} | ${c.breaking ? 'yes' : ''} | ${mdCell(c.firstLine)} |`);
    }
  }
  if (r.notes.length) lines.push('');
  for (const n of r.notes) lines.push(`- ${mdCell(n)}`);
  lines.push('', r.gate.pass ? `**Gate passed** (--fail-on ${r.gate.failOn}).` : `**Gate failed:** ${mdCell(r.gate.reason)}.`);
  return lines.join('\n') + '\n';
}

export function toJson(r) {
  return JSON.stringify(r, null, 2) + '\n';
}

// RFC 4180 quoting, and a leading quote on cells a spreadsheet would read as a formula.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per finding, then one row per commit; the kind column tells them apart.
export function toCsv(r) {
  const rows = [['kind', 'severity', 'id', 'effect', 'type', 'scope', 'breaking', 'text']];
  for (const f of r.findings) rows.push(['finding', f.severity, f.id, '', '', '', '', f.message]);
  for (const c of r.commits) rows.push(['commit', '', '', c.effect, c.type, c.scope, c.breaking ? 'yes' : 'no', c.firstLine]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
