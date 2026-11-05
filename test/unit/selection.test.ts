import { describe, expect, it } from "vitest";
// @ts-ignore Source module belongs to the renderer project, not the node project.
import { selectionReducer as reduce, initialSelection as empty, keyboardAction } from "../../src/renderer/src/selection";
const keys = ["a", "b", "c", "d"];
describe("selection reducer", () => {
 it("selects one row and sets active and anchor", () => expect(reduce(empty,{type:"select",key:"b",keys})).toEqual({selected:["b"],active:"b",anchor:"b"}));
 it("toggles rows without losing the active key", () => { const state=reduce(reduce(empty,{type:"select",key:"a",keys}),{type:"toggle",key:"c",keys}); expect(state.selected).toEqual(["a","c"]); expect(state.active).toBe("c"); });
 it("ranges from the existing anchor", () => { const state=reduce(reduce(empty,{type:"select",key:"b",keys}),{type:"range",key:"d",keys}); expect(state.selected).toEqual(["b","c","d"]); expect(state.anchor).toBe("b"); });
 it("extends with Shift+ArrowUp", () => { const state=reduce({selected:["b"],active:"b",anchor:"b"},{type:"move",delta:-1,extend:true,keys}); expect(state.selected).toEqual(["a","b"]); });
 it("extends with Shift+ArrowDown", () => { const state=reduce({selected:["b"],active:"b",anchor:"b"},{type:"move",delta:1,extend:true,keys}); expect(state.selected).toEqual(["b","c"]); });
 it("moves active and selection with ArrowUp", () => expect(reduce({selected:["c"],active:"c",anchor:"c"},{type:"move",delta:-1,keys}).active).toBe("b"));
 it("moves active and selection with ArrowDown", () => expect(reduce({selected:["b"],active:"b",anchor:"b"},{type:"move",delta:1,keys}).active).toBe("c"));
 it("moves by PageUp", () => expect(reduce({selected:["d"],active:"d",anchor:"d"},{type:"move",delta:-1,page:true,keys}).active).toBe("a"));
 it("moves by PageDown", () => expect(reduce({selected:["a"],active:"a",anchor:"a"},{type:"move",delta:1,page:true,keys}).active).toBe("d"));
 it("moves by PageDown with custom pageSize", () => {
   const longKeys = ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"];
   expect(reduce({selected:["k0"],active:"k0",anchor:"k0"},{type:"move",delta:1,page:true,pageSize:3,keys:longKeys}).active).toBe("k3");
   expect(reduce({selected:["k7"],active:"k7",anchor:"k7"},{type:"move",delta:-1,page:true,pageSize:4,keys:longKeys}).active).toBe("k3");
 });
 it("falls back gracefully when anchor is not in keys", () => {
   const state = reduce({selected:["a"],active:"a",anchor:"missing"},{type:"range",key:"c",keys});
   expect(state.selected).toEqual(["a", "b", "c"]);
   expect(state.anchor).toBe("a");
   const isolated = reduce({selected:[],active:"missing",anchor:"missing"},{type:"range",key:"c",keys});
   expect(isolated.selected).toEqual(["c"]);
   expect(isolated.anchor).toBe("c");
   const extended = reduce({selected:["a"],active:"a",anchor:"missing"},{type:"move",delta:1,extend:true,keys});
   expect(extended.selected).toEqual(["a", "b"]);
 });
 it("moves to Home", () => expect(reduce({selected:["c"],active:"c",anchor:"c"},{type:"home",keys}).active).toBe("a"));
 it("moves to End", () => expect(reduce({selected:["b"],active:"b",anchor:"b"},{type:"end",keys}).active).toBe("d"));
 it("selects all loaded rows only", () => expect(reduce(empty,{type:"all",keys:["a","b"]}).selected).toEqual(["a","b"]));
 it("clears selection", () => expect(reduce({selected:["a"],active:"a",anchor:"a"},{type:"clear"})).toEqual(empty));
 it("resets selection on context change", () => expect(reduce({selected:["a"],active:"a",anchor:"a"},{type:"reset"})).toEqual(empty));
});
describe("grid keyboard action map", () => {
 const key=(key:string, options:Record<string,unknown>={})=>keyboardAction({key,...options} as never);
 it("maps ArrowUp and ArrowDown",()=>{expect(key("ArrowUp")).toBe("move-up");expect(key("ArrowDown")).toBe("move-down");});
 it("maps Shift+ArrowUp and Shift+ArrowDown",()=>{expect(key("ArrowUp",{shiftKey:true})).toBe("extend-up");expect(key("ArrowDown",{shiftKey:true})).toBe("extend-down");});
 it("maps PageUp and PageDown",()=>{expect(key("PageUp")).toBe("page-up");expect(key("PageDown")).toBe("page-down");});
 it("maps Home and End",()=>{expect(key("Home")).toBe("home");expect(key("End")).toBe("end");});
 it("maps Space to toggle",()=>expect(key(" ")).toBe("toggle"));
 it("maps Ctrl+A to loaded rows",()=>expect(key("a",{ctrlKey:true})).toBe("select-all"));
 it("maps Escape to clear",()=>expect(key("Escape")).toBe("clear"));
 it("maps Enter to open only for exactly one selected row", () => {
   expect(key("Enter", { selectionCount: 1 })).toBe("open");
   expect(key("Enter", { selectionCount: 2 })).toBeNull();
   expect(key("Enter", { selectionCount: 0 })).toBeNull();
   expect(key("Enter")).toBeNull();
 });
 it("maps Backspace and Alt+ArrowUp to parent",()=>{expect(key("Backspace")).toBe("parent");expect(key("ArrowUp",{altKey:true})).toBe("parent");});
 it("maps Delete",()=>expect(key("Delete")).toBe("delete"));
 it("maps F2 only for exactly one selected row",()=>{expect(key("F2",{selectionCount:1})).toBe("rename");expect(key("F2",{selectionCount:2})).toBeNull();expect(key("F2")).toBeNull();});
 it("maps ContextMenu and Shift+F10",()=>{expect(key("ContextMenu")).toBe("context-menu");expect(key("F10",{shiftKey:true})).toBe("context-menu");});
 it("returns no action for unmapped keys",()=>expect(key("x")).toBeNull());
});
