export const DEFAULT_REPORT_PROMPT = `Program: {program}
Period: {date_from} to {date_to}
Entries (date | department | task | notes):
{entries}

Instructions:
1. period_covered: format the date range like "November 3–13, 2026".
2. specific_tasks: group the entries by type of work and write one imperative sentence per group (e.g. "Install, configure, and troubleshoot printers..."). Merge duplicates and use the notes to decide wording.
3. output: one past-tense sentence per group mirroring specific_tasks. End each with "Total: N <items>." Count from the entries and use notes for quantities. Never invent tasks or numbers not in the entries.`;

export function renderReportPrompt(template, values) {
  return template.replace(/\{(program|date_from|date_to|entries)\}/g, function (match, name) {
    return values[name];
  });
}
