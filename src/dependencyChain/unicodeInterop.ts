/**
 * Replace unpaired UTF-16 surrogates with U+FFFD so the text is safe for
 * UTF-8 JSON over a pipe to Python (json.dump rejects lone surrogates).
 * Valid surrogate pairs (e.g. emoji) are preserved.
 */
export function stripLoneSurrogates(text: string): string {
	return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}
