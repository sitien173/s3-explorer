import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

export interface ScanResult { file: string; rule: string; message: string }
const allowedException = (file: string) => /(?:^|[\\/])styles[\\/]tds[\\/]/.test(file) || file.endsWith("tokens.css");
export function scanHexColors(file: string, content: string): ScanResult[] {
 if (allowedException(file)) return [];
 return [...content.matchAll(/(?:^|[^\w-])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])/gi)].map(m=>({file,rule:"no-hex-colors",message:`Found hex color ${m[0].trim()}`}));
}
export function scanCoreTokens(file: string, content: string): ScanResult[] {
 if (allowedException(file)) return [];
 const allowedGlobals = file.endsWith("globals.css") ? content.replace(/@theme(?:\s+inline)?\s*\{[^}]*\}/g, "") : content;
 return [...allowedGlobals.matchAll(/--(?:color|spacing)-[\w-]+/g)].map(m=>({file,rule:"no-core-tokens",message:`Found core token ${m[0]}`}));
}
const layout = new Set(["flex","inline-flex","grid","inline-grid","block","inline-block","hidden","contents","relative","absolute","fixed","sticky","static","truncate","sr-only","not-sr-only","overflow-hidden","overflow-auto","overflow-scroll","overflow-visible","whitespace-nowrap","whitespace-normal","select-none","pointer-events-none","pointer-events-auto","grow","shrink","grow-0","shrink-0","flex-wrap","flex-nowrap","flex-col","flex-row","flex-1","min-w-0","min-h-0","w-full","h-full","size-full","w-auto","h-auto","w-0","h-0","w-1/2","w-1/3","w-2/3","h-1/2"]);
const utilityAllowed = (c:string) => layout.has(c) || /^(?:items|justify|content|self|place-items|place-content)-(?:start|end|center|between|around|evenly|stretch|baseline)$/.test(c) || /^(?:gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|min-w|max-w|h|min-h|max-h)-(?:\(--[\w-]+\)|(?:\d+\/\d+|full|auto|0))$/.test(c);
function classError(c:string,file:string,definedTokens?:Set<string>): string | null {
 if (definedTokens && [...c.matchAll(/\((--[\w-]+)\)/g)].some(m=>!definedTokens.has(m[1]))) return `Undefined token value in ${c}`;
 const local = file.replaceAll("\\","/").includes("/components/ui/");
 if (local) {
   const bridgedColor = /^(?:bg|text|border|ring|fill|stroke|outline)-(?:\(--[\w-]+\)|background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|input|ring)$/.test(c);
   const structural = c === "border" || /^(?:border|ring|ring-offset|outline)-(?:[trblxyse]|\d+(?:\.\d+)?|solid|dashed|dotted|double|hidden|none|inset)$/.test(c) || /^text-(?:left|right|center|justify|start|end)$/.test(c) || /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|[1-9]00)$/.test(c);
   if (/^(?:bg|text|border|ring|fill|stroke|outline)-/.test(c) && !structural && !bridgedColor) return `Unbridged color utility ${c}`;
   if (c === "font-sans") return null;
   if (/^(?:text|rounded|shadow|font)-/.test(c) && !structural && !bridgedColor && !/(?:text|rounded|shadow|font)-(?:\(--[\w-]+\)|inherit|current|none)$/.test(c)) return `Non-token design utility ${c}`;
   return null;
 }
 if(c.startsWith("tds-")||c.startsWith("app-")||utilityAllowed(c)) return null;
 return `Class ${c} is not allowed`;
}
export function scanClassNames(file:string,content:string,definedTokens?:Set<string>):ScanResult[] {
 if(!file.endsWith(".tsx")) return [];
 const out:ScanResult[]=[]; const seen=new Set<string>(); const sf=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const check=(s:string,pos:number)=>s.split(/\s+/).filter(Boolean).forEach((raw,index)=>{const c=raw.split(":").at(-1)!;const err=classError(c,file,definedTokens);const key=`${pos}:${index}:${err}`;if(err&&!seen.has(key)){seen.add(key);out.push({file,rule:"valid-class-prefix",message:err})}});
 const visitExpr=(e:ts.Expression)=>{if(ts.isStringLiteralLike(e))check(e.text,e.pos);else if(ts.isTemplateExpression(e)){check(e.head.text,e.pos);e.templateSpans.forEach(x=>{visitExpr(x.expression);check(x.literal.text,x.literal.pos)})}else if(ts.isArrayLiteralExpression(e))e.elements.forEach(x=>ts.isExpression(x)&&visitExpr(x));else if(ts.isObjectLiteralExpression(e))e.properties.forEach(x=>{if("name" in x&&x.name){if(ts.isIdentifier(x.name)||ts.isStringLiteral(x.name)||ts.isNoSubstitutionTemplateLiteral(x.name)){check(x.name.text,x.name.pos)}else if(ts.isNumericLiteral(x.name)){check(x.name.text,x.name.pos)}else if(ts.isComputedPropertyName(x.name)){const key=`${x.name.pos}:0:computed`;if(!seen.has(key)){seen.add(key);out.push({file,rule:"valid-class-prefix",message:"Computed class key is not allowed"})}}}if(ts.isPropertyAssignment(x))visitExpr(x.initializer)});else if(ts.isConditionalExpression(e)){visitExpr(e.whenTrue);visitExpr(e.whenFalse)}else if(ts.isBinaryExpression(e)){visitExpr(e.left);visitExpr(e.right)}else if(ts.isCallExpression(e)){const n=e.expression.getText(sf);if(/\b(?:cn|cva)$/.test(n))e.arguments.forEach(visitExpr)}else if(ts.isParenthesizedExpression(e))visitExpr(e.expression)};
 const visit=(n:ts.Node)=>{if(ts.isJsxAttribute(n)&&n.name.getText(sf)==="className"&&n.initializer){if(ts.isStringLiteral(n.initializer))check(n.initializer.text,n.initializer.pos);else if(ts.isJsxExpression(n.initializer)&&n.initializer.expression)visitExpr(n.initializer.expression)} if(ts.isCallExpression(n)&&/\b(?:cn|cva)$/.test(n.expression.getText(sf)))n.arguments.forEach(visitExpr);ts.forEachChild(n,visit)};visit(sf);return out;
}
export function scanAppCssSelectors(file:string,content:string):ScanResult[]{if(!file.endsWith("app.css"))return[];const out:ScanResult[]=[];const stripped=content.replace(/\/\*[\s\S]*?\*\//g,"");let segment="";for(const ch of stripped){if(ch==="{"){if(!segment.trim().startsWith("@"))for(const m of segment.matchAll(/\.([\w-]+)/g))if(!m[1].startsWith("app-") && !(m[1] === "tds-side-nav" && /\.app-sidebar\.tds-side-nav/.test(segment)))out.push({file,rule:"app-css-prefix",message:`Selector class .${m[1]} in app.css does not start with app-`});segment=""}else if(ch==="}"||ch===";")segment="";else segment+=ch}return out}
export function getDefinedTokens(s:string):Set<string>{return new Set([...s.matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]))}
export function scanAppCssUndefinedTokens(file:string,content:string,defined:Set<string>):ScanResult[]{if(!file.endsWith("app.css"))return[];return [...content.matchAll(/var\(\s*(--[\w-]+)/g)].filter(m=>!defined.has(m[1])).map(m=>({file,rule:"app-css-undefined-token",message:`Undefined token ${m[1]} in app.css`}))}
export function scanDangerousHtml(file:string,content:string):ScanResult[]{return file.endsWith(".tsx")&&content.includes("dangerouslySetInnerHTML")?[{file,rule:"no-dangerously-set-inner-html",message:"Usage of dangerouslySetInnerHTML is prohibited"}]:[]}
export interface ReferencedClasses { exact: Set<string>; prefixes: string[] }
export function extractReferencedAppClasses(file: string, content: string): ReferencedClasses {
 const exact = new Set<string>(); const prefixes: string[] = [];
 if (!file.endsWith(".tsx") && !file.endsWith(".ts")) return { exact, prefixes };
 const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
 const addToken = (token: string) => { const raw = token.split(":").at(-1)!; if (raw.startsWith("app-")) exact.add(raw) };
 const addTokens = (text: string) => { text.split(/\s+/).filter(Boolean).forEach(addToken) };
 const visit = (node: ts.Node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
   addTokens(node.text);
  } else if (ts.isTemplateExpression(node)) {
   const headText = node.head.text;
   const headTokens = headText.trimStart().split(/\s+/).filter(Boolean);
   if (headTokens.length > 0) {
    const last = headTokens[headTokens.length - 1];
    if (headText.endsWith(last) && last.startsWith("app-")) {
     prefixes.push(last);
     headTokens.slice(0, -1).forEach(addToken);
    } else {
     headTokens.forEach(addToken);
    }
   }
   node.templateSpans.forEach((span, idx) => {
    const spanText = span.literal.text;
    const spanTokens = spanText.trimStart().split(/\s+/).filter(Boolean);
    if (idx < node.templateSpans.length - 1 && spanTokens.length > 0) {
     const last = spanTokens[spanTokens.length - 1];
     if (spanText.endsWith(last) && last.startsWith("app-")) {
      prefixes.push(last);
      spanTokens.slice(0, -1).forEach(addToken);
     } else {
      spanTokens.forEach(addToken);
     }
    } else {
     spanTokens.forEach(addToken);
    }
   });
  }
  ts.forEachChild(node, visit);
 };
 visit(sf);
 return { exact, prefixes };
}
export function scanAppCssUnreferencedSelectors(file: string, content: string, referenced: ReferencedClasses): ScanResult[] {
 if (!file.endsWith("app.css")) return [];
 const out: ScanResult[] = [];
 const stripped = content.replace(/\/\*[\s\S]*?\*\//g, "");
 const seen = new Set<string>();
 let segment = "";
 for (const ch of stripped) {
  if (ch === "{") {
   if (!segment.trim().startsWith("@")) {
    for (const m of segment.matchAll(/\.(app-[\w-]+)/g)) {
     const cls = m[1];
     const isReferenced = referenced.exact.has(cls) || referenced.prefixes.some(p => cls.startsWith(p));
     if (!isReferenced && !seen.has(cls)) {
      seen.add(cls);
      out.push({ file, rule: "app-css-unreferenced-selector", message: `Unreferenced selector class .${cls} in app.css` });
     }
    }
   }
   segment = "";
  } else if (ch === "}" || ch === ";") {
   segment = "";
  } else {
   segment += ch;
  }
 }
 return out;
}
export function collectReferencedAppClasses(root: string): ReferencedClasses {
 const exact = new Set<string>(); const prefixes: string[] = [];
 const files = collect(root).filter(f => f.endsWith(".tsx") || f.endsWith(".ts"));
 for (const f of files) {
  const res = extractReferencedAppClasses(f, readFileSync(f, "utf8"));
  for (const x of res.exact) exact.add(x);
  prefixes.push(...res.prefixes);
 }
 return { exact, prefixes };
}
export function scanFile(file:string,content:string,defined?:Set<string>,referenced?:ReferencedClasses):ScanResult[]{return [...scanHexColors(file,content),...scanCoreTokens(file,content),...scanClassNames(file,content,defined),...scanAppCssSelectors(file,content),...(defined?scanAppCssUndefinedTokens(file,content,defined):[]),...(referenced?scanAppCssUnreferencedSelectors(file,content,referenced):[]),...scanDangerousHtml(file,content)]}
function collect(dir:string):string[]{return readdirSync(dir).flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?collect(p):p.endsWith(".css")||p.endsWith(".tsx")||p.endsWith(".ts")?[p]:[]})}
describe("renderer styling scanner",()=>{
 it("rejects forbidden hex and permits token/TDS styles",()=>{expect(scanHexColors("src/styles/app.css","a{color:#fff}")).toHaveLength(1);expect(scanHexColors("src/renderer/src/styles/tokens.css","a{color:#fff}")).toHaveLength(0);expect(scanHexColors("src/renderer/src/styles/tds/button.css","a{color:#fff}")).toHaveLength(0)});
 it("restricts core token declarations except in globals theme blocks",()=>{expect(scanCoreTokens("src/styles/app.css","a{color:var(--color-red)}")).toHaveLength(1);expect(scanCoreTokens("src/renderer/src/styles/globals.css","@theme {--color-foo: red} @theme inline {--color-bar: red}")).toHaveLength(0)});
 it("checks JSX className and cn/cva strings including variant prefixes",()=>{expect(scanClassNames("src/App.tsx",`<div className="hover:bogus"/>`)).toHaveLength(1);expect(scanClassNames("src/App.tsx",`cn("hover:bogus")`)).toHaveLength(1);expect(scanClassNames("src/App.tsx",`cva("gap-(--gap-md) data-[state=open]:tds-x")`)).toHaveLength(0);expect(scanClassNames("src/App.tsx",`<div className="tds-button gap-(--gap-md) w-1/2"/>`)).toHaveLength(0)});
 it("scans object-literal class keys passed to cn",()=>{expect(scanClassNames("src/App.tsx",`cn({"bg-red-500": true})`)).toHaveLength(1);expect(scanClassNames("src/App.tsx",`cn({bgRed})`)).toHaveLength(1)});
 it("reports one finding for cn inside className",()=>{expect(scanClassNames("src/App.tsx",`<div className={cn("bogus")}/>`)).toHaveLength(1)});
 it("distinguishes primitive color utilities from structural text, border, ring, and font classes",()=>{const f="src/renderer/src/components/ui/button.tsx";expect(scanClassNames(f,`cn("border border-b border-2 ring-2 ring-offset-2 text-center text-left font-medium font-semibold")`)).toHaveLength(0);for(const c of ["border-red-500","ring-blue-500","text-gray-500","font-mono"])expect(scanClassNames(f,`cn("${c}")`),c).toHaveLength(1)});
 it("anchors bridged color matching so suffixed palette names are forbidden",()=>{expect(scanClassNames("src/renderer/src/components/ui/button.tsx",`cn("bg-red-primary")`)).toHaveLength(1)});
 it("accepts custom-property utilities only for defined tokens",()=>{const f="src/App.tsx",tokens=new Set(["--gap-md","--surface-neutral-01"]);expect(scanClassNames(f,`cn("gap-(--gap-md)")`,tokens)).toHaveLength(0);expect(scanClassNames(f,`cn("gap-(--not-a-token)")`,tokens)).toHaveLength(1);expect(scanClassNames("src/renderer/src/components/ui/button.tsx",`cn("bg-(--surface-neutral-01)")`,tokens)).toHaveLength(0);expect(scanClassNames("src/renderer/src/components/ui/button.tsx",`cn("bg-(--not-a-token)")`,tokens)).toHaveLength(1)});
 it("enforces component-ui semantic colors and token design utilities",()=>{expect(scanClassNames("src/renderer/src/components/ui/button.tsx",`cn("bg-red-500 text-sm rounded-md shadow-md")`)).toHaveLength(4);expect(scanClassNames("src/renderer/src/components/ui/button.tsx",`cn("bg-primary text-primary text-(--font-size-sm) rounded-(--radius-md) shadow-(--shadow-sm)")`), JSON.stringify(scanClassNames("src/renderer/src/components/ui/button.tsx",`cn("bg-primary text-primary text-(--font-size-sm) rounded-(--radius-md) shadow-(--shadow-sm)")`))).toHaveLength(0)});
 it("keeps legacy selector, undefined-token, and dangerous HTML protections",()=>{expect(scanAppCssSelectors("src/styles/app.css",".bad{a:b}")).toHaveLength(1);expect(scanAppCssUndefinedTokens("x/app.css","a{color:var(--nope)}",new Set()).length).toBe(1);expect(scanDangerousHtml("a.tsx","dangerouslySetInnerHTML")).toHaveLength(1)});
 it("detects invalid selectors nested under app.css at-rules",()=>{expect(scanAppCssSelectors("src/renderer/src/styles/app.css",`@media (max-width: 768px) {.invalid-sidebar {display:none}}`)).toHaveLength(1);expect(scanAppCssSelectors("src/renderer/src/styles/app.css",`@supports (display:grid) {.bad-grid-card {display:grid}}`)).toHaveLength(1);expect(scanAppCssSelectors("src/renderer/src/styles/app.css",`.app-sidebar.tds-side-nav {width:100%}`)).toHaveLength(0);expect(scanAppCssSelectors("src/renderer/src/styles/app.css",`.app-sidebar .tds-side-nav {width:100%}`)).toHaveLength(1)});
 it("flags computed object keys and numeric keys inside cn() objects",()=>{expect(scanClassNames("src/App.tsx",`cn({ [expr]: true })`)).toHaveLength(1);expect(scanClassNames("src/App.tsx",`cn({ 123: true })`)).toHaveLength(1)});
 it("reports unreferenced app-* selectors in app.css",()=>{const ref={exact:new Set(["app-used","app-card"]),prefixes:["app-row--"]};expect(scanAppCssUnreferencedSelectors("src/renderer/src/styles/app.css",".app-used { color: red } .app-row--active { color: blue }",ref)).toHaveLength(0);expect(scanAppCssUnreferencedSelectors("src/renderer/src/styles/app.css",".app-unused { color: red }",ref)).toHaveLength(1);expect(scanAppCssUnreferencedSelectors("src/renderer/src/styles/app.css",".app-other--active { color: red }",ref)).toHaveLength(1);expect(scanAppCssUnreferencedSelectors("src/renderer/src/styles/app.css","@media (max-width: 768px) { .app-nested-unused { display: none } }",ref)).toHaveLength(1)});
 it("extracts referenced app classes and template literal prefixes from TS/TSX",()=>{const extracted=extractReferencedAppClasses("src/renderer/src/Comp.tsx",`<div className={cn("app-header", \`app-item app-row--\${state}\`, { "app-selected": true })} />`);expect(Array.from(extracted.exact).sort()).toEqual(["app-header","app-item","app-selected"]);expect(extracted.prefixes).toEqual(["app-row--"])});
 it("reports every undefined token in an app.css fixture",()=>{expect(scanAppCssUndefinedTokens("src/renderer/src/styles/app.css",`.app-x { margin:var(--margin-xs); color:var(--text-link-hover) }`,new Set(["--text-link","--margin-sm"])).map(v=>v.message)).toEqual(["Undefined token --margin-xs in app.css","Undefined token --text-link-hover in app.css"])});
 it("scans all renderer CSS and TSX sources",()=>{const root=resolve(__dirname,"../../src/renderer/src");const tokens=readFileSync(join(root,"styles/tokens.css"),"utf8");const defined=getDefinedTokens(tokens);const referenced=collectReferencedAppClasses(root);const violations=collect(root).flatMap(f=>scanFile(f,readFileSync(f,"utf8"),defined,referenced));expect(violations).toEqual([])});
 it("preserves all TDS marker components and token references",()=>{const root=resolve(__dirname,"../../src/renderer/src");const tokens=getDefinedTokens(readFileSync(join(root,"styles/tokens.css"),"utf8"));const ids=["button","icon-button","text-input","select","checkbox","field-label","field-caption","field-validation","dialog","data-table","breadcrumb","announcement","side-nav","nav-list","nav-item","spinner","progress-indicator","tag"];expect(ids.every(id=>existsSync(join(root,`styles/tds/${id}.css`)))).toBe(true);const sections=ids.map(id=>readFileSync(join(root,`styles/tds/${id}.css`),"utf8"));expect(sections.every((content,index)=>content.startsWith(`/* tds component: ${ids[index]} */`))).toBe(true);const combined=sections.join("");expect([...combined.matchAll(/var\(\s*(--[\w-]+)/g)].every(m=>tokens.has(m[1]))).toBe(true)});
 it("allows hex colors only in token and TDS files",()=>{expect(scanHexColors("src/renderer/src/styles/globals.css",".x{color:#123}")).toHaveLength(1);expect(scanHexColors("src/renderer/src/styles/tds/tag.css",".x{color:#123}")).toHaveLength(0)});
 it("detects spacing core tokens outside exemptions",()=>{expect(scanCoreTokens("src/styles/app.css",".x{gap:var(--spacing-8)}")).toHaveLength(1);expect(scanCoreTokens("src/renderer/src/styles/tds/tag.css",".x{gap:var(--spacing-8)}")).toHaveLength(0)});
 it("validates cn arguments while stripping hover and data variants",()=>{expect(scanClassNames("src/renderer/src/X.tsx",`cn("hover:gap-4 data-[state=open]:bogus")`)).toHaveLength(2);expect(scanClassNames("src/renderer/src/X.tsx",`cn("hover:gap-(--gap-md) data-[state=open]:app-active")`)).toHaveLength(0)});
 it("rejects non-token geometry classes outside primitives",()=>{expect(scanClassNames("src/renderer/src/X.tsx",`<div className="p-4 w-10"/>`)).toHaveLength(2);expect(scanClassNames("src/renderer/src/X.tsx",`<div className="p-(--padding-md) w-full"/>`)).toHaveLength(0)});
 it("forbids dangerouslySetInnerHTML in renderer TSX",()=>{expect(scanDangerousHtml("src/renderer/src/X.tsx",`<div dangerouslySetInnerHTML={html}/>`)).toHaveLength(1);expect(scanDangerousHtml("src/renderer/src/X.ts",`dangerouslySetInnerHTML`)).toHaveLength(0)});
});
