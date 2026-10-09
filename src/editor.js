import { EditorView, basicSetup } from "codemirror";
import { Compartment } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#141714", color: "#dce4d5", fontSize: "var(--cf-editor-font-size, 12px)" },
  ".cm-content": { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace', lineHeight: "1.7", caretColor: "#b8e986", padding: "15px 0" },
  ".cm-line": { padding: "0 14px" },
  ".cm-gutters": { backgroundColor: "#171a16", color: "#687162", borderRight: "1px solid #292e28", paddingRight: "4px" },
  ".cm-activeLineGutter": { backgroundColor: "#232820", color: "#b8e986" },
  ".cm-activeLine": { backgroundColor: "#1c211b" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "#3e5138" },
  ".cm-cursor": { borderLeftColor: "#b8e986" },
  ".cm-tooltip": { border: "1px solid #485046", backgroundColor: "#20241f", color: "#e8ebe4" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "#343d2e", color: "#e8ebe4" },
  ".cm-foldPlaceholder": { border: "1px solid #485046", backgroundColor: "#242923", color: "#a0a99b" }
}, { dark: true });

window.CodeForgeEditorEngine = { EditorView, Compartment, basicSetup, html, css, javascript, indentUnit, theme };
