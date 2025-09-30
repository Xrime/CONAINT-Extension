// manager.ts
import * as vscode from 'vscode';
import { Problem, Suggestion } from "./protocol";

export class Manager {
  private static instance: Manager;
  private problems: Problem[] = [];
  private suggestions: Suggestion[] = [];
  private context: vscode.ExtensionContext | undefined;

  private constructor() {}

  public static getInstance(): Manager {
    if (!Manager.instance) {
      Manager.instance = new Manager();
    }
    return Manager.instance;
  }

  public initialize(context: vscode.ExtensionContext) {
    this.context = context;
    
    // Load persisted data
    this.problems = context.globalState.get('manager.problemsData', []);
    this.suggestions = context.globalState.get('manager.suggestionsData', []);
    
    console.log(`Manager initialized with ${this.problems.length} problems and ${this.suggestions.length} suggestions`);
  }

  public addProblem(problem: Problem) {
    this.problems.push(problem);
    
    // Persist to storage
    if (this.context) {
      this.context.globalState.update('manager.problemsData', this.problems);
    }
  }

  public addSuggestion(suggestion: Suggestion) {
    this.suggestions.push(suggestion);
    
    // Persist to storage
    if (this.context) {
      this.context.globalState.update('manager.suggestionsData', this.suggestions);
    }
  }

  public reset() {
    this.problems = [];
    this.suggestions = [];
    
    // Clear from persistent storage
    if (this.context) {
      this.context.globalState.update('manager.problemsData', []);
      this.context.globalState.update('manager.suggestionsData', []);
    }
  }

  public getData() {
    return {
      problems: this.problems,
      suggestions: this.suggestions,
    };
  }

  public getProblems(): Problem[] {
    return this.problems;
  }

  public getSuggestions(): Suggestion[] {
    return this.suggestions;
  }
}
