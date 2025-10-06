import * as vscode from 'vscode';
import { Manager } from './manager';
import { Storage } from './storage';
import { Problem, Suggestion, User, WebSocketMessage } from './types';

export class LiveFeedPanel {
    public static currentPanel: LiveFeedPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private manager: Manager;
    private storage: Storage;
    private refreshInterval: NodeJS.Timeout | undefined;

    public static createOrShow(extensionUri: vscode.Uri, manager: Manager, storage: Storage) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (LiveFeedPanel.currentPanel) {
            LiveFeedPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'liveFeed',
            'CONAINT Live Feed',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out/src')
                ]
            }
        );

        LiveFeedPanel.currentPanel = new LiveFeedPanel(panel, extensionUri, manager, storage);
    }

    public static kill() {
        LiveFeedPanel.currentPanel?.dispose();
        LiveFeedPanel.currentPanel = undefined;
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, manager: Manager, storage: Storage) {
        LiveFeedPanel.currentPanel = new LiveFeedPanel(panel, extensionUri, manager, storage);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, manager: Manager, storage: Storage) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.manager = manager;
        this.storage = storage;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.type) {
                    case 'refreshFeed':
                        this._update();
                        break;
                    case 'submitSuggestion':
                        this._handleSuggestionSubmit(message.data);
                        break;
                    case 'voteSuggestion':
                        this._handleSuggestionVote(message.data);
                        break;
                    case 'filterFeed':
                        this._handleFeedFilter(message.data);
                        break;
                }
            },
            null,
            this._disposables
        );

        // Auto-refresh every 30 seconds
        this.refreshInterval = setInterval(() => {
            this._update();
        }, 30000);
    }

    public dispose() {
        LiveFeedPanel.currentPanel = undefined;

        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _handleSuggestionSubmit(data: { problemId: string; content: string }) {
        try {
            const config = this.manager.getConfig();
            const userId = config.userId || 'anonymous';
            
            const suggestion: Suggestion = {
                id: `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                problemId: data.problemId,
                content: data.content,
                userId: userId,
                timestamp: Date.now(),
                votes: 0,
                status: 'pending'
            };

            await this.storage.saveSuggestion(suggestion);
            
            // Send to server if connected
            if (this.manager.isConnected()) {
                this.manager.sendMessage({
                    type: 'suggestion.created',
                    data: suggestion,
                    timestamp: Date.now(),
                    userId: userId
                });
            }

            this._update(); // Refresh the feed
            vscode.window.showInformationMessage('Suggestion submitted successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to submit suggestion: ${error}`);
        }
    }

    private async _handleSuggestionVote(data: { suggestionId: string; vote: number }) {
        try {
            const suggestions = await this.storage.getSuggestions();
            const suggestion = suggestions.find(s => s.id === data.suggestionId);
            
            if (suggestion) {
                suggestion.votes += data.vote;
                await this.storage.saveSuggestion(suggestion);
                this._update(); // Refresh the feed
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to vote: ${error}`);
        }
    }

    private async _handleFeedFilter(data: { filter: string; value: string }) {
        // Update the UI with filtered content
        this._update();
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const problems = await this.storage.getProblems();
        const suggestions = await this.storage.getSuggestions();
        const users = await this.storage.getUsers();
        const aiAnalyses = await this.storage.getAIAnalyses();

        // Get recent activity (last 24 hours)
        const now = Date.now();
        const dayAgo = now - (24 * 60 * 60 * 1000);
        
        const recentProblems = problems.filter(p => p.timestamp > dayAgo).sort((a, b) => b.timestamp - a.timestamp);
        const recentSuggestions = suggestions.filter(s => s.timestamp > dayAgo).sort((a, b) => b.timestamp - a.timestamp);
        const recentAnalyses = aiAnalyses.filter(a => a.timestamp > dayAgo).sort((a, b) => b.timestamp - a.timestamp);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CONAINT Live Feed</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        
        .title {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        
        .refresh-btn, .filter-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-left: 10px;
        }
        
        .refresh-btn:hover, .filter-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .filters {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-panel-background);
            border-radius: 6px;
        }
        
        .filter-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        
        .filter-group label {
            font-size: 12px;
            font-weight: bold;
            color: var(--vscode-descriptionForeground);
        }
        
        .filter-group select {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 3px;
        }
        
        .feed-container {
            display: block;
        }
        
        .feed-section {
            background-color: var(--vscode-panel-background);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid var(--vscode-panel-border);
        }
        
        .section-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--vscode-textLink-foreground);
            display: flex;
            align-items: center;
        }
        
        .section-title::before {
            content: "";
            width: 4px;
            height: 20px;
            background-color: var(--vscode-textLink-foreground);
            margin-right: 8px;
            border-radius: 2px;
        }
        
        .feed-item {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
            transition: all 0.2s ease;
        }
        
        .feed-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            border-color: var(--vscode-textLink-foreground);
        }
        
        .item-title {
            font-weight: bold;
            color: var(--vscode-editor-foreground);
            margin-bottom: 6px;
        }
        
        .item-content {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            line-height: 1.4;
        }
        
        .item-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        
        .timestamp {
            opacity: 0.7;
        }
        
        .user-info {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        
        .difficulty-tag {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .difficulty-easy { background-color: #28a745; color: white; }
        .difficulty-medium { background-color: #ffc107; color: black; }
        .difficulty-hard { background-color: #dc3545; color: white; }
        
        .vote-buttons {
            display: flex;
            gap: 5px;
            align-items: center;
        }
        
        .vote-btn {
            background: none;
            border: 1px solid var(--vscode-panel-border);
            color: var(--vscode-editor-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }
        
        .vote-btn:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .votes {
            margin: 0 5px;
            font-weight: bold;
        }
        
        .ai-analysis {
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding-left: 10px;
        }
        
        .analysis-score {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
        }
        
        .score-bar {
            width: 60px;
            height: 4px;
            background-color: var(--vscode-panel-border);
            border-radius: 2px;
            overflow: hidden;
        }
        
        .score-fill {
            height: 100%;
            background-color: var(--vscode-textLink-foreground);
            transition: width 0.3s ease;
        }
        
        .suspicious-flag {
            color: #dc3545;
            font-weight: bold;
            font-size: 11px;
        }
        
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 20px;
        }
        
        .suggestions-section {
            margin-top: 15px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .suggestions-title {
            font-size: 14px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 8px;
        }
        
        .suggestion-item {
            background-color: var(--vscode-list-hoverBackground);
            border-radius: 4px;
            padding: 8px;
            margin-bottom: 6px;
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
        
        .suggestion-content {
            font-size: 12px;
            color: var(--vscode-editor-foreground);
            margin-bottom: 5px;
            line-height: 1.3;
        }
        
        .suggestion-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
        }
        
        .suggestion-user {
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
        }
        
        .suggestion-time {
            color: var(--vscode-descriptionForeground);
            margin-left: 5px;
        }
        
        .add-suggestion {
            margin-top: 8px;
            text-align: center;
        }
        
        .no-suggestions {
            margin-top: 15px;
            padding: 10px;
            text-align: center;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .no-suggestions-text {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 12px;
            display: block;
            margin-bottom: 8px;
        }
        
        .add-suggestion-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            transition: background-color 0.2s;
        }
        
        .add-suggestion-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">🚀 CONAINT Live Feed</div>
        <div>
            <button class="filter-btn" onclick="toggleFilters()">🔍 Filters</button>
            <button class="refresh-btn" onclick="refreshFeed()">🔄 Refresh</button>
        </div>
    </div>
    
    <div class="filters" id="filters" style="display: none;">
        <div class="filter-group">
            <label>Time Range</label>
            <select onchange="applyFilter('time', this.value)">
                <option value="24h">Last 24 hours</option>
                <option value="week">Last week</option>
                <option value="month">Last month</option>
                <option value="all">All time</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Show</label>
            <select onchange="applyFilter('type', this.value)">
                <option value="all">All problems</option>
                <option value="with-suggestions">Problems with suggestions</option>
                <option value="without-suggestions">Problems without suggestions</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Difficulty</label>
            <select onchange="applyFilter('difficulty', this.value)">
                <option value="all">All levels</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
            </select>
        </div>
    </div>
    
    <div class="feed-container">
        <div class="feed-section">
            <div class="section-title">📋 Live Problem Feed</div>
            ${recentProblems.length > 0 ? recentProblems.map(problem => {
                const problemSuggestions = suggestions.filter(s => s.problemId === problem.id);
                return `
                <div class="feed-item">
                    <div class="item-title">${this.escapeHtml(problem.title)}</div>
                    <div class="item-content">${this.escapeHtml(problem.description.substring(0, 100))}${problem.description.length > 100 ? '...' : ''}</div>
                    <div class="item-meta">
                        <div>
                            <span class="difficulty-tag difficulty-${problem.difficulty.toLowerCase()}">${problem.difficulty}</span>
                            <span class="user-info">${this.escapeHtml(problem.userId)}</span>
                        </div>
                        <span class="timestamp">${this.formatTime(problem.timestamp)}</span>
                    </div>
                    
                    ${problemSuggestions.length > 0 ? `
                    <div class="suggestions-section">
                        <div class="suggestions-title">💡 Suggestions (${problemSuggestions.length})</div>
                        ${problemSuggestions.map(suggestion => `
                            <div class="suggestion-item">
                                <div class="suggestion-content">${this.escapeHtml(suggestion.content.substring(0, 120))}${suggestion.content.length > 120 ? '...' : ''}</div>
                                <div class="suggestion-meta">
                                    <div class="vote-buttons">
                                        <button class="vote-btn" onclick="voteSuggestion('${suggestion.id}', 1)">👍</button>
                                        <span class="votes">${suggestion.votes}</span>
                                        <button class="vote-btn" onclick="voteSuggestion('${suggestion.id}', -1)">👎</button>
                                    </div>
                                    <div>
                                        <span class="suggestion-user">${this.escapeHtml(suggestion.userId)}</span>
                                        <span class="suggestion-time">${this.formatTime(suggestion.timestamp)}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        <div class="add-suggestion">
                            <button class="add-suggestion-btn" onclick="showSuggestionForm('${problem.id}')">+ Add Suggestion</button>
                        </div>
                    </div>
                    ` : `
                    <div class="no-suggestions">
                        <span class="no-suggestions-text">No suggestions yet</span>
                        <button class="add-suggestion-btn" onclick="showSuggestionForm('${problem.id}')">+ Be the first to suggest</button>
                    </div>
                    `}
                </div>
                `;
            }).join('') : '<div class="empty-state">No recent problems</div>'}
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function refreshFeed() {
            vscode.postMessage({ type: 'refreshFeed' });
        }
        
        function toggleFilters() {
            const filters = document.getElementById('filters');
            filters.style.display = filters.style.display === 'none' ? 'block' : 'none';
        }
        
        function applyFilter(type, value) {
            vscode.postMessage({ 
                type: 'filterFeed', 
                data: { filter: type, value: value } 
            });
        }
        
        function voteSuggestion(suggestionId, vote) {
            vscode.postMessage({ 
                type: 'voteSuggestion', 
                data: { suggestionId: suggestionId, vote: vote } 
            });
        }
        
        function showSuggestionForm(problemId) {
            const content = prompt('Enter your suggestion:');
            if (content && content.trim()) {
                vscode.postMessage({ 
                    type: 'submitSuggestion', 
                    data: { problemId: problemId, content: content.trim() } 
                });
            }
        }
        
        // Auto-refresh indicator
        let refreshCount = 0;
        setInterval(() => {
            refreshCount++;
            const refreshBtn = document.querySelector('.refresh-btn');
            if (refreshBtn && refreshCount % 30 === 0) {
                refreshBtn.textContent = '🔄 Refreshing...';
                setTimeout(() => {
                    refreshBtn.textContent = '🔄 Refresh';
                }, 1000);
            }
        }, 1000);
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private formatTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) { // Less than 1 minute
            return 'Just now';
        } else if (diff < 3600000) { // Less than 1 hour
            return `${Math.floor(diff / 60000)}m ago`;
        } else if (diff < 86400000) { // Less than 1 day
            return `${Math.floor(diff / 3600000)}h ago`;
        } else {
            return `${Math.floor(diff / 86400000)}d ago`;
        }
    }
}