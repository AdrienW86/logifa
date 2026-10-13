import type { PdfPayload } from '../types/editor';
/** Strict caller boundary; original invoice rendering and legacy VAT behavior retained. */
export function generateFacture(payload: PdfPayload): void;
