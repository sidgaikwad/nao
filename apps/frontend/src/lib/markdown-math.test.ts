import { describe, expect, it } from 'vitest';
import { normalizeMathDelimiters } from './markdown-math';

const FORMULA = String.raw`messages/user = \frac{\text{message_sent events}}{\text{distinct users}}`;
const ESCAPED_FORMULA = String.raw`messages/user = \frac{\text{message\_sent events}}{\text{distinct users}}`;

describe('normalizeMathDelimiters', () => {
	it.each([
		['single dollars', `$${FORMULA}$`],
		['double dollars', `$$${FORMULA}$$`],
		['escaped parentheses', String.raw`\(` + FORMULA + String.raw`\)`],
		['escaped brackets on their own line', String.raw`\[` + FORMULA + String.raw`\]`],
	])('renders a formula written with %s', (_, markdown) => {
		expect(normalizeMathDelimiters(markdown)).toBe(`$$${ESCAPED_FORMULA}$$`);
	});

	it('keeps inline math within a sentence', () => {
		expect(normalizeMathDelimiters('The ratio $a/b$ grew, and so did \\(c\\).')).toBe(
			'The ratio $$a/b$$ grew, and so did $$c$$.',
		);
	});

	it('turns a bracket-delimited block into a display math block', () => {
		const markdown = ['Formula:', '\\[', '\\text{total_users} = n', '\\]'].join('\n');
		expect(normalizeMathDelimiters(markdown)).toBe(
			['Formula:', '$$', '\\text{total\\_users} = n', '$$'].join('\n'),
		);
	});

	it('leaves an already escaped underscore alone', () => {
		expect(normalizeMathDelimiters(`$$${ESCAPED_FORMULA}$$`)).toBe(`$$${ESCAPED_FORMULA}$$`);
	});

	it.each([
		'Revenue went from $5 to $10.',
		'Pricing is $5 and $10 per seat.',
		'The range is $5-$10.',
		'It costs $5M (vs $3M last year).',
		'An escaped \\$x\\$ stays literal.',
		'Escaped brackets \\[1\\] in a sentence stay text.',
	])('keeps "%s" as text', (markdown) => {
		expect(normalizeMathDelimiters(markdown)).toBe(markdown);
	});

	it('does not touch code', () => {
		const markdown = ['Use `$x$` inline.', '```python', 'price = "$a$"', '```'].join('\n');
		expect(normalizeMathDelimiters(markdown)).toBe(markdown);
	});
});
