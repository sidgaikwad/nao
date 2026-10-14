import { transformMarkdownOutsideCodeBlocks } from '@/lib/markdown';

const MATH_DELIMITER = '$$';
const INLINE_CODE_PATTERN = /(`[^`]*`)/;
const DISPLAY_MATH_FENCES = new Set(['$$', '\\[', '\\]']);
const DISPLAY_MATH_LINE_PATTERN = /^(\s*)\\\[(.+)\\\]\s*$/;
const PARENTHESIS_MATH_PATTERN = /\\\((.+?)\\\)/g;
/** Pandoc's rule: no space inside the dollars and no digit right after the closing one, so "$5 and $10" stays text. */
const SINGLE_DOLLAR_MATH_PATTERN = /(?<![\\$])\$(?![\s$])((?:\\.|[^$\\])+?)(?<!\s)\$(?![$\d])/g;
const DOUBLE_DOLLAR_MATH_PATTERN = /\$\$(.+?)\$\$/g;
const TEXT_COMMAND_PATTERN = /\\(text|textbf|textit|textrm|textsf|texttt|mbox)\{([^{}]*)\}/g;
const UNESCAPED_UNDERSCORE_PATTERN = /(?<!\\)_/g;

/**
 * Rewrites the math delimiters models commonly write (`$…$`, `\(…\)`, `\[…\]`) into the `$$…$$` form the
 * markdown renderer parses, and escapes underscores inside `\text{…}`, which KaTeX rejects.
 */
export function normalizeMathDelimiters(markdown: string): string {
	let isInDisplayMath = false;

	return transformMarkdownOutsideCodeBlocks(markdown, (line) => {
		if (DISPLAY_MATH_FENCES.has(line.trim())) {
			isInDisplayMath = !isInDisplayMath;
			return line.replace(line.trim(), () => MATH_DELIMITER);
		}
		if (isInDisplayMath) {
			return escapeTextUnderscores(line);
		}
		const displayMath = DISPLAY_MATH_LINE_PATTERN.exec(line);
		if (displayMath) {
			const [, indentation, content] = displayMath;
			return indentation + wrapMath(escapeTextUnderscores(content));
		}
		return transformOutsideInlineCode(line, normalizeInlineMath);
	});
}

function transformOutsideInlineCode(line: string, transform: (text: string) => string): string {
	return line
		.split(INLINE_CODE_PATTERN)
		.map((segment, index) => (index % 2 === 0 ? transform(segment) : segment))
		.join('');
}

function normalizeInlineMath(text: string): string {
	return text
		.replace(PARENTHESIS_MATH_PATTERN, (_, content: string) => wrapMath(content))
		.replace(SINGLE_DOLLAR_MATH_PATTERN, (_, content: string) => wrapMath(content))
		.replace(DOUBLE_DOLLAR_MATH_PATTERN, (_, content: string) => wrapMath(escapeTextUnderscores(content)));
}

function wrapMath(content: string): string {
	return `${MATH_DELIMITER}${content}${MATH_DELIMITER}`;
}

function escapeTextUnderscores(math: string): string {
	return math.replace(
		TEXT_COMMAND_PATTERN,
		(_, command: string, text: string) => `\\${command}{${text.replace(UNESCAPED_UNDERSCORE_PATTERN, '\\_')}}`,
	);
}
