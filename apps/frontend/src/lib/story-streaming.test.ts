import { describe, expect, it } from 'vitest';
import { splitStreamingStoryCode } from './story-streaming';

const CHART = '<chart query_id="q1" chart_type="bar" x_axis_key="month" />';

describe('splitStreamingStoryCode', () => {
	it('keeps code whose blocks are all complete', () => {
		const code = `# Revenue\n\n${CHART}\n\nRevenue grew 12%.`;
		expect(splitStreamingStoryCode(code)).toEqual({ visibleCode: code, hasPendingBlock: false });
	});

	it.each([
		['an opening bracket', '<'],
		['a tag name being written', '<cha'],
		['a chart tag missing its end', '<chart query_id="q1" chart_type="ba'],
		['a self-closing tag missing its bracket', '<map query_id="q1" /'],
		['a tab tag', '<tab title="Over'],
	])('hides %s', (_, partialTag) => {
		expect(splitStreamingStoryCode(`# Revenue\n\n${partialTag}`)).toEqual({
			visibleCode: '# Revenue\n\n',
			hasPendingBlock: true,
		});
	});

	it('hides a grid until it is closed, including its complete charts', () => {
		const code = `Intro\n\n<grid cols="2">\n${CHART}\n<chart query_id="q2"`;
		expect(splitStreamingStoryCode(code)).toEqual({ visibleCode: 'Intro\n\n', hasPendingBlock: true });
	});

	it('keeps closed grids and hides only the one being written', () => {
		const closedGrid = `<grid cols="1">\n${CHART}\n</grid>`;
		const code = `${closedGrid}\n\nMore\n\n<grid cols="2">\n${CHART}`;
		expect(splitStreamingStoryCode(code).visibleCode).toBe(`${closedGrid}\n\nMore\n\n`);
	});

	it.each([
		['a comparison', 'Margin is < 5% this quarter'],
		['a number after a bracket', 'Churn went from 3% to <2'],
		['an unrelated tag', 'Use <strong'],
	])('keeps text ending with %s', (_, text) => {
		expect(splitStreamingStoryCode(text)).toEqual({ visibleCode: text, hasPendingBlock: false });
	});
});
