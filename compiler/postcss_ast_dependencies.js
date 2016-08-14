"use strict";
const css_selector_tokenizer_1 = require('css-selector-tokenizer');
const URL_REGEX = /url\(/;
function postcssAstDependencies(ast) {
    const identifiers = [];
    function addDependency(source) {
        // Ensure that dependencies are only identified once
        identifiers.push(source);
    }
    ast.walkAtRules('import', (rule) => {
        const identifier = getDependencyIdentifierFromImportRule(rule);
        addDependency(identifier);
    });
    ast.walkDecls(decl => {
        const value = decl.value;
        if (URL_REGEX.test(value)) {
            const identifiers = getDependencyIdentifiersFromDeclarationValue(value);
            identifiers.forEach(addDependency);
        }
    });
    return { identifiers };
}
exports.postcssAstDependencies = postcssAstDependencies;
function getDependencyIdentifiersFromDeclarationValue(value) {
    const node = css_selector_tokenizer_1.parseValues(value);
    const accum = [];
    findUrlsInNode(node, accum);
    return accum;
}
exports.getDependencyIdentifiersFromDeclarationValue = getDependencyIdentifiersFromDeclarationValue;
function findUrlsInNode(node, accum) {
    if (node.type === 'url') {
        return accum.push(node.url);
    }
    if (node.nodes) {
        for (const child of node.nodes) {
            findUrlsInNode(child, accum);
        }
    }
}
exports.findUrlsInNode = findUrlsInNode;
function throwMalformedImport(rule) {
    throw rule.error('Malformed @import cannot resolve identifier');
}
function getDependencyIdentifierFromImportRule(rule) {
    const params = rule.params.trim();
    if (!params.startsWith('url(') &&
        params[0] !== '\'' &&
        params[0] !== '"') {
        throwMalformedImport(rule);
    }
    let text;
    if (params.startsWith('url(')) {
        text = params.slice('url('.length);
    }
    else {
        text = params;
    }
    let closingToken;
    if (text[0] === '\'') {
        closingToken = '\'';
    }
    else if (text[0] === '"') {
        closingToken = '"';
    }
    else {
        throwMalformedImport(rule);
    }
    const identifierWithTrailing = text.slice(1);
    const identifierEnd = identifierWithTrailing.indexOf(closingToken);
    const identifier = identifierWithTrailing.slice(0, identifierEnd);
    // Empty identifiers are a pain to debug
    if (identifier.trim() === '') {
        throwMalformedImport(rule);
    }
    return identifier;
}
exports.getDependencyIdentifierFromImportRule = getDependencyIdentifierFromImportRule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zdGNzc19hc3RfZGVwZW5kZW5jaWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicG9zdGNzc19hc3RfZGVwZW5kZW5jaWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSx5Q0FBb0Qsd0JBQXdCLENBQUMsQ0FBQTtBQUU3RSxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUM7QUFFMUIsZ0NBQXVDLEdBQVE7SUFDN0MsTUFBTSxXQUFXLEdBQWEsRUFBRSxDQUFDO0lBRWpDLHVCQUF1QixNQUFjO1FBQ25DLG9EQUFvRDtRQUNwRCxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxHQUFHLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUk7UUFDN0IsTUFBTSxVQUFVLEdBQUcscUNBQXFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0QsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzVCLENBQUMsQ0FBQyxDQUFDO0lBRUgsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJO1FBQ2hCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDekIsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUIsTUFBTSxXQUFXLEdBQUcsNENBQTRDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDeEUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNyQyxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLENBQUMsRUFBQyxXQUFXLEVBQUMsQ0FBQztBQUN2QixDQUFDO0FBdEJlLDhCQUFzQix5QkFzQnJDLENBQUE7QUFFRCxzREFBNkQsS0FBYTtJQUN4RSxNQUFNLElBQUksR0FBRyxvQ0FBc0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMzQyxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUM7SUFFakIs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