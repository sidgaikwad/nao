import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildChart, DEFAULT_COLORS, pieSliceColor } from '../src/chart-builder';
import { displayChart } from '../src/tools';

const ROWS = [
	{ region: 'Europe', revenue: 30 },
	{ region: 'Asia', revenue: 20 },
];

describe('pie slice colors', () => {
	it('prefers the configured color of a category over the fallback', () => {
		const series = { data_key: 'revenue', category_colors: { Europe: '#123456' } };

		expect(pieSliceColor(series, 'Europe', '#000000')).toBe('#123456');
		expect(pieSliceColor(series, 'Asia', '#000000')).toBe('#000000');
		expect(pieSliceColor(undefined, 'Asia', '#000000')).toBe('#000000');
	});

	it.each(['pie', 'donut'] as const)(
		'draws configured %s slice colors and keeps defaults for the rest',
		(chartType) => {
			const html = renderToString(
				React.cloneElement(
					buildChart({
						data: ROWS,
						chartType,
						xAxisKey: 'region',
						series: [{ data_key: 'revenue', category_colors: { Europe: '#123456' } }],
					}),
					{ width: 400, height: 400 },
				),
			);

			const fills = [
				...html.matchAll(
					/class="recharts-sector[^"]*"[^>]*fill="([^"]+)"|fill="([^"]+)"[^>]*class="recharts-sector/g,
				),
			].map((match) => match[1] ?? match[2]);
			expect(fills).toEqual(['#123456', DEFAULT_COLORS[1]]);
		},
	);

	it('accepts category colors in the display_chart schema', () => {
		const result = displayChart.InputSchema.safeParse({
			query_id: 'query',
			chart_type: 'donut',
			x_axis_key: 'region',
			x_axis_type: 'category',
			series: [{ data_key: 'revenue', category_colors: { Europe: '#123456' } }],
			title: 'Revenue by region',
		});

		expect(result.success).toBe(true);
	});
});
