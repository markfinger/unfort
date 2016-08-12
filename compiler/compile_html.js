"use strict";

const parse5 = require('parse5');
const imm = require('immutable');

function scanHtmlText(text) {
  const identifiers = [];

  const document = parse5.parse(text);

  const pending = [];
  let node = document;
  while (node) {
    if (node.childNodes && node.childNodes.length !== 0) {
      pending.push(...node.childNodes);
    }
    switch(node.tagName) {
    case 'script':
    case 'img':
      for (const attr of node.attrs) {
        if (attr.name === 'src') {
          if (attr.value) {
            identifiers.push(attr.value);
          }
          break;
        }
      }
      break;
    case 'link':
      for (const attr of node.attrs) {
        if (attr.name === 'href') {
          if (attr.value) {
            identifiers.push(attr.value);
          }
          break;
        }
      }
      break;
    default:
      break;
    }
    node = pending.pop();
  }

  return imm.Map({
    document,
    identifiers
  });
}

module.exports = {
  scanHtmlText
};
