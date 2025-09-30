"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initStorage = initStorage;
exports.addProblem = addProblem;
exports.addSuggestion = addSuggestion;
exports.getProblems = getProblems;
exports.getSuggestions = getSuggestions;
exports.clearStorage = clearStorage;
let problems = [];
let suggestions = [];
let context;
function initStorage(extensionContext) {
    context = extensionContext;
    problems = context.globalState.get('manager.problems', []);
    suggestions = context.globalState.get('manager.suggestions', []);
}
function addProblem(message) {
    problems.push(message);
    if (context) {
        context.globalState.update('manager.problems', problems);
    }
}
function addSuggestion(message) {
    suggestions.push(message);
    // Persist to storage
    if (context) {
        context.globalState.update('manager.suggestions', suggestions);
    }
}
function getProblems() {
    return problems;
}
function getSuggestions() {
    return suggestions;
}
function clearStorage() {
    problems = [];
    suggestions = [];
    // Clear from persistent storage
    if (context) {
        context.globalState.update('manager.problems', []);
        context.globalState.update('manager.suggestions', []);
    }
}
//# sourceMappingURL=storage.js.map