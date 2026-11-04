import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

export interface ScanResult {
	file: string;
	rule: string;
	message: string;
}

export function scanHexColors(file: string, content: string): ScanResult[] {
	if (file.endsWith("tokens.css") || file.endsWith("components.css")) {
		return [];
	}
	const results: ScanResult[] = [];
	const hexRegex =
		/(?:^|[^0-9a-zA-Z_-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;
	let match: RegExpExecArray | null;
	while ((match = hexRegex.exec(content)) !== null) {
		results.push({
			file,
			rule: "no-hex-colors",
			message: `Found hex color "${match[0].trim()}" outside tokens.css`,
		});
	}
	return results;
}

export function scanCoreTokens(file: string, content: string): ScanResult[] {
	if (file.endsWith("tokens.css") || file.endsWith("components.css")) {
		return [];
	}
	const results: ScanResult[] = [];
	const tokenRegex = /--(?:color|spacing)-[a-zA-Z0-9_-]+/g;
	let match: RegExpExecArray | null;
	while ((match = tokenRegex.exec(content)) !== null) {
		results.push({
			file,
			rule: "no-core-tokens",
			message: `Found core token "${match[0]}" outside tokens.css`,
		});
	}
	return results;
}

export function scanClassNames(file: string, content: string): ScanResult[] {
	if (!file.endsWith(".tsx")) {
		return [];
	}
	const results: ScanResult[] = [];
	const sourceFile = ts.createSourceFile(
		file,
		content,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);

	function checkText(text: string): void {
		const classes = text.trim().split(/\s+/).filter(Boolean);
		for (const cls of classes) {
			if (!cls.startsWith("tds-") && !cls.startsWith("app-")) {
				results.push({
					file,
					rule: "valid-class-prefix",
					message: `Class "${cls}" does not start with "tds-" or "app-"`,
				});
			}
		}
	}

	function visitExpr(expr: ts.Expression): void {
		if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
			checkText(expr.text);
		} else if (ts.isTemplateExpression(expr)) {
			checkText(expr.head.text);
			for (const span of expr.templateSpans) {
				visitExpr(span.expression);
				checkText(span.literal.text);
			}
		} else if (ts.isConditionalExpression(expr)) {
			visitExpr(expr.whenTrue);
			visitExpr(expr.whenFalse);
		} else if (ts.isBinaryExpression(expr)) {
			visitExpr(expr.left);
			visitExpr(expr.right);
		} else if (ts.isParenthesizedExpression(expr)) {
			visitExpr(expr.expression);
		}
	}

	function visit(node: ts.Node): void {
		if (
			ts.isJsxAttribute(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "className"
		) {
			if (node.initializer) {
				if (ts.isStringLiteral(node.initializer)) {
					checkText(node.initializer.text);
				} else if (
					ts.isJsxExpression(node.initializer) &&
					node.initializer.expression
				) {
					visitExpr(node.initializer.expression);
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return results;
}

export function scanAppCssSelectors(
	file: string,
	content: string,
): ScanResult[] {
	if (!file.endsWith("app.css")) {
		return [];
	}
	const results: ScanResult[] = [];
	const stripped = content.replace(/\/\*[\s\S]*?\*\//g, "");
	let currentSegment = "";
	for (let i = 0; i < stripped.length; i++) {
		const ch = stripped[i];
		if (ch === "{") {
			const trimmed = currentSegment.trim();
			if (!trimmed.startsWith("@")) {
				const classRegex = /\.([a-zA-Z0-9_-]+)/g;
				let match: RegExpExecArray | null;
				while ((match = classRegex.exec(trimmed)) !== null) {
					const cls = match[1];
					if (!cls.startsWith("app-")) {
						results.push({
							file,
							rule: "app-css-prefix",
							message: `Selector class ".${cls}" in app.css does not start with "app-"`,
						});
					}
				}
			}
			currentSegment = "";
		} else if (ch === "}" || ch === ";") {
			currentSegment = "";
		} else {
			currentSegment += ch;
		}
	}
	return results;
}

export function getDefinedTokens(tokensCssContent: string): Set<string> {
	const definedTokens = new Set<string>();
	const tokenDefRegex = /(--[a-zA-Z0-9_-]+)\s*:/g;
	let match: RegExpExecArray | null;
	while ((match = tokenDefRegex.exec(tokensCssContent)) !== null) {
		definedTokens.add(match[1]);
	}
	return definedTokens;
}

export function scanAppCssUndefinedTokens(
	file: string,
	content: string,
	definedTokens: Set<string>,
): ScanResult[] {
	if (!file.endsWith("app.css")) {
		return [];
	}
	const results: ScanResult[] = [];
	const varRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
	let match: RegExpExecArray | null;
	while ((match = varRegex.exec(content)) !== null) {
		const varName = match[1];
		if (!definedTokens.has(varName)) {
			results.push({
				file,
				rule: "app-css-undefined-token",
				message: `Undefined token "${varName}" in app.css is not defined in tokens.css`,
			});
		}
	}
	return results;
}

export function scanDangerousHtml(file: string, content: string): ScanResult[] {
	if (!file.endsWith(".tsx")) {
		return [];
	}
	const results: ScanResult[] = [];
	if (content.includes("dangerouslySetInnerHTML")) {
		results.push({
			file,
			rule: "no-dangerously-set-inner-html",
			message: "Usage of dangerouslySetInnerHTML is prohibited",
		});
	}
	return results;
}

export function scanFile(
	file: string,
	content: string,
	definedTokens?: Set<string>,
): ScanResult[] {
	return [
		...scanHexColors(file, content),
		...scanCoreTokens(file, content),
		...scanClassNames(file, content),
		...scanAppCssSelectors(file, content),
		...(definedTokens
			? scanAppCssUndefinedTokens(file, content, definedTokens)
			: []),
		...scanDangerousHtml(file, content),
	];
}

function collectRendererFiles(dir: string): string[] {
	const entries = readdirSync(dir);
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			files.push(...collectRendererFiles(full));
		} else if (full.endsWith(".css") || full.endsWith(".tsx")) {
			files.push(full);
		}
	}
	return files;
}

describe("renderer tokens and styling rules scanner", () => {
	it("detects hex colors outside tokens.css in fixture", () => {
		const fixture = `
			.app-panel {
				background: #ffffff;
			}
		`;
		const results = scanHexColors("src/renderer/src/styles/app.css", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("no-hex-colors");
	});

	it("detects core color tokens outside tokens.css in fixture", () => {
		const fixture = `
			.app-header {
				color: var(--color-neutral-100);
			}
		`;
		const results = scanCoreTokens("src/renderer/src/styles/app.css", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("no-core-tokens");
	});

	it("detects core spacing tokens outside tokens.css in fixture", () => {
		const fixture = `
			.app-header {
				padding: var(--spacing-16);
			}
		`;
		const results = scanCoreTokens("src/renderer/src/styles/app.css", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("no-core-tokens");
	});

	it("detects invalid class names in TSX string literal fixture", () => {
		const fixture = `
			export function Component() {
				return <div className="invalid-class app-panel" />;
			}
		`;
		const results = scanClassNames("src/renderer/src/Component.tsx", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("valid-class-prefix");
	});

	it("detects invalid class names in TSX template literal fixture", () => {
		const fixture = `
			export function Component({ active }: { active: boolean }) {
				return <div className={\`app-panel \${active ? "non-tds-badge" : "app-inactive"}\`} />;
			}
		`;
		const results = scanClassNames("src/renderer/src/Component.tsx", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("valid-class-prefix");
	});

	it("detects invalid CSS class selector in app.css fixture", () => {
		const fixture = `
			.custom-card {
				display: flex;
			}
		`;
		const results = scanAppCssSelectors("src/renderer/src/styles/app.css", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("app-css-prefix");
	});

	it("detects invalid CSS class selector inside @media in app.css fixture", () => {
		const fixture = `
			@media (max-width: 768px) {
				.invalid-sidebar {
					display: none;
				}
			}
		`;
		const results = scanAppCssSelectors("src/renderer/src/styles/app.css", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("app-css-prefix");
		expect(results[0]?.message).toContain(".invalid-sidebar");
	});

	it("detects invalid CSS class selector inside @supports in app.css fixture", () => {
		const fixture = `
			@supports (display: grid) {
				.bad-grid-card {
					display: grid;
				}
			}
		`;
		const results = scanAppCssSelectors("src/renderer/src/styles/app.css", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("app-css-prefix");
		expect(results[0]?.message).toContain(".bad-grid-card");
	});

	it("detects undefined tokens in app.css fixture", () => {
		const fixture = `
			.app-panel {
				margin: var(--margin-xs);
				color: var(--text-link-hover);
			}
		`;
		const defined = new Set(["--text-link", "--margin-sm"]);
		const results = scanAppCssUndefinedTokens(
			"src/renderer/src/styles/app.css",
			fixture,
			defined,
		);
		expect(results.length).toBe(2);
		expect(results[0]?.rule).toBe("app-css-undefined-token");
		expect(results[0]?.message).toContain("--margin-xs");
		expect(results[1]?.message).toContain("--text-link-hover");
	});

	it("detects dangerouslySetInnerHTML in TSX fixture", () => {
		const fixture = `
			export function Bad() {
				return <div dangerouslySetInnerHTML={{ __html: "<b>hi</b>" }} />;
			}
		`;
		const results = scanDangerousHtml("src/renderer/src/Bad.tsx", fixture);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.rule).toBe("no-dangerously-set-inner-html");
	});

	it("verifies all renderer styles and TSX files follow token and class rules", () => {
		const rendererSrc = resolve(__dirname, "../../src/renderer/src");
		const tokensPath = join(rendererSrc, "styles/tokens.css");
		const componentsPath = join(rendererSrc, "styles/components.css");
		const appCssPath = join(rendererSrc, "styles/app.css");

		expect(existsSync(tokensPath), "tokens.css must exist").toBe(true);
		expect(existsSync(componentsPath), "components.css must exist").toBe(true);
		expect(existsSync(appCssPath), "app.css must exist").toBe(true);

		const tokensContent = readFileSync(tokensPath, "utf8");
		const definedTokens = getDefinedTokens(tokensContent);

		const files = collectRendererFiles(rendererSrc);
		const allViolations: ScanResult[] = [];
		for (const file of files) {
			const content = readFileSync(file, "utf8");
			allViolations.push(...scanFile(file, content, definedTokens));
		}
		expect(allViolations).toEqual([]);
	});

	it("verifies components.css sections and token definitions in tokens.css", () => {
		const rendererSrc = resolve(__dirname, "../../src/renderer/src");
		const tokensPath = join(rendererSrc, "styles/tokens.css");
		const componentsPath = join(rendererSrc, "styles/components.css");

		if (!existsSync(tokensPath) || !existsSync(componentsPath)) {
			return;
		}

		const tokensContent = readFileSync(tokensPath, "utf8");
		const componentsContent = readFileSync(componentsPath, "utf8");

		// Extract defined tokens from tokens.css
		const definedTokens = new Set<string>();
		const tokenDefRegex = /(--[a-zA-Z0-9_-]+)\s*:/g;
		let match: RegExpExecArray | null;
		while ((match = tokenDefRegex.exec(tokensContent)) !== null) {
			definedTokens.add(match[1]);
		}

		// Extract var(--x) references from components.css
		const varRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
		const undefinedVars = new Set<string>();
		while ((match = varRegex.exec(componentsContent)) !== null) {
			const varName = match[1];
			if (!definedTokens.has(varName)) {
				undefinedVars.add(varName);
			}
		}
		expect(Array.from(undefinedVars)).toEqual([]);

		// Verify every section has a /* tds component: <id> */ header
		const sectionMatches = componentsContent.match(/\/\*\s*tds component:\s*([a-zA-Z0-9_-]+)\s*\*\//g);
		expect(sectionMatches).not.toBeNull();
		expect(sectionMatches!.length).toBeGreaterThanOrEqual(18);
	});
});
