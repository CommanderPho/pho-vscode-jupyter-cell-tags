/**
 * Pure planner for tag-colored cell borders. Kept free of the `vscode` module
 * so unit tests can run in plain Node.
 */

export type ColoredTag = {
	name: string;
	color: string;
};

export type TagColorBorderPlan = {
	primary: ColoredTag | undefined;
	extras: ColoredTag[];
};

export type BoxLineLayout =
	| { kind: 'none' }
	| { kind: 'single'; line: 0 }
	| {
			kind: 'split';
			first: 0;
			middle?: { start: number; endExclusive: number };
			last: number;
	  };

const BORDER_WIDTH_PX = 2;

export const TAG_COLOR_CELL_BORDER_WIDTH = `${BORDER_WIDTH_PX}px`;

/**
 * Keep tags that have a provided (manual) color, in cell tag order.
 * The first colored tag is the full box; the rest become extra stripes.
 */
export function planTagColorBorders(
	tags: string[],
	colorByTag: Record<string, string | undefined>
): TagColorBorderPlan {
	const colored: ColoredTag[] = [];
	for (const name of tags) {
		const color = colorByTag[name];
		if (color) {
			colored.push({ name, color });
		}
	}
	return {
		primary: colored[0],
		extras: colored.slice(1),
	};
}

/**
 * First / middle / last line roles so a multi-line cell can get a single
 * perimeter box without a top+bottom border on every line.
 */
export function boxLineRoles(lineCount: number): BoxLineLayout {
	if (lineCount <= 0) {
		return { kind: 'none' };
	}
	if (lineCount === 1) {
		return { kind: 'single', line: 0 };
	}
	const last = lineCount - 1;
	if (lineCount === 2) {
		return { kind: 'split', first: 0, last };
	}
	return {
		kind: 'split',
		first: 0,
		middle: { start: 1, endExclusive: last },
		last,
	};
}
