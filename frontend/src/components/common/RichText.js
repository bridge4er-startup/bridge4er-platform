import React from "react";

const ALLOWED_TAGS = new Set([
  "b",
  "br",
  "code",
  "div",
  "em",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
  "ul",
]);

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textWithLineBreaks(value = "") {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

function sanitizeHtml(value = "") {
  const source = String(value || "");
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return textWithLineBreaks(source);
  }

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");

  function cleanNode(node) {
    if (node.nodeType === window.Node.TEXT_NODE) {
      return doc.createTextNode(node.textContent || "");
    }
    if (node.nodeType !== window.Node.ELEMENT_NODE) {
      return doc.createTextNode("");
    }

    const tagName = node.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      const fragment = doc.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => fragment.appendChild(cleanNode(child)));
      return fragment;
    }

    const element = doc.createElement(tagName);
    Array.from(node.childNodes).forEach((child) => element.appendChild(cleanNode(child)));
    return element;
  }

  const wrapper = doc.createElement("div");
  Array.from(doc.body.firstChild?.childNodes || []).forEach((node) => wrapper.appendChild(cleanNode(node)));
  return wrapper.innerHTML.replace(/\r\n|\r|\n/g, "<br>");
}

export default function RichText({ value, as: Component = "span", className = "" }) {
  return (
    <Component
      className={className || undefined}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
    />
  );
}
