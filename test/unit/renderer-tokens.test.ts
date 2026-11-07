import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../src/renderer/src");
const globalsPath = join(root, "styles/globals.css");

export const SEMANTIC_TOKENS = [
	"background",
	"surface",
	"sidebar",
	"elevated",
	"separator",
	"foreground",
	"foreground-secondary",
	"foreground-tertiary",
	"accent",
	"accent-foreground",
	"destructive",
	"destructive-foreground",
	"input",
	"ring",
	"selection",
] as const;

const NAMED_COLORS = [
	"aliceblue",
	"antiquewhite",
	"aqua",
	"aquamarine",
	"azure",
	"beige",
	"bisque",
	"black",
	"blanchedalmond",
	"blue",
	"blueviolet",
	"brown",
	"burlywood",
	"cadetblue",
	"chartreuse",
	"chocolate",
	"coral",
	"cornflowerblue",
	"cornsilk",
	"crimson",
	"cyan",
	"darkblue",
	"darkcyan",
	"darkgoldenrod",
	"darkgray",
	"darkgreen",
	"darkgrey",
	"darkkhaki",
	"darkmagenta",
	"darkolivegreen",
	"darkorange",
	"darkorchid",
	"darkred",
	"darksalmon",
	"darkseagreen",
	"darkslateblue",
	"darkslategray",
	"darkslategrey",
	"darkturquoise",
	"darkviolet",
	"deeppink",
	"deepskyblue",
	"dimgray",
	"dimgrey",
	"dodgerblue",
	"firebrick",
	"floralwhite",
	"forestgreen",
	"fuchsia",
	"gainsboro",
	"ghostwhite",
	"gold",
	"goldenrod",
	"gray",
	"green",
	"greenyellow",
	"grey",
	"honeydew",
	"hotpink",
	"indianred",
	"indigo",
	"ivory",
	"khaki",
	"lavender",
	"lavenderblush",
	"lawngreen",
	"lemonchiffon",
	"lightblue",
	"lightcoral",
	"lightcyan",
	"lightgoldenrodyellow",
	"lightgray",
	"lightgreen",
	"lightgrey",
	"lightpink",
	"lightsalmon",
	"lightseagreen",
	"lightskyblue",
	"lightslategray",
	"lightslategrey",
	"lightsteelblue",
	"lightyellow",
	"lime",
	"limegreen",
	"linen",
	"magenta",
	"maroon",
	"mediumaquamarine",
	"mediumblue",
	"mediumorchid",
	"mediumpurple",
	"mediumseagreen",
	"mediumslateblue",
	"mediumspringgreen",
	"mediumturquoise",
	"mediumvioletred",
	"midnightblue",
	"mintcream",
	"mistyrose",
	"moccasin",
	"navajowhite",
	"navy",
	"oldlace",
	"olive",
	"olivedrab",
	"orange",
	"orangered",
	"orchid",
	"palegoldenrod",
	"palegreen",
	"paleturquoise",
	"palevioletred",
	"papayawhip",
	"peachpuff",
	"peru",
	"pink",
	"plum",
	"powderblue",
	"purple",
	"rebeccapurple",
	"red",
	"rosybrown",
	"royalblue",
	"saddlebrown",
	"salmon",
	"sandybrown",
	"seagreen",
	"seashell",
	"sienna",
	"silver",
	"skyblue",
	"slateblue",
	"slategray",
	"slategrey",
	"snow",
	"springgreen",
	"steelblue",
	"tan",
	"teal",
	"thistle",
	"tomato",
	"turquoise",
	"violet",
	"wheat",
	"white",
	"whitesmoke",
	"yellow",
	"yellowgreen",
];
const namedColor = new RegExp(`^(?:${NAMED_COLORS.join("|")})$`, "i");

export interface ScanResult {
	file: string;
	rule: string;
	message: string;
}

const stripCssComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** Flags hex, rgb/hsl/hwb/lab/lch/oklab/oklch/color() and named colors. `transparent` and `currentColor` pass. */
export function scanColorLiterals(file: string, content: string): ScanResult[] {
	const isCss = file.endsWith(".css");
	const text = isCss ? stripCssComments(content) : content;
	const out: ScanResult[] = [];
	const add = (found: string) => out.push({ file, rule: "no-color-literals", message: `Found color literal ${found}` });
	for (const m of text.matchAll(/(?:^|[^\w&-])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])/gi))
		add(m[0].trim().replace(/^[^#]*/, ""));
	for (const m of text.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)) add(m[0]);
	if (isCss) {
		for (const decl of text.matchAll(/(?:^|[;{])\s*(?!--)([\w-]+)\s*:\s*([^;{}]+)/g)) {
			if (!/color|background|border|outline|fill|stroke|shadow|caret|accent|text-decoration/i.test(decl[1])) continue;
			const value = decl[2].replace(/var\([^)]*\)|url\([^)]*\)/g, "");
			for (const word of value.split(/[^a-z-]+/i)) if (namedColor.test(word)) add(word);
		}
	} else {
		for (const m of text.matchAll(/["'`]\s*(\w+)\s*["'`]/g)) if (namedColor.test(m[1]) && !isProse(text, m)) add(m[1]);
	}
	return out;
}

// A quoted color name is only a color when used as a style or attribute value, not as ordinary text.
function isProse(text: string, m: RegExpMatchArray): boolean {
	const before = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index);
	return !/(?:color|background|fill|stroke|border|outline|boxShadow|backgroundColor)\s*[:=]\s*\{?\s*$/i.test(before);
}

export function scanTdsClasses(file: string, content: string): ScanResult[] {
	return [...content.matchAll(/(?<![\w-])tds-[\w-]+/g)].map((m) => ({
		file,
		rule: "no-tds-classes",
		message: `Found ${m[0]}`,
	}));
}

export function scanDangerousHtml(file: string, content: string): ScanResult[] {
	return file.endsWith(".tsx") && content.includes("dangerouslySetInnerHTML")
		? [{ file, rule: "no-dangerously-set-inner-html", message: "Usage of dangerouslySetInnerHTML is prohibited" }]
		: [];
}

function block(css: string, open: RegExp): string | null {
	const m = open.exec(css);
	if (!m) return null;
	let depth = 1;
	for (let i = m.index + m[0].length; i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}" && --depth === 0) return css.slice(m.index + m[0].length, i);
	}
	return null;
}

export function declared(body: string | null, token: string): string | null {
	return body?.match(new RegExp(`--color-${token}\\s*:\\s*([^;]+);`))?.[1].trim() ?? null;
}

export function lightTokens(css: string): string | null {
	return block(stripCssComments(css), /@theme(?:\s+static)?\s*\{/);
}
export function darkTokens(css: string): string | null {
	const dark = block(stripCssComments(css), /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/);
	return dark && block(dark, /:root\s*\{/);
}

const channel = (v: number) => {
	const c = v / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
	const h = hex.replace("#", "");
	const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

function collect(dir: string): string[] {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? collect(p) : /\.(?:css|tsx?)$/.test(p) ? [p] : [];
	});
}
const files = () => collect(root);
const rel = (f: string) => relative(root, f).replaceAll("\\", "/");

const BUILTIN_SUFFIXES: Record<string, string[]> = {
	bg: [
		"transparent",
		"current",
		"inherit",
		"none",
		"clip-border",
		"clip-padding",
		"clip-content",
		"clip-text",
		"fixed",
		"local",
		"scroll",
		"cover",
		"contain",
		"center",
		"no-repeat",
		"repeat",
	],
	text: [
		"left",
		"center",
		"right",
		"justify",
		"start",
		"end",
		"wrap",
		"nowrap",
		"balance",
		"pretty",
		"ellipsis",
		"clip",
		"transparent",
		"current",
		"inherit",
	],
	border: [
		"0",
		"2",
		"4",
		"8",
		"solid",
		"dashed",
		"dotted",
		"none",
		"collapse",
		"separate",
		"transparent",
		"current",
		"inherit",
		"t",
		"b",
		"l",
		"r",
		"x",
		"y",
		"s",
		"e",
	],
	rounded: ["none", "full"],
	shadow: ["none"],
};

function scanUnknownUtilities(file: string, text: string, tokens: Set<string>) {
	const hits: string[] = [];
	for (const m of text.matchAll(/(?<![\w.-])(?:[\w[\]&>*=-]+:)*!?(bg|text|border|rounded|shadow)-([^\s"'`}]+)/g)) {
		const [, kind, rest] = m;
		let suffix = rest.split("/")[0];
		if (suffix.startsWith("[") || suffix.startsWith("(") || suffix.endsWith("]")) continue;
		if (kind === "border") suffix = suffix.replace(/^[trblxyse]-(?=.)/, "");
		if (tokens.has(suffix) || BUILTIN_SUFFIXES[kind].includes(suffix)) continue;
		hits.push(`${file}: ${kind}-${suffix}`);
	}
	return hits;
}

describe("renderer scanner helpers", () => {
	it("flags color literals and permits transparent, currentColor, and var()", () => {
		expect(scanColorLiterals("a.css", "a{color:#fff}")).toHaveLength(1);
		expect(scanColorLiterals("a.css", "a{color:#ffffff80;background:rgb(0 0 0 / 4%)}")).toHaveLength(2);
		expect(scanColorLiterals("a.css", "a{color:oklch(0.5 0.1 200)}")).toHaveLength(1);
		expect(scanColorLiterals("a.css", "a{color:red;border:1px solid white}")).toHaveLength(2);
		expect(
			scanColorLiterals("a.css", "a{color:currentColor;background:transparent;border-color:var(--color-ring)}"),
		).toEqual([]);
		expect(scanColorLiterals("a.css", "/* #fff red */ a{color:var(--color-red)}")).toEqual([]);
		expect(scanColorLiterals("a.css", "a{--color-x:#fff}")).toHaveLength(1);
		expect(scanColorLiterals("a.css", "a{font-family:Georgia;content:'red'}")).toEqual([]);
	});
	it("flags color literals in TSX but not prose or anchors", () => {
		expect(scanColorLiterals("a.tsx", `<div style={{ color: "#abc" }} />`)).toHaveLength(1);
		expect(scanColorLiterals("a.tsx", `<path fill="red" />`)).toHaveLength(1);
		expect(scanColorLiterals("a.tsx", `<div className="bg-[rgb(1,2,3)]" />`)).toHaveLength(1);
		expect(scanColorLiterals("a.tsx", `<p>{"red"}</p>`)).toEqual([]);
		expect(scanColorLiterals("a.tsx", `<a href="#root">x</a> &#123;`)).toEqual([]);
		expect(scanColorLiterals("a.tsx", `<path fill="currentColor" stroke="transparent" />`)).toEqual([]);
	});
	it("flags tds- classes but not other words", () => {
		expect(scanTdsClasses("a.tsx", `<div className="tds-btn tds-btn--sm app-x" />`)).toHaveLength(2);
		expect(scanTdsClasses("a.tsx", `<div className="nds-btn" />`)).toEqual([]);
	});
	it("flags utilities whose suffix is not a token or surviving built-in", () => {
		const tokens = new Set(["background", "control"]);
		expect(
			scanUnknownUtilities(
				"a.tsx",
				`"bg-background text-left border-2 rounded-control hover:bg-background/50"`,
				tokens,
			),
		).toEqual([]);
		expect(
			scanUnknownUtilities("a.tsx", `"bg-white hover:text-gray-500 border-red-500 rounded-lg shadow-md"`, tokens),
		).toHaveLength(5);
	});
	it("computes WCAG contrast", () => {
		expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
		expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
	});
	it("forbids dangerouslySetInnerHTML in renderer TSX only", () => {
		expect(scanDangerousHtml("a.tsx", "<div dangerouslySetInnerHTML={h}/>")).toHaveLength(1);
		expect(scanDangerousHtml("a.ts", "dangerouslySetInnerHTML")).toEqual([]);
	});
});

describe("renderer sources", () => {
	it("has no tds- classes", () => {
		expect(files().flatMap((f) => scanTdsClasses(rel(f), readFileSync(f, "utf8")))).toEqual([]);
	});
	it("has no TDS files", () => {
		expect(existsSync(join(root, "styles/tds"))).toBe(false);
		expect(existsSync(join(root, "styles/tokens.css"))).toBe(false);
		expect(existsSync(join(root, "styles/app.css"))).toBe(false);
		expect(readdirSync(join(root, "styles"))).toEqual(["globals.css"]);
	});
	it("has no color literals outside globals.css", () => {
		const hits = files()
			.filter((f) => f !== globalsPath)
			.flatMap((f) => scanColorLiterals(rel(f), readFileSync(f, "utf8")));
		expect(hits).toEqual([]);
	});
	it("uses only tokens or surviving built-ins in bg-, text-, border-, rounded-, and shadow- utilities", () => {
		const css = readFileSync(globalsPath, "utf8");
		const tokens = new Set([...css.matchAll(/--(?:color|text|radius|shadow)-([\w-]+)\s*:/g)].map((m) => m[1]));
		const hits = files()
			.filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
			.flatMap((f) => scanUnknownUtilities(rel(f), readFileSync(f, "utf8"), tokens));
		expect(hits).toEqual([]);
	});
	it("has no dangerouslySetInnerHTML", () => {
		expect(files().flatMap((f) => scanDangerousHtml(rel(f), readFileSync(f, "utf8")))).toEqual([]);
	});
});

describe("globals.css semantic tokens", () => {
	const css = readFileSync(globalsPath, "utf8");
	const light = lightTokens(css);
	const dark = darkTokens(css);

	it("exempts motion-reduce:animate-pulse elements from the reduced-motion animation override", () => {
		expect(css).toMatch(/\*:not\(\[class\*="motion-reduce:animate-pulse"\]\)/);
	});
	it("sets color-scheme light dark", () => {
		expect(css).toMatch(/color-scheme\s*:\s*light dark\s*;/);
	});
	it("selects dark through prefers-color-scheme", () => {
		expect(dark).not.toBeNull();
	});
	it.each(SEMANTIC_TOKENS)("defines --color-%s for light and dark", (token) => {
		expect(declared(light, token), "light").toMatch(/^#[\da-f]{6}$/i);
		expect(declared(dark, token), "dark").toMatch(/^#[\da-f]{6}$/i);
	});
	it("uses different dark surfaces and text", () => {
		for (const t of ["background", "surface", "foreground"]) expect(declared(dark, t)).not.toBe(declared(light, t));
	});
	it("honors prefers-reduced-motion", () => {
		expect(css).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
	});
	it("keeps Inter bundled as the fallback font", () => {
		expect(css).toMatch(/font-family:\s*"Inter"/);
		expect(css).toMatch(/InterVariable\.woff2/);
		expect(css).toMatch(/-apple-system,\s*BlinkMacSystemFont,\s*"SF Pro Text"/);
	});
	it.each([
		["light", () => light],
		["dark", () => dark],
	] as const)("meets WCAG AA in %s", (_name, get) => {
		const body = get();
		const c = (a: string, b: string) => contrast(declared(body, a) ?? "#000000", declared(body, b) ?? "#000000");
		for (const bg of ["background", "surface", "sidebar", "elevated"]) {
			expect(c("foreground", bg), `foreground on ${bg}`).toBeGreaterThanOrEqual(4.5);
			expect(c("foreground-secondary", bg), `secondary on ${bg}`).toBeGreaterThanOrEqual(4.5);
			expect(c("foreground-tertiary", bg), `tertiary on ${bg}`).toBeGreaterThanOrEqual(4.5);
		}
		expect(c("foreground", "selection"), "foreground on selection").toBeGreaterThanOrEqual(4.5);
		expect(c("accent", "background"), "accent on background").toBeGreaterThanOrEqual(4.5);
		expect(c("accent-foreground", "accent"), "accent-foreground on accent").toBeGreaterThanOrEqual(4.5);
		expect(c("destructive", "background"), "destructive on background").toBeGreaterThanOrEqual(4.5);
		expect(c("destructive-foreground", "destructive"), "destructive-foreground on destructive").toBeGreaterThanOrEqual(
			4.5,
		);
		expect(c("ring", "background"), "focus ring on background").toBeGreaterThanOrEqual(3);
		expect(c("ring", "surface"), "focus ring on surface").toBeGreaterThanOrEqual(3);
		expect(c("input", "background"), "control border on background").toBeGreaterThanOrEqual(3);
		expect(c("input", "elevated"), "control border on elevated").toBeGreaterThanOrEqual(3);
	});
});
