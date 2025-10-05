import * as vscode from 'vscode';
import { Manager } from './manager';
import { Storage } from './storage';
import { User, Problem, Suggestion, AIAnalysisResult } from './types';

export class LeaderboardPanel {
    public static currentPanel: LeaderboardPanel | undefined;
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

        if (LeaderboardPanel.currentPanel) {
            LeaderboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'leaderboard',
            'CONAINT Leaderboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out/src')
                ]
            }
        );

        LeaderboardPanel.currentPanel = new LeaderboardPanel(panel, extensionUri, manager, storage);
    }

    public static kill() {
        LeaderboardPanel.currentPanel?.dispose();
        LeaderboardPanel.currentPanel = undefined;
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, manager: Manager, storage: Storage) {
        LeaderboardPanel.currentPanel = new LeaderboardPanel(panel, extensionUri, manager, storage);
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
                    case 'refreshLeaderboard':
                        this._update();
                        break;
                    case 'viewUserProfile':
                        this._handleViewProfile(message.data);
                        break;
                    case 'filterLeaderboard':
                        this._handleFilterChange(message.data);
                        break;
                }
            },
            null,
            this._disposables
        );

        // Auto-refresh every 60 seconds
        this.refreshInterval = setInterval(() => {
            this._update();
        }, 60000);
    }

    public dispose() {
        LeaderboardPanel.currentPanel = undefined;

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

    private async _handleViewProfile(data: { userId: string }) {
        // Show detailed user stats in a new panel or message
        const users = await this.storage.getUsers();
        const user = users.find(u => u.id === data.userId);
        
        if (user) {
            const problems = await this.storage.getProblems();
            const suggestions = await this.storage.getSuggestions();
            const analyses = await this.storage.getAIAnalyses();
            
            const userProblems = problems.filter(p => p.userId === user.id);
            const userSuggestions = suggestions.filter(s => s.userId === user.id);
            const userAnalyses = analyses.filter(a => a.userId === user.id);
            
            const profileInfo = `
User Profile: ${user.name} (${user.id})
Role: ${user.role}
Join Date: ${user.joinDate || 'Unknown'}
Problems Submitted: ${userProblems.length}
Suggestions Provided: ${userSuggestions.length}
Total Score: ${user.stats.score}
AI Analyses: ${userAnalyses.length}
Average Productivity: ${userAnalyses.length > 0 ? 
    (userAnalyses.reduce((sum, a) => sum + (a.analysis.productivityScore || 0), 0) / userAnalyses.length).toFixed(1) : 'N/A'}%
            `;
            
            vscode.window.showInformationMessage(profileInfo, { modal: true });
        }
    }

    private async _handleFilterChange(data: { filter: string; value: string }) {
        // Apply filter and refresh
        this._update();
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const users = await this.storage.getUsers();
        const problems = await this.storage.getProblems();
        const suggestions = await this.storage.getSuggestions();
        const analyses = await this.storage.getAIAnalyses();

        // Calculate enhanced stats for each user
        const enhancedUsers = users.map(user => {
            const userProblems = problems.filter(p => p.userId === user.id);
            const userSuggestions = suggestions.filter(s => s.userId === user.id);
            const userAnalyses = analyses.filter(a => a.userId === user.id);
            
            const totalVotes = userSuggestions.reduce((sum, s) => sum + (s.votes || 0), 0);
            const avgProductivity = userAnalyses.length > 0 ? 
                userAnalyses.reduce((sum, a) => sum + (a.analysis.productivityScore || 0), 0) / userAnalyses.length : 0;
            const suspiciousActivities = userAnalyses.filter(a => a.analysis.suspiciousActivity).length;
            
            // Calculate comprehensive score
            const problemScore = userProblems.length * 10;
            const suggestionScore = userSuggestions.length * 5;
            const voteScore = totalVotes * 2;
            const productivityBonus = Math.floor(avgProductivity / 10) * 5;
            const integrityPenalty = suspiciousActivities * -10;
            
            const totalScore = problemScore + suggestionScore + voteScore + productivityBonus + integrityPenalty;
            
            return {
                ...user,
                enhancedStats: {
                    problemsCount: userProblems.length,
                    suggestionsCount: userSuggestions.length,
                    totalVotes: totalVotes,
                    avgProductivity: avgProductivity,
                    suspiciousCount: suspiciousActivities,
                    totalScore: Math.max(0, totalScore), // Don't allow negative scores
                    analysesCount: userAnalyses.length,
                    lastActivity: Math.max(
                        user.lastActivity,
                        ...userProblems.map(p => p.timestamp),
                        ...userSuggestions.map(s => s.timestamp),
                        ...userAnalyses.map(a => a.timestamp)
                    )
                }
            };
        });

        // Sort by total score descending
        const sortedUsers = enhancedUsers.sort((a, b) => b.enhancedStats.totalScore - a.enhancedStats.totalScore);

        // Get top performers in different categories
        const topProblemSolvers = [...enhancedUsers].sort((a, b) => b.enhancedStats.problemsCount - a.enhancedStats.problemsCount).slice(0, 5);
        const topContributors = [...enhancedUsers].sort((a, b) => b.enhancedStats.suggestionsCount - a.enhancedStats.suggestionsCount).slice(0, 5);
        const mostProductive = [...enhancedUsers].sort((a, b) => b.enhancedStats.avgProductivity - a.enhancedStats.avgProductivity).slice(0, 5);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CONAINT Leaderboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        
        .title {
            font-size: 28px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 10px;
        }
        
        .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
        
        .controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        
        .filter-controls {
            display: flex;
            gap: 10px;
        }
        
        .filter-select {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 6px 12px;
            border-radius: 4px;
        }
        
        .refresh-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .refresh-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .leaderboard-container {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 20px;
        }
        
        .main-leaderboard {
            background-color: var(--vscode-panel-background);
            border-radius: 8px;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
        }
        
        .sidebar-stats {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        
        .stats-section {
            background-color: var(--vscode-panel-background);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid var(--vscode-panel-border);
        }
        
        .section-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--vscode-textLink-foreground);
            display: flex;
            align-items: center;
        }
        
        .section-title::before {
            content: "";
            width: 3px;
            height: 16px;
            background-color: var(--vscode-textLink-foreground);
            margin-right: 8px;
            border-radius: 2px;
        }
        
        .leaderboard-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        .leaderboard-item {
            display: flex;
            align-items: center;
            padding: 12px;
            margin-bottom: 8px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            transition: all 0.3s ease;
            cursor: pointer;
        }
        
        .leaderboard-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            border-color: var(--vscode-textLink-foreground);
        }
        
        .rank {
            font-size: 18px;
            font-weight: bold;
            width: 40px;
            text-align: center;
            margin-right: 15px;
        }
        
        .rank-1 { color: #FFD700; }
        .rank-2 { color: #C0C0C0; }
        .rank-3 { color: #CD7F32; }
        
        .user-info {
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        
        .user-name {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 2px;
        }
        
        .user-role {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
        }
        
        .user-stats {
            display: flex;
            gap: 15px;
            align-items: center;
            font-size: 12px;
        }
        
        .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        
        .stat-value {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        
        .stat-label {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
        }
        
        .total-score {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-left: 10px;
        }
        
        .mini-leaderboard {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        .mini-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .mini-item:last-child {
            border-bottom: none;
        }
        
        .mini-name {
            font-weight: bold;
            font-size: 13px;
        }
        
        .mini-value {
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
            font-size: 12px;
        }
        
        .integrity-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-left: 8px;
        }
        
        .integrity-good { background-color: #28a745; }
        .integrity-warning { background-color: #ffc107; }
        .integrity-alert { background-color: #dc3545; }
        
        .activity-indicator {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px 20px;
        }
        
        @media (max-width: 768px) {
            .leaderboard-container {
                grid-template-columns: 1fr;
            }
            
            .user-stats {
                gap: 8px;
            }
            
            .stat-item {
                min-width: 40px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">🏆 CONAINT Leaderboard</div>
        <div class="subtitle">Community Rankings & Performance Analytics</div>
    </div>
    
    <div class="controls">
        <div class="filter-controls">
            <select class="filter-select" onchange="filterLeaderboard('timeframe', this.value)">
                <option value="all">All Time</option>
                <option value="month">This Month</option>
                <option value="week">This Week</option>
                <option value="today">Today</option>
            </select>
            <select class="filter-select" onchange="filterLeaderboard('role', this.value)">
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="instructor">Instructors</option>
            </select>
        </div>
        <button class="refresh-btn" onclick="refreshLeaderboard()">🔄 Refresh</button>
    </div>
    
    <div class="leaderboard-container">
        <div class="main-leaderboard">
            <div class="section-title">🎯 Overall Rankings</div>
            ${sortedUsers.length > 0 ? `
                <ul class="leaderboard-list">
                    ${sortedUsers.map((user, index) => `
                        <li class="leaderboard-item" onclick="viewProfile('${user.id}')">
                            <div class="rank rank-${index + 1 <= 3 ? index + 1 : 'other'}">#${index + 1}</div>
                            <div class="user-info">
                                <div class="user-name">${this.escapeHtml(user.name)}</div>
                                <div class="user-role">${user.role}</div>
                                <div class="activity-indicator">Last active: ${this.formatTime(user.enhancedStats.lastActivity)}</div>
                            </div>
                            <div class="user-stats">
                                <div class="stat-item">
                                    <div class="stat-value">${user.enhancedStats.problemsCount}</div>
                                    <div class="stat-label">Problems</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${user.enhancedStats.suggestionsCount}</div>
                                    <div class="stat-label">Suggestions</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${user.enhancedStats.totalVotes}</div>
                                    <div class="stat-label">Votes</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${user.enhancedStats.avgProductivity.toFixed(0)}%</div>
                                    <div class="stat-label">Productivity</div>
                                </div>
                            </div>
                            <div class="integrity-indicator ${
                                user.enhancedStats.suspiciousCount === 0 ? 'integrity-good' : 
                                user.enhancedStats.suspiciousCount <= 2 ? 'integrity-warning' : 'integrity-alert'
                            }" title="Academic Integrity Score"></div>
                            <div class="total-score">${user.enhancedStats.totalScore}</div>
                        </li>
                    `).join('')}
                </ul>
            ` : '<div class="empty-state">No users found</div>'}
        </div>
        
        <div class="sidebar-stats">
            <div class="stats-section">
                <div class="section-title">📋 Top Problem Solvers</div>
                <ul class="mini-leaderboard">
                    ${topProblemSolvers.map(user => `
                        <li class="mini-item">
                            <span class="mini-name">${this.escapeHtml(user.name)}</span>
                            <span class="mini-value">${user.enhancedStats.problemsCount}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <div class="stats-section">
                <div class="section-title">💡 Top Contributors</div>
                <ul class="mini-leaderboard">
                    ${topContributors.map(user => `
                        <li class="mini-item">
                            <span class="mini-name">${this.escapeHtml(user.name)}</span>
                            <span class="mini-value">${user.enhancedStats.suggestionsCount}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <div class="stats-section">
                <div class="section-title">🚀 Most Productive</div>
                <ul class="mini-leaderboard">
                    ${mostProductive.map(user => `
                        <li class="mini-item">
                            <span class="mini-name">${this.escapeHtml(user.name)}</span>
                            <span class="mini-value">${user.enhancedStats.avgProductivity.toFixed(0)}%</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <div class="stats-section">
                <div class="section-title">📊 Community Stats</div>
                <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
                    <div style="margin-bottom: 8px;">
                        <strong>Total Users:</strong> ${users.length}
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong>Total Problems:</strong> ${problems.length}
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong>Total Suggestions:</strong> ${suggestions.length}
                    </div>
                    <div>
                        <strong>AI Analyses:</strong> ${analyses.length}
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function refreshLeaderboard() {
            vscode.postMessage({ type: 'refreshLeaderboard' });
        }
        
        function viewProfile(userId) {
            vscode.postMessage({ 
                type: 'viewUserProfile', 
                data: { userId: userId } 
            });
        }
        
        function filterLeaderboard(filter, value) {
            vscode.postMessage({ 
                type: 'filterLeaderboard', 
                data: { filter: filter, value: value } 
            });
        }
        
        // Auto-refresh indicator
        let refreshCount = 0;
        setInterval(() => {
            refreshCount++;
            if (refreshCount % 60 === 0) { // Every 60 seconds
                const refreshBtn = document.querySelector('.refresh-btn');
                if (refreshBtn) {
                    refreshBtn.textContent = '🔄 Auto-refreshing...';
                    setTimeout(() => {
                        refreshBtn.textContent = '🔄 Refresh';
                    }, 2000);
                }
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