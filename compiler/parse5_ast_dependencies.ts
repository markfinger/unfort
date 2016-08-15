import {uniq} from 'lodash';

export function parse5AstDependencies(ast: any) {
  const identifiers = [];

  const pending = [];
  let node = ast;
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

  return {
    identifiers: uniq(identifiers)
  };
}

export function rewriteParse5AstDependencies(ast: any, identifiers: any) {
  const pending = [];
  let node = ast;
  while (node) {
    if (node.childNodes && node.childNodes.length !== 0) {
      pending.push(...node.childNodes);
    }
    switch(node.tagName) {
      case 'script':
      case 'img':
        for (const attr of node.attrs) {
          if (attr.name === 'src') {
            if (attr.value && attr.value in identifiers) {
              attr.value = identifiers[attr.value];
            }
            break;
          }
        }
        break;
      case 'link':
        for (const attr of node.attrs) {
          if (attr.name === 'href') {
            if (attr.value && attr.value in identifiers) {
              attr.value = identifiers[attr.value];
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
}