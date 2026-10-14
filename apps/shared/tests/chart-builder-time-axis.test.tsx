import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildChart, type BuildChartProps, timestampToIsoDate, usesTimeXAxis } from '../src/chart-builder';

const ROWS_WITH_MISSING_DAYS = [
	{ day: '2024-07-27', value: 4 },
	{ day: '2024-07-22', value: 1 },
	{ day: '2024-07-23', value: 2 },
	{ day: '2024-07-24', value: 3 },
];

const LINE_CHART_PROPS: BuildChartProps = {
	data: ROWS_WITH_MISSING_DAYS,
	chartType: 'line',
	xAxisKey: 'day',
	xAxisType: 'date',
	series: [{ data_key: 'value' }],
};

describe('continuous date x-axis', () => {
	it('keeps the width of missing dates on line charts', () => {
		const ticks = renderXAxisTicks(LINE_CHART_PROPS);

		expect(ticks.map((tick) => tick.label)).toEqual(['22/07/2024', '23/07/2024', '24/07/2024', '27/07/2024']);
		const dayWidth = ticks[1].x - ticks[0].x;
		expect(ticks[3].x - ticks[2].x).toBeCloseTo(dayWidth * 3);
	});

	it('spaces categorical x-axes evenly', () => {
		const ticks = renderXAxisTicks({ ...LINE_CHART_PROPS, xAxisType: 'category' });

		const categoryWidth = ticks[1].x - ticks[0].x;
		expect(ticks[3].x - ticks[2].x).toBeCloseTo(categoryWidth);
	});

	it('only applies to line and area charts with ISO date values', () => {
		expect(usesTimeXAxis(LINE_CHART_PROPS)).toBe(true);
		expect(usesTimeXAxis({ ...LINE_CHART_PROPS, chartType: 'stacked_area' })).toBe(true);
		expect(usesTimeXAxis({ ...LINE_CHART_PROPS, chartType: 'bar' })).toBe(false);
		expect(usesTimeXAxis({ ...LINE_CHART_PROPS, xAxisType: 'category' })).toBe(false);
		expect(usesTimeXAxis({ ...LINE_CHART_PROPS, data: [...ROWS_WITH_MISSING_DAYS, { day: 'Q3', value: 5 }] })).toBe(
			false,
		);
	});

	it('converts time axis tooltip labels back to ISO dates', () => {
		expect(timestampToIsoDate(Date.UTC(2024, 6, 25))).toBe('2024-07-25T00:00:00.000Z');
		expect(timestampToIsoDate('2024-07-25')).toBe('2024-07-25');
	});
});

interface RenderedTick {
	x: number;
	label: string;
}

function renderXAxisTicks(props: BuildChartProps): RenderedTick[] {
	const html = renderToString(React.cloneElement(buildChart(props), { width: 600, height: 400 }));
	const xAxis = html.match(/recharts-xAxis(.*?)<\/g><\/g><\/g>/s)?.[1] ?? '';
	return [...xAxis.matchAll(/<tspan x="([\d.]+)"[^>]*>([^<]*)<\/tspan>/g)].map((match) => ({
		x: Number(match[1]),
		label: match[2],
	}));
}
