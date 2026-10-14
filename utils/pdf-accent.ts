/** jsPDF and autoTable expect numeric RGB channels, not CSS hex strings. */
export function pdfAccentRgb(color: unknown): [number, number, number] {
  if (typeof color !== "string" || !/^#[\da-fA-F]{6}$/.test(color)) return [41, 87, 70];
  return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16)) as [number, number, number];
}
