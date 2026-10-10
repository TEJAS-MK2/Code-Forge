import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { indentUnit, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { html, htmlLanguage } from "@codemirror/lang-html";
import { css, cssLanguage } from "@codemirror/lang-css";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";

const syntax = HighlightStyle.define([
  { tag: tags.comment, color: "#aeb8a6" },
  { tag: tags.keyword, color: "#e1b8ff" },
  { tag: tags.string, color: "#c5f39f" },
  { tag: tags.number, color: "#f2df91" },
  { tag: tags.operator, color: "#e3e9de" },
  { tag: tags.name, color: "#e3e9de" },
  { tag: tags.tagName, color: "#f3b985" },
  { tag: tags.attributeName, color: "#a6d4ff" },
  { tag: tags.attributeValue, color: "#c5f39f" },
  { tag: tags.typeName, color: "#a6d4ff" },
  { tag: tags.propertyName, color: "#e7d3b1" },
  { tag: tags.meta, color: "#c9c4ff" }
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#141714", color: "#dce4d5", fontSize: "var(--cf-editor-font-size, 12px)" },
  ".cm-content": { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace', lineHeight: "1.7", caretColor: "#b8e986", padding: "15px 0" },
  ".cm-line": { padding: "0 14px" },
  ".cm-gutters": { backgroundColor: "#171a16", color: "#9aa593", borderRight: "1px solid #292e28", paddingRight: "4px" },
  ".cm-activeLineGutter": { backgroundColor: "#232820", color: "#b8e986" },
  ".cm-activeLine": { backgroundColor: "#1c211b" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "#3e5138" },
  ".cm-cursor": { borderLeftColor: "#b8e986" },
  ".cm-tooltip": { border: "1px solid #485046", backgroundColor: "#20241f", color: "#e8ebe4" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "#343d2e", color: "#e8ebe4" },
  ".cm-foldPlaceholder": { border: "1px solid #485046", backgroundColor: "#242923", color: "#a0a99b" }
}, { dark: true });

window.CodeForgeEditorEngine = { EditorView, EditorState, Compartment, basicSetup, html, htmlLanguage, css, cssLanguage, javascript, javascriptLanguage, indentUnit, syntax, syntaxHighlighting, theme };
