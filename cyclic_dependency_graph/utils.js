"use strict";
const immutable_1 = require('immutable');
const node_1 = require('./node');
/**
 * Constructs a map of nodes from a variant of DOT notation.
 *
 * For example, given
 * ```
 *   a -> b -> c -> d
 *   b -> d -> e
 *   c -> e
 *   c -> f -> g -> d
 * ```
 * A map will be returned which represents the nodes and their edges.
 */
function createNodesFromNotation(text) {
    let nodes = immutable_1.Map();
    const lines = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line);
    lines.forEach(line => {
        const ids = line
            .split('->')
            .map(id => id.trim());
        // Create each node
        ids.forEach(id => {
            if (!nodes.has(id)) {
                nodes = node_1.addNode(nodes, id);
            }
        });
        // Add edges
        for (let i = 0; i < ids.length - 1; i++) {
            nodes = node_1.addEdge(nodes, ids[i], ids[i + 1]);
        }
    });
    return nodes;
}
exports.createNodesFromNotation = createNodesFromNotation;
function objectToGraph(obj) {
    let map = {};
    for (const key of Object.keys(obj)) {
        const data = obj[key];
        map[key] = immutable_1.Map({
            id: data.id,
            dependencies: immutable_1.Set(data.dependencies || []),
            dependents: immutable_1.Set(data.dependents || [])
        });
    }
    return immutable_1.Map(map);
}
exports.objectToGraph = objectToGraph;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsNEJBQXVELFdBQVcsQ0FBQyxDQUFBO0FBQ25FLHVCQUErQixRQUFRLENBQUMsQ0FBQTtBQUV4Qzs7Ozs7Ozs7Ozs7R0FXRztBQUNILGlDQUF3QyxJQUFZO0lBQ2xELElBQUksS0FBSyxHQUFHLGVBQVksRUFBRSxDQUFDO0lBRTNCLE1BQU0sS0FBSyxHQUFHLElBQUk7U0FDZixLQUFLLENBQUMsSUFBSSxDQUFDO1NBRVgsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDeEIsTUFBTSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQztJQUV4QixLQUFLLENBQUMsT0FBTyxDQUFDLElBQUk7UUFDaEIsTUFBTSxHQUFHLEdBQUcsSUFBSTthQUNiLEtBQUssQ0FBQyxJQUFJLENBQUM7YUFDWCxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRXhCLG1CQUFtQjtRQUNuQixHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDWixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixLQUFLLEdBQUcsY0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM3QixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxZQUFZO1FBQ1osR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUMsQ0FBQyxFQUFFLENBQUMsR0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3BDLEtBQUssR0FBRyxjQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxDQUFDLEtBQUssQ0FBQztBQUNmLENBQUM7QUE1QmUsK0JBQXVCLDBCQTRCdEMsQ0FBQTtBQUVELHVCQUE4QixHQUFRO0lBQ3BDLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQztJQUNiLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25DLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0QixHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsZUFBWSxDQUFDO1lBQ3RCLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRTtZQUNYLFlBQVksRUFBRSxlQUFZLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUM7WUFDbkQsVUFBVSxFQUFFLGVBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztTQUNoRCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsTUFBTSxDQUFDLGVBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMzQixDQUFDO0FBWGUscUJBQWEsZ0JBVzVCLENBQUEifQ==