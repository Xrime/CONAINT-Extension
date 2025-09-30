"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Manager = void 0;
class Manager {
    constructor() {
        this.problems = [];
        this.suggestions = [];
    }
    static getInstance() {
        if (!Manager.instance) {
            Manager.instance = new Manager();
        }
        return Manager.instance;
    }
    initialize(context) {
        this.context = context;
        this.problems = context.globalState.get('manager.problemsData', []);
        this.suggestions = context.globalState.get('manager.suggestionsData', []);
        console.log(`Manager initialized with ${this.problems.length} problems and ${this.suggestions.length} suggestions`);
    }
    addProblem(problem) {
        const isDuplicate = this.problems.some(p => p.problemId === problem.problemId ||
            (p.title === problem.title && p.description === problem.description && p.ownerId === problem.ownerId && Math.abs(p.timestamp - problem.timestamp) < 1000));
        if (!isDuplicate) {
            this.problems.push(problem);
            // Persist to storage
            if (this.context) {
                this.context.globalState.update('manager.problemsData', this.problems);
            }
            console.log(`Added new problem: ${problem.title} (ID: ${problem.problemId})`);
        }
        else {
            console.log(`Duplicate problem ignored: ${problem.title} (ID: ${problem.problemId})`);
        }
    }
    addSuggestion(suggestion) {
        // Check for duplicates based on suggestion ID or unique combination of fields
        const isDuplicate = this.suggestions.some(s => s.suggestionId === suggestion.suggestionId ||
            (s.problemId === suggestion.problemId && s.authorId === suggestion.authorId && s.content === suggestion.content && Math.abs(s.timestamp - suggestion.timestamp) < 1000));
        if (!isDuplicate) {
            this.suggestions.push(suggestion);
            // Persist to storage
            if (this.context) {
                this.context.globalState.update('manager.suggestionsData', this.suggestions);
            }
            console.log(`Added new suggestion for problem ${suggestion.problemId} by ${suggestion.authorId}`);
        }
        else {
            console.log(`Duplicate suggestion ignored for problem ${suggestion.problemId}`);
        }
    }
    reset() {
        this.problems = [];
        this.suggestions = [];
        // Clear from persistent storage
        if (this.context) {
            this.context.globalState.update('manager.problemsData', []);
            this.context.globalState.update('manager.suggestionsData', []);
        }
    }
    getData() {
        return {
            problems: this.problems,
            suggestions: this.suggestions,
        };
    }
    getProblems() {
        return this.problems;
    }
    getSuggestions() {
        return this.suggestions;
    }
    // Load global problems from server for new users
    async loadGlobalProblems() {
        // This will be called when user opens Live Feed for the first time
        console.log("Requesting global problems from server...");
    }
    // Add method to sync with global problems
    syncGlobalProblems(globalProblems, globalSuggestions) {
        // Merge global problems with local ones, avoiding duplicates
        globalProblems.forEach(problem => this.addProblem(problem));
        globalSuggestions.forEach(suggestion => this.addSuggestion(suggestion));
        console.log(`Synced with global data: ${globalProblems.length} problems, ${globalSuggestions.length} suggestions`);
    }
    // Get problems created in the last N days (for sharing)
    getRecentProblems(days = 7) {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        return this.problems.filter(p => p.timestamp > cutoffTime && p.visibility === 'public');
    }
    // Get public suggestions for sharing
    getPublicSuggestions() {
        const publicProblemIds = this.getRecentProblems().map(p => p.problemId);
        return this.suggestions.filter(s => publicProblemIds.includes(s.problemId));
    }
}
exports.Manager = Manager;
//# sourceMappingURL=manager.js.map