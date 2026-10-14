const STORY_TAG_NAMES = ['grid', 'chart', 'table', 'filter', 'map', 'tabs', 'tab'];
const TRAILING_TAG_PATTERN = /<\/?([a-z]*)(\s[^<>]*)?$/;
const GRID_OPENING_PATTERN = /<grid\b/g;
const GRID_CLOSING_TAG = '</grid>';

export interface StreamingStoryCode {
	/** The code up to the first block whose markup is still being written. */
	visibleCode: string;
	hasPendingBlock: boolean;
}

/**
 * Hides the markup of the block a streaming story is in the middle of writing, so readers see the
 * text and a loading block instead of raw `<grid>` or `<chart …` code.
 */
export function splitStreamingStoryCode(code: string): StreamingStoryCode {
	const pendingBlockIndex = findPendingBlockIndex(code);
	if (pendingBlockIndex === -1) {
		return { visibleCode: code, hasPendingBlock: false };
	}
	return { visibleCode: code.slice(0, pendingBlockIndex), hasPendingBlock: true };
}

function findPendingBlockIndex(code: string): number {
	const unclosedGridIndex = findUnclosedGridIndex(code);
	if (unclosedGridIndex !== -1) {
		return unclosedGridIndex;
	}
	return findTrailingTagIndex(code);
}

function findUnclosedGridIndex(code: string): number {
	const lastOpeningIndex = [...code.matchAll(GRID_OPENING_PATTERN)].at(-1)?.index ?? -1;
	const lastClosingIndex = code.lastIndexOf(GRID_CLOSING_TAG);
	return lastOpeningIndex > lastClosingIndex ? lastOpeningIndex : -1;
}

function findTrailingTagIndex(code: string): number {
	const match = TRAILING_TAG_PATTERN.exec(code);
	if (!match) {
		return -1;
	}
	const [, tagName, attributes] = match;
	const isStoryTag = attributes
		? STORY_TAG_NAMES.includes(tagName)
		: STORY_TAG_NAMES.some((name) => name.startsWith(tagName));
	return isStoryTag ? match.index : -1;
}
