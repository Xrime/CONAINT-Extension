// storage.ts
import * as vscode from 'vscode';

let problems: string[] = [];
let suggestions: string[] = [];
let context: vscode.ExtensionContext | undefined;

export function initStorage(extensionContext: vscode.ExtensionContext) {
  context = extensionContext;
  
  // Load persisted data
  problems = context.globalState.get('manager.problems', []);
  suggestions = context.globalState.get('manager.suggestions', []);
}

export function addProblem(message: string) {
  problems.push(message);
  // Persist to storage
  if (context) {
    context.globalState.update('manager.problems', problems);
  }
}

export function addSuggestion(message: string) {
  suggestions.push(message);
  // Persist to storage
  if (context) {
    context.globalState.update('manager.suggestions', suggestions);
  }
}

export function getProblems() {
  return problems;
}

export function getSuggestions() {
  return suggestions;
}

export function clearStorage() {
  problems = [];
  suggestions = [];
  // Clear from persistent storage
  if (context) {
    context.globalState.update('manager.problems', []);
    context.globalState.update('manager.suggestions', []);
  }
}
