import * as vscode from 'vscode';
import { Problem, Suggestion, User, InspectorSession, TelemetryData, AIAnalysisResult } from './types';

export class Storage {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // Problems
    async getProblems(): Promise<Problem[]> {
        return this.context.globalState.get('conaint.problems', []);
    }

    async saveProblem(problem: Problem): Promise<void> {
        const problems = await this.getProblems();
        const existingIndex = problems.findIndex(p => p.id === problem.id);
        
        if (existingIndex >= 0) {
            problems[existingIndex] = problem;
        } else {
            problems.push(problem);
        }
        
        await this.context.globalState.update('conaint.problems', problems);
    }

    async deleteProblem(problemId: string): Promise<void> {
        const problems = await this.getProblems();
        const filtered = problems.filter(p => p.id !== problemId);
        await this.context.globalState.update('conaint.problems', filtered);
    }

    // Suggestions
    async getSuggestions(): Promise<Suggestion[]> {
        return this.context.globalState.get('conaint.suggestions', []);
    }

    async getSuggestionsForProblem(problemId: string): Promise<Suggestion[]> {
        const suggestions = await this.getSuggestions();
        return suggestions.filter(s => s.problemId === problemId);
    }

    async saveSuggestion(suggestion: Suggestion): Promise<void> {
        const suggestions = await this.getSuggestions();
        const existingIndex = suggestions.findIndex(s => s.id === suggestion.id);
        
        if (existingIndex >= 0) {
            suggestions[existingIndex] = suggestion;
        } else {
            suggestions.push(suggestion);
        }
        
        await this.context.globalState.update('conaint.suggestions', suggestions);
    }

    // Users
    async getUsers(): Promise<User[]> {
        return this.context.globalState.get('conaint.users', []);
    }

    async getUser(userId: string): Promise<User | undefined> {
        const users = await this.getUsers();
        return users.find(u => u.id === userId);
    }

    async saveUser(user: User): Promise<void> {
        const users = await this.getUsers();
        const existingIndex = users.findIndex(u => u.id === user.id);
        
        if (existingIndex >= 0) {
            users[existingIndex] = user;
        } else {
            users.push(user);
        }
        
        await this.context.globalState.update('conaint.users', users);
    }

    // Inspector Sessions
    async getInspectorSessions(): Promise<InspectorSession[]> {
        return this.context.globalState.get('conaint.inspector.sessions', []);
    }

    async saveInspectorSession(session: InspectorSession): Promise<void> {
        const sessions = await this.getInspectorSessions();
        const existingIndex = sessions.findIndex(s => s.id === session.id);
        
        if (existingIndex >= 0) {
            sessions[existingIndex] = session;
        } else {
            sessions.push(session);
        }
        
        await this.context.globalState.update('conaint.inspector.sessions', sessions);
    }

    // Telemetry Data (limited storage for recent data)
    async getTelemetryData(limit: number = 100): Promise<TelemetryData[]> {
        const data = this.context.globalState.get('conaint.telemetry', []) as TelemetryData[];
        return data.slice(-limit); // Return last N entries
    }

    async getTelemetryDataBySession(sessionId: string, limit: number = 1000): Promise<TelemetryData[]> {
        const data = this.context.globalState.get('conaint.telemetry', []) as TelemetryData[];
        return data
            .filter(item => item.sessionId === sessionId)
            .slice(-limit); // Return last N entries for this session
    }

    async clearTelemetryForSession(sessionId: string): Promise<void> {
        const data = this.context.globalState.get('conaint.telemetry', []) as TelemetryData[];
        const filteredData = data.filter(item => item.sessionId !== sessionId);
        await this.context.globalState.update('conaint.telemetry', filteredData);
    }

    async saveTelemetryData(telemetry: TelemetryData): Promise<void> {
        const data = await this.getTelemetryData(500); // Keep last 500 entries
        data.push(telemetry);
        
        // Keep only recent data to prevent storage bloat
        const recentData = data.slice(-500);
        await this.context.globalState.update('conaint.telemetry', recentData);
    }

    // AI Analysis Results
    async getAIAnalysisResults(): Promise<AIAnalysisResult[]> {
        return this.context.globalState.get('conaint.ai.results', []);
    }

    async saveAIAnalysisResult(result: AIAnalysisResult): Promise<void> {
        const results = await this.getAIAnalysisResults();
        results.push(result);
        
        // Keep only last 50 results
        const recentResults = results.slice(-50);
        await this.context.globalState.update('conaint.ai.results', recentResults);
    }

    // Configuration
    async getUserId(): Promise<string> {
        let userId = this.context.globalState.get('conaint.userId') as string;
        if (!userId) {
            // Don't auto-generate - return empty string if no custom ID is set
            return '';
        }
        return userId;
    }

    async setUserId(userId: string): Promise<void> {
        if (userId && userId.trim()) {
            await this.context.globalState.update('conaint.userId', userId.trim());
        }
    }

    async clearUserId(): Promise<void> {
        await this.context.globalState.update('conaint.userId', undefined);
    }

    async setUserIdMapping(oldUserId: string, newUserId: string): Promise<void> {
        const mappings = this.context.globalState.get('conaint.userIdMappings', {}) as Record<string, string>;
        mappings[oldUserId] = newUserId;
        await this.context.globalState.update('conaint.userIdMappings', mappings);
    }

    async getUserIdMappings(): Promise<Record<string, string>> {
        return this.context.globalState.get('conaint.userIdMappings', {}) as Record<string, string>;
    }

    async getSessionId(): Promise<string> {
        let sessionId = this.context.globalState.get('conaint.sessionId') as string;
        if (!sessionId) {
            sessionId = this.generateSessionId();
            await this.context.globalState.update('conaint.sessionId', sessionId);
        }
        return sessionId;
    }

    async updateSessionId(): Promise<string> {
        const sessionId = this.generateSessionId();
        await this.context.globalState.update('conaint.sessionId', sessionId);
        return sessionId;
    }

    async setSessionId(sessionId: string): Promise<void> {
        await this.context.globalState.update('conaint.sessionId', sessionId);
    }

    // Connection state
    async getLastConnectionState(): Promise<{ url: string; connected: boolean } | undefined> {
        return this.context.globalState.get('conaint.connection.state');
    }

    async saveConnectionState(url: string, connected: boolean): Promise<void> {
        await this.context.globalState.update('conaint.connection.state', { url, connected });
    }

    // Utility methods
    private generateUserId(): string {
        return 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    private generateSessionId(): string {
        return 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Clear all data (for testing/reset)
    async clearAllData(): Promise<void> {
        await this.context.globalState.update('conaint.problems', []);
        await this.context.globalState.update('conaint.suggestions', []);
        await this.context.globalState.update('conaint.users', []);
        await this.context.globalState.update('conaint.inspector.sessions', []);
        await this.context.globalState.update('conaint.telemetry', []);
        await this.context.globalState.update('conaint.ai.results', []);
    }

    // Export/Import for backup
    async exportData(): Promise<string> {
        const telemetryData = await this.getTelemetryData();
        const currentSessionId = await this.getSessionId();
        
        // Filter and organize telemetry by type for better analysis
        const sessionTelemetry = telemetryData.filter(t => t.sessionId === currentSessionId);
        const focusEvents = sessionTelemetry.filter(t => 
            t.type === 'window_focus' || 
            t.type === 'focus_violation' || 
            t.type === 'focus_restoration' ||
            t.type === 'telemetry.focus'  // Include new focus telemetry format
        );
        const keystrokeEvents = sessionTelemetry.filter(t => t.type === 'keystroke_activity');
        const pasteEvents = sessionTelemetry.filter(t => t.type === 'paste_detected');
        const fileEvents = sessionTelemetry.filter(t => t.type === 'file_save' || t.type === 'editor_change');
        
        const data = {
            exportInfo: {
                timestamp: new Date().toISOString(),
                exportedAt: Date.now(),
                sessionId: currentSessionId,
                userId: await this.getUserId(),
                totalTelemetryEvents: telemetryData.length,
                sessionTelemetryEvents: sessionTelemetry.length
            },
            session: {
                id: currentSessionId,
                userId: await this.getUserId(),
                events: sessionTelemetry,
                summary: {
                    focusEvents: focusEvents.length,
                    focusViolations: focusEvents.filter(e => e.type === 'focus_violation').length,
                    keystrokeEvents: keystrokeEvents.length,
                    pasteEvents: pasteEvents.length,
                    fileEvents: fileEvents.length,
                    suspiciousActivities: sessionTelemetry.filter(t => t.data?.suspiciousActivity).length
                }
            },
            // Categorized events for easier analysis
            eventsByType: {
                focusTracking: focusEvents,
                keystrokeActivity: keystrokeEvents,
                pasteDetection: pasteEvents,
                fileActivity: fileEvents
            },
            // All data for complete export
            fullData: {
                problems: await this.getProblems(),
                suggestions: await this.getSuggestions(),
                users: await this.getUsers(),
                sessions: await this.getInspectorSessions(),
                telemetry: telemetryData,
                aiResults: await this.getAIAnalysisResults()
            }
        };
        
        return JSON.stringify(data, null, 2);
    }

    async importData(jsonData: string): Promise<void> {
        try {
            const data = JSON.parse(jsonData);
            
            if (data.problems) {
                await this.context.globalState.update('conaint.problems', data.problems);
            }
            if (data.suggestions) {
                await this.context.globalState.update('conaint.suggestions', data.suggestions);
            }
            if (data.users) {
                await this.context.globalState.update('conaint.users', data.users);
            }
            if (data.sessions) {
                await this.context.globalState.update('conaint.inspector.sessions', data.sessions);
            }
            if (data.telemetry) {
                await this.context.globalState.update('conaint.telemetry', data.telemetry);
            }
            if (data.aiResults) {
                await this.context.globalState.update('conaint.ai.results', data.aiResults);
            }
        } catch (error) {
            throw new Error('Invalid data format for import');
        }
    }

    // AI Analysis Results
    async getAIAnalyses(): Promise<AIAnalysisResult[]> {
        return this.context.globalState.get('conaint.ai.analyses', []);
    }

    async saveAIAnalysis(analysis: AIAnalysisResult): Promise<void> {
        const analyses = await this.getAIAnalyses();
        analyses.push(analysis);
        
        // Keep only last 100 analyses
        const recentAnalyses = analyses.slice(-100);
        
        await this.context.globalState.update('conaint.ai.analyses', recentAnalyses);
    }

    async getAIAnalysisById(id: string): Promise<AIAnalysisResult | undefined> {
        const analyses = await this.getAIAnalyses();
        return analyses.find(a => a.id === id);
    }

    async getAIAnalysesBySession(sessionId: string): Promise<AIAnalysisResult[]> {
        const analyses = await this.getAIAnalyses();
        return analyses.filter(a => a.sessionId === sessionId);
    }

    async getAIAnalysesByUser(userId: string): Promise<AIAnalysisResult[]> {
        const analyses = await this.getAIAnalyses();
        return analyses.filter(a => a.userId === userId);
    }
}