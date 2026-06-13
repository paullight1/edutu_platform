/**
 * Export data as a CSV file and trigger browser download.
 * Handles nested objects (flatten one level) and properly escapes commas/quotes.
 */

export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (!data.length) {
    console.warn('exportToCSV: No data to export');
    return;
  }

  const headers = Object.keys(data[0]);

  // Build CSV rows
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];

        if (value === null || value === undefined) {
          return '';
        }

        if (typeof value === 'object' && !Array.isArray(value)) {
          // Flatten nested objects: { key: { sub: val } } → "sub: val"
          const flat = Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
          return escapeCSV(flat);
        }

        if (Array.isArray(value)) {
          return escapeCSV(value.join(', '));
        }

        return escapeCSV(String(value));
      })
      .join(','),
  );

  const csv = [headers.join(','), ...rows].join('\n');

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
