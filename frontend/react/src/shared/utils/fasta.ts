export interface FastaRecord {
  name: string;
  sequence: string;
}

export function parseFasta(text: string): FastaRecord[] {
  const records: FastaRecord[] = [];
  let current: FastaRecord | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(">")) {
      current = { name: line.slice(1).trim() || `Sequence ${records.length + 1}`, sequence: "" };
      records.push(current);
    } else if (current) {
      current.sequence += line.replace(/\s+/g, "");
    }
  }

  return records.filter((record) => record.sequence.length > 0);
}

export function recordsToFasta(records: FastaRecord[]): string {
  return records
    .map((record) => {
      const lines = record.sequence.match(/.{1,80}/g) ?? [record.sequence];
      return [`>${record.name}`, ...lines].join("\n");
    })
    .join("\n");
}
