import { Set as ImmutableSet, Map as ImmutableMap } from 'immutable';

export function addNode(nodes, id: string) {
  if (nodes.has(id)) {
    throw new Error(`Node "${id}" already exists`);
  }

  return nodes.set(id, ImmutableMap({
    id,
    dependencies: ImmutableSet(),
    dependents: ImmutableSet()
  }));
}

export function removeNode(nodes, id: string) {
  if (!nodes.has(id)) {
    throw new Error(`Node "${id}" does not exist`);
  }

  return nodes.delete(id);
}

export function addEdge(nodes, head: string, tail: string) {
  if (head === tail) {
    throw new Error(
      `Edges must point to two different nodes. Cannot add an edge from "${head}" to itself`
    );
  }

  const headNode = nodes.get(head);
  const tailNode = nodes.get(tail);

  if (!headNode) {
    throw new Error(`Cannot add edge from "${head}" -> "${tail}" as "${head}" has not been defined`);
  }
  if (!tailNode) {
    throw new Error(`Cannot add edge from "${head}" -> "${tail}" as "${tail}" has not been defined`);
  }

  return nodes.withMutations((nodes) => {
    nodes.set(
      head,
      headNode.set(
        'dependencies',
        headNode.get('dependencies').add(tail)
      )
    );
    nodes.set(
      tail,
      tailNode.set(
        'dependents',
        tailNode.get('dependents').add(head)
      )
    );
  });
}

export function removeEdge(nodes, head, tail) {
  const headNode = nodes.get(head);
  const tailNode = nodes.get(tail);

  if (!headNode) {
    throw new Error(`Cannot remove edge from "${head}" -> "${tail}" as "${head}" has not been defined`);
  }
  if (!tailNode) {
    throw new Error(`Cannot remove edge from "${head}" -> "${tail}" as "${tail}" has not been defined`);
  }

  nodes = nodes.set(
    head,
    headNode.set(
      'dependencies',
      headNode.get('dependencies').remove(tail)
    )
  );

  nodes = nodes.set(
    tail,
    tailNode.set(
      'dependents',
      tailNode.get('dependents').remove(head)
    )
  );

  return nodes;
}

/**
 * Given a Map containing nodes, returns an array of node ids
 * where each node is disconnected from the defined entry nodes
 */
export function findNodesDisconnectedFromEntryNodes(nodes: any, entryPoints: any): string[] {
  const entries = [];
  for (const id of entryPoints) {
    const node = nodes.get(id);
    if (node) {
      entries.push(node);
    }
  }
  const encountered = Object.create(null);

  function checkFromNode(node) {
    encountered[node.get('id')] = true;
    for (const id of node.get('dependencies')) {
      if (!encountered[id]) {
        checkFromNode(nodes.get(id));
      }
    }
  }

  entries.forEach(checkFromNode);

  const disconnected = [];
  for (const id of nodes.keySeq()) {
    if (!encountered[id]) {
      disconnected.push(id);
    }
  }
  return disconnected;
}