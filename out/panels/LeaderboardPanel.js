"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardPanel = void 0;
const vscode = __importStar(require("vscode"));
class LeaderboardPanel {
    static currentPanel;
    static viewType = 'conaint.leaderboardPanel';
    _panel;
    _extensionUri;
    _disposables = [];
    manager;
    static createOrShow(extensionUri, manager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (LeaderboardPanel.currentPanel) {
            LeaderboardPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(LeaderboardPanel.viewType, 'Leaderboard - CONAINT', column || vscode.ViewColumn.Two, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
        });
        LeaderboardPanel.currentPanel = new LeaderboardPanel(panel, extensionUri, manager);
    }
    constructor(panel, extensionUri, manager) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.manager = manager;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            this.handleMessage(message);
        }, null, this._disposables);
    }
    async handleMessage(message) {
        switch (message.command) {
            case 'refresh':
                this._update();
                break;
        }
    }
    dispose() {
        LeaderboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    async _update() {
        const webview = this._panel.webview;
        this._panel.title = 'Leaderboard - CONAINT';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }
    async _getHtmlForWebview(webview) {
        const storage = this.manager.getStorage();
        const users = await storage.getUsers();
        const problems = await storage.getProblems();
        const suggestions = await storage.getSuggestions();
        // Calculate rankings
        const rankedUsers = users.map(user => {
            const userProblems = problems.filter(p => p.userId === user.id);
            const userSuggestions = suggestions.filter(s => s.userId === user.id);
            const totalVotes = userSuggestions.reduce((sum, s) => sum + s.votes, 0);
            return {
                ...user,
                problemsSubmitted: userProblems.length,
                suggestionsProvided: userSuggestions.length,
                totalVotes,
                calculatedScore: (userProblems.length * 10) + (userSuggestions.length * 5) + totalVotes
            };
        }).sort((a, b) => b.calculatedScore - a.calculatedScore);
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Leaderboard - CONAINT</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 20px;
                    line-height: 1.6;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .trophy {
                    font-size: 48px;
                    margin-bottom: 10px;
                }
                
                .controls {
                    display: flex;
                    justify-content: center;
                    gap: 10px;
                    margin-bottom: 30px;
                }
                
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 14px;
                }
                
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .leaderboard {
                    background-color: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    overflow: hidden;
                }
                
                .leaderboard-header {
                    background-color: var(--vscode-textLink-foreground);
                    color: var(--vscode-editor-background);
                    padding: 15px 20px;
                    font-weight: bold;
                    display: grid;
                    grid-template-columns: 60px 1fr 100px 100px 100px 100px;
                    gap: 15px;
                    align-items: center;
                }
                
                .leaderboard-row {
                    padding: 15px 20px;
                    display: grid;
                    grid-template-columns: 60px 1fr 100px 100px 100px 100px;
                    gap: 15px;
                    align-items: center;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    transition: background-color 0.2s;
                }
                
                .leaderboard-row:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .leaderboard-row:last-child {
                    border-bottom: none;
                }
                
                .rank {
                    text-align: center;
                    font-weight: bold;
                    font-size: 18px;
                }
                
                .rank.first {
                    color: #ffd700;
                }
                
                .rank.second {
                    color: #c0c0c0;
                }
                
                .rank.third {
                    color: #cd7f32;
                }
                
                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .user-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background-color: var(--vscode-textLink-foreground);
                    color: var(--vscode-editor-background);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 14px;
                }
                
                .user-details {
                    flex: 1;
                }
                
                .user-name {
                    font-weight: bold;
                    margin-bottom: 2px;
                }
                
                .user-role {
                    font-size: 12px;
                    opacity: 0.7;
                    text-transform: capitalize;
                }
                
                .score {
                    text-align: center;
                    font-weight: bold;
                    font-size: 20px;
                    color: var(--vscode-textLink-foreground);
                }
                
                .stat {
                    text-align: center;
                    font-size: 16px;
                }
                
                .podium {
                    display: flex;
                    justify-content: center;
                    align-items: flex-end;
                    gap: 20px;
                    margin-bottom: 40px;
                    padding: 20px;
                }
                
                .podium-place {
                    text-align: center;
                    background-color: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px 15px;
                    min-width: 120px;
                }
                
                .podium-place.first {
                    order: 2;
                    border-color: #ffd700;
                    background-color: rgba(255, 215, 0, 0.1);
                }
                
                .podium-place.second {
                    order: 1;
                    border-color: #c0c0c0;
                    background-color: rgba(192, 192, 192, 0.1);
                }
                
                .podium-place.third {
                    order: 3;
                    border-color: #cd7f32;
                    background-color: rgba(205, 127, 50, 0.1);
                }
                
                .podium-rank {
                    font-size: 36px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                
                .podium-user {
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                
                .podium-score {
                    font-size: 18px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                
                .stats-overview {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .overview-card {
                    background-color: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                    text-align: center;
                }
                
                .overview-value {
                    font-size: 32px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 5px;
                }
                
                .overview-label {
                    font-size: 14px;
                    opacity: 0.7;
                }
                
                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    opacity: 0.6;
                }
                
                .medal {
                    font-size: 24px;
                    margin-right: 5px;
                }
                
                @media (max-width: 768px) {
                    .leaderboard-header,
                    .leaderboard-row {
                        grid-template-columns: 40px 1fr 80px;
                        gap: 10px;
                    }
                    
                    .problems, .suggestions, .votes {
                        display: none;
                    }
                    
                    .podium {
                        flex-direction: column;
                        align-items: center;
                    }
                    
                    .podium-place {
                        width: 100%;
                        max-width: 300px;
                        margin-bottom: 10px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="trophy">🏆</div>
                <h1>CONAINT Leaderboard</h1>
                <p>Rankings based on problems submitted, suggestions provided, and community votes</p>
            </div>

            <div class="controls">
                <button onclick="refresh()">Refresh Rankings</button>
            </div>

            <div class="stats-overview">
                <div class="overview-card">
                    <div class="overview-value">${users.length}</div>
                    <div class="overview-label">Total Users</div>
                </div>
                <div class="overview-card">
                    <div class="overview-value">${problems.length}</div>
                    <div class="overview-label">Problems Submitted</div>
                </div>
                <div class="overview-card">
                    <div class="overview-value">${suggestions.length}</div>
                    <div class="overview-label">Suggestions Made</div>
                </div>
                <div class="overview-card">
                    <div class="overview-value">${suggestions.reduce((sum, s) => sum + s.votes, 0)}</div>
                    <div class="overview-label">Total Votes</div>
                </div>
            </div>

            ${rankedUsers.length >= 3 ? `
                <div class="podium">
                    ${rankedUsers.slice(0, 3).map((user, index) => {
            const medals = ['🥇', '🥈', '🥉'];
            const places = ['first', 'second', 'third'];
            const ranks = ['1st', '2nd', '3rd'];
            return `
                            <div class="podium-place ${places[index]}">
                                <div class="podium-rank">${medals[index]}</div>
                                <div class="podium-user">${user.name}</div>
                                <div class="podium-score">${user.calculatedScore} pts</div>
                            </div>
                        `;
        }).join('')}
                </div>
            ` : ''}

            ${rankedUsers.length > 0 ? `
                <div class="leaderboard">
                    <div class="leaderboard-header">
                        <div>Rank</div>
                        <div>User</div>
                        <div class="problems">Problems</div>
                        <div class="suggestions">Suggestions</div>
                        <div class="votes">Votes</div>
                        <div>Score</div>
                    </div>
                    
                    ${rankedUsers.map((user, index) => {
            const rankClass = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : '';
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
            return `
                            <div class="leaderboard-row">
                                <div class="rank ${rankClass}">
                                    ${medal}${index + 1}
                                </div>
                                <div class="user-info">
                                    <div class="user-avatar">
                                        ${user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div class="user-details">
                                        <div class="user-name">${user.name}</div>
                                        <div class="user-role">${user.role}</div>
                                    </div>
                                </div>
                                <div class="stat problems">${user.problemsSubmitted}</div>
                                <div class="stat suggestions">${user.suggestionsProvided}</div>
                                <div class="stat votes">${user.totalVotes}</div>
                                <div class="score">${user.calculatedScore}</div>
                            </div>
                        `;
        }).join('')}
                </div>
            ` : `
                <div class="empty-state">
                    <h3>No Rankings Yet</h3>
                    <p>Start submitting problems and suggestions to appear on the leaderboard!</p>
                </div>
            `}

            <div style="margin-top: 30px; padding: 20px; background-color: var(--vscode-textBlockQuote-background); border-radius: 6px; font-size: 14px; opacity: 0.8;">
                <h4>Scoring System:</h4>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Problem Submitted: 10 points</li>
                    <li>Suggestion Made: 5 points</li>
                    <li>Vote Received: 1 point</li>
                </ul>
                <p><em>Rankings are updated in real-time based on community activity.</em></p>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }
            </script>
        </body>
        </html>`;
    }
}
exports.LeaderboardPanel = LeaderboardPanel;
//# sourceMappingURL=LeaderboardPanel.js.map