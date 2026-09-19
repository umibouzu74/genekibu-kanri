// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { hasArrowKeyOwnerFocus, isTypingTarget } from "./keyboardGuards";

afterEach(() => {
  document.body.innerHTML = "";
});

function mountFocused(html, selector) {
  document.body.innerHTML = html;
  const el = document.querySelector(selector);
  el.focus();
  return el;
}

describe("hasArrowKeyOwnerFocus", () => {
  it("フォーカスが無い / body にあるときは false", () => {
    expect(hasArrowKeyOwnerFocus()).toBe(false);
    document.body.innerHTML = '<button id="b">b</button>';
    document.getElementById("b").focus();
    expect(hasArrowKeyOwnerFocus()).toBe(false);
  });

  it("role=radio 自身にフォーカスがあれば true", () => {
    mountFocused('<div role="radiogroup"><button role="radio" id="r">a</button></div>', "#r");
    expect(hasArrowKeyOwnerFocus()).toBe(true);
  });

  it("祖先が listbox / grid / menu / tablist でも true (子孫のボタンなど)", () => {
    for (const role of ["listbox", "grid", "menu", "tablist", "combobox"]) {
      mountFocused(`<div role="${role}"><span><button id="x">x</button></span></div>`, "#x");
      expect(hasArrowKeyOwnerFocus(), role).toBe(true);
    }
  });

  it("role=button の td (時間割セル) は対象外 (自前の keydown が defaultPrevented で止める)", () => {
    mountFocused('<table><tbody><tr><td role="button" tabindex="0" id="c">c</td></tr></tbody></table>', "#c");
    expect(hasArrowKeyOwnerFocus()).toBe(false);
  });

  it("isTypingTarget は変えない (input / textarea / select / contentEditable)", () => {
    document.body.innerHTML = '<input id="i"><div role="radio" id="r"></div>';
    expect(isTypingTarget(document.getElementById("i"))).toBe(true);
    expect(isTypingTarget(document.getElementById("r"))).toBe(false);
  });
});
