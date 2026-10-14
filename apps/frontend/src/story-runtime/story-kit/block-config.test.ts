import { describe, expect, it } from 'vitest';

import { chartBlockConfig, kitBlockFromConfig } from './block-config';
import { piePresentation } from './pie';

const CATEGORY_COLORS = { Europe: '#123456' };

describe('pie slice colors in story-kit charts', () => {
	it('round-trips category colors between block props and chart config', () => {
		const config = chartBlockConfig(
			'donut',
			'query',
			'Revenue by region',
			{ xAxisKey: 'region', series: [{ key: 'revenue', categoryColors: CATEGORY_COLORS }] },
			{},
		);

		expect(config.series[0]?.category_colors).toEqual(CATEGORY_COLORS);
		expect(kitBlockFromConfig(config).props.series).toEqual([{ key: 'revenue', categoryColors: CATEGORY_COLORS }]);
	});

	it('colors configured slices and keeps the palette for the rest', () => {
		const pie = piePresentation(
			[
				{ region: 'Europe', revenue: 30 },
				{ region: 'Asia', revenue: 20 },
			],
			'region',
			{ data_key: 'revenue', category_colors: CATEGORY_COLORS },
		);

		expect(pie.legendPayload.map((entry) => entry.color)).toEqual(['#123456', 'var(--chart-2)']);
	});
});
