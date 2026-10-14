import { describe, expect, it } from 'vitest';

import { renderChartToSvg } from '../src/components/generate-chart';

describe('renderChartToSvg (pie slice colors)', () => {
	it('draws configured slice colors in both the slices and the legend', () => {
		const svg = renderChartToSvg({
			config: {
				chart_type: 'donut',
				x_axis_key: 'region',
				x_axis_type: 'category',
				title: 'Revenue by region',
				series: [{ data_key: 'revenue', category_colors: { Europe: '#123456' } }],
			},
			data: [
				{ region: 'Europe', revenue: 30 },
				{ region: 'Asia', revenue: 20 },
			],
		});

		expect(svg.match(/#123456/g)?.length).toBeGreaterThanOrEqual(2);
	});
});
