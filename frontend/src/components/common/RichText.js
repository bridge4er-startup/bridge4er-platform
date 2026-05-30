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
  return enhancePlainQuestionText(escapeHtml(value)).replace(/\r\n|\r|\n/g, "<br>");
}

function enhancePlainQuestionText(value = "") {
  return String(value || "")
    .replace(/\^\{([A-Za-z0-9+\-=]+)\}/g, "<sup>$1</sup>")
    .replace(/\^([A-Za-z0-9+\-=]+)/g, "<sup>$1</sup>")
    .replace(/_([A-Za-z0-9+\-=]+)/g, "<sub>$1</sub>")
    .replace(/\bd([23])(?=[A-Z])/g, "d<sup>$1</sup>")
    .replace(/\b([A-Za-z])([23])(?=(?:[\/)\]\s.,;:]|$))/g, "$1<sup>$2</sup>");
}

function sanitizeHtml(value = "") {
  const source = String(value || "");
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return textWithLineBreaks(source);
  }

  if (!/<\/?[a-z][\s\S]*>/i.test(source)) {
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
