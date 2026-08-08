/**
 * Gemeinsame Primitive für die von den Extensions verwalteten Marker-Blöcke in
 * Kunden-`.htaccess`-Dateien (`# BEGIN …` / `# END …`). Zentralisiert die
 * Regex-basierte Block-Chirurgie, die zuvor in jeder Extension einzeln
 * implementiert war — Inhalte außerhalb der eigenen Marker dürfen unter keinen
 * Umständen verändert werden.
 *
 * Kompatibilität: Die Marker werden als vollständige Zeilen gematcht (damit
 * `# BEGIN foo` niemals den Block von `# BEGIN foo-v2` trifft). Alle von den
 * Extension-Generatoren geschriebenen Blöcke beginnen die Marker am
 * Zeilenanfang; LF- und CRLF-Dateien sowie Trailing-Whitespace hinter den
 * Markern werden erkannt.
 */

export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Startmarker als komplette Zeile; verbraucht den Zeilenumbruch danach. */
const startLine = (marker: string): string =>
  `(?<=^|\\n)${escapeRegex(marker)}[^\\S\\n]*\\r?\\n`;

/** Endmarker als komplette Zeile; der Zeilenumbruch danach bleibt stehen. */
const endLine = (marker: string): string =>
  `(?<=\\n)[^\\S\\n]*${escapeRegex(marker)}(?=[^\\S\\n]*\\r?(?:\\n|$))`;

const blockRegex = (startMarker: string, endMarker: string): RegExp =>
  new RegExp(
    `${startLine(startMarker)}([\\s\\S]*?)${endLine(endMarker)}`,
    "g",
  );

/** Ganzer Block inklusive Marker und einem folgenden Zeilenumbruch. */
const blockWithTrailingNewlineRegex = (
  startMarker: string,
  endMarker: string,
): RegExp =>
  new RegExp(
    `${startLine(startMarker)}[\\s\\S]*?${endLine(endMarker)}[^\\S\\n]*\\r?\\n?`,
    "g",
  );

export const hasMarkerBlock = (
  content: string,
  startMarker: string,
  endMarker: string,
): boolean => blockRegex(startMarker, endMarker).test(content);

/**
 * Liefert den Inhalt zwischen den Marker-Zeilen (ohne die Marker selbst)
 * oder null, wenn kein Block existiert. Bei mehreren Blöcken der erste.
 */
export const extractMarkerBlock = (
  content: string,
  startMarker: string,
  endMarker: string,
): string | null => {
  const match = blockRegex(startMarker, endMarker).exec(content);
  return match ? match[1] : null;
};

/**
 * Entfernt alle Blöcke inklusive Marker; eine direkt auf den Endmarker
 * folgende Leerzeile wird mit aufgeräumt.
 */
export const removeMarkerBlock = (
  content: string,
  startMarker: string,
  endMarker: string,
): string =>
  content.replace(blockWithTrailingNewlineRegex(startMarker, endMarker), "");

/**
 * Ersetzt einen bestehenden Block (inklusive Marker) durch `block` oder hängt
 * `block` andernfalls ans Ende an. `block` muss die Marker selbst enthalten.
 */
export const upsertMarkerBlock = (
  content: string,
  startMarker: string,
  endMarker: string,
  block: string,
): string => {
  // Trailing-Whitespace/-Newlines am Block normalisieren, sonst wächst die
  // Datei bei wiederholtem Upsert um Leerzeilen (Idempotenz).
  const normalizedBlock = block.replace(/\s+$/, "");

  if (hasMarkerBlock(content, startMarker, endMarker)) {
    const blockWithSuffix = new RegExp(
      `${startLine(startMarker)}[\\s\\S]*?${endLine(endMarker)}[^\\S\\n]*`,
      "g",
    );
    return content.replace(blockWithSuffix, () => normalizedBlock);
  }

  if (content === "") {
    return `${normalizedBlock}\n`;
  }

  return `${content.replace(/\n*$/, "")}\n\n${normalizedBlock}\n`;
};
