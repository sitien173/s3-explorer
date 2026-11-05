export interface SelectionState {
	selected: string[];
	active: string | null;
	anchor: string | null;
}

export const initialSelection: SelectionState = {
	selected: [],
	active: null,
	anchor: null,
};

export type SelectionAction =
	| {
			type: "select" | "toggle" | "range" | "move" | "home" | "end" | "all";
			key?: string;
			keys: string[];
			delta?: number;
			extend?: boolean;
			page?: boolean;
			pageSize?: number;
	  }
	| { type: "replace"; state: SelectionState }
	| { type: "clear" }
	| { type: "reset" };

export function selectionReducer(
	state: SelectionState,
	action: SelectionAction,
): SelectionState {
	if (action.type === "replace") return action.state;
	if (action.type === "reset") return initialSelection;
	if (action.type === "clear") return { ...initialSelection };

	const { keys } = action;
	if (action.type === "all") {
		return {
			selected: [...keys],
			active: keys[0] ?? null,
			anchor: keys[0] ?? null,
		};
	}
	if (!keys.length) return initialSelection;

	if (action.type === "select" || action.type === "toggle" || action.type === "range") {
		const key = action.key!;
		if (action.type === "select") {
			return { selected: [key], active: key, anchor: key };
		}
		if (action.type === "toggle") {
			const selected = state.selected.includes(key)
				? state.selected.filter((selectedKey) => selectedKey !== key)
				: [...state.selected, key];
			const rawAnchor = state.anchor ?? key;
			const anchor = keys.includes(rawAnchor) ? rawAnchor : key;
			return {
				selected,
				active: key,
				anchor,
			};
		}
		const anchor = state.anchor && keys.includes(state.anchor)
			? state.anchor
			: state.active && keys.includes(state.active)
				? state.active
				: key;
		const anchorIndex = keys.indexOf(anchor);
		const keyIndex = keys.indexOf(key);
		return {
			selected: keys.slice(
					Math.min(anchorIndex, keyIndex),
					Math.max(anchorIndex, keyIndex) + 1,
				),
			active: key,
			anchor,
		};
	}

	const currentIndex = keys.indexOf(state.active && keys.includes(state.active) ? state.active : keys[0]);
	const startKey = keys[currentIndex >= 0 ? currentIndex : 0];
	const step = action.page ? (action.pageSize ?? 10) : 1;
	const index =
		action.type === "home"
			? 0
			: action.type === "end"
				? keys.length - 1
				: Math.max(
						0,
						Math.min(
							keys.length - 1,
							currentIndex + (action.delta ?? 0) * step,
						),
					);
	const key = keys[index];
	if (action.extend) {
		const anchor = state.anchor && keys.includes(state.anchor)
			? state.anchor
			: state.active && keys.includes(state.active)
				? state.active
				: startKey;
		const anchorIndex = keys.indexOf(anchor);
		return {
			selected: keys.slice(
					Math.min(anchorIndex, index),
					Math.max(anchorIndex, index) + 1,
				),
			active: key,
			anchor,
		};
	}
	return { selected: [key], active: key, anchor: key };
}

export interface KeyboardInput {
	key: string;
	shiftKey?: boolean;
	altKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	selectionCount?: number;
}

export function keyboardAction(event: KeyboardInput): string | null {
	const {
		key,
		shiftKey,
		altKey,
		ctrlKey,
		metaKey,
		selectionCount = 0,
	} = event;
	if ((altKey && key === "ArrowUp") || key === "Backspace") return "parent";
	if ((ctrlKey || metaKey) && key.toLowerCase() === "a") return "select-all";
	if (key === "ArrowUp" || key === "ArrowDown") {
		const direction = key === "ArrowUp" ? "up" : "down";
		return shiftKey ? `extend-${direction}` : `move-${direction}`;
	}
	if (key === "Home") return "home";
	if (key === "End") return "end";
	if (key === "PageUp") return "page-up";
	if (key === "PageDown") return "page-down";
	if (key === " " || key === "Space") return "toggle";
	if (key === "Escape") return "clear";
	if (key === "Enter") return selectionCount === 1 ? "open" : null;
	if (key === "Delete") return "delete";
	if (key === "F2") return selectionCount === 1 ? "rename" : null;
	if (key === "ContextMenu" || (key === "F10" && shiftKey)) return "context-menu";
	return null;
}
