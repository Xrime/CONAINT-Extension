import * as vscode from 'vscode';
import { Manager } from '../manager';

export class LiveFeedPanel {
    public static currentPanel: LiveFeedPanel | undefined;
    public static readonly viewType = 'conaint.liveFeedPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private manager: Manager;
    private updateInterval: NodeJS.Timeout | null = null;

    public static createOrShow(extensionUri: vscode.Uri, manager: Manager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (LiveFeedPanel.currentPanel) {
            LiveFeedPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            LiveFeedPanel.viewType,
            'Live Feed - CONAINT',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        LiveFeedPanel.currentPanel = new LiveFeedPanel(panel, extensionUri, manager);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, manager: Manager) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.manager = manager;

        this._update();
        this.startAutoUpdate();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                this.handleMessage(message);
            },
            null,
            this._disposables
        );
    }

    private async handleMessage(message: any) {
        switch (message.command) {
            case 'refresh':
                this._update();
                break;
            case 'clearFeed':
                // Clear feed data
                this._update();
                break;
            case 'addSuggestion':
                await this.addSuggestion(message.problemId, message.content, message.userId);
                break;
            case 'voteSuggestion':
                await this.voteSuggestion(message.suggestionId, message.vote);
                break;
        }
    }
    
    private async addSuggestion(problemId: string, content: string, userId: string) {
        const storage = this.manager.getStorage();
        const suggestion = {
            id: Date.now().toString(),
            problemId,
            content,
            userId,
            timestamp: Date.now(),
            votes: 0,
            status: 'pending' as const
        };
        
        await storage.saveSuggestion(suggestion);
        this._update();
        vscode.window.showInformationMessage('Suggestion added successfully!');
    }
    
    private async voteSuggestion(suggestionId: string, vote: 'up' | 'down') {
        const storage = this.manager.getStorage();
        const suggestions = await storage.getSuggestions();
        const suggestion = suggestions.find(s => s.id === suggestionId);
        
        if (suggestion) {
            suggestion.votes += vote === 'up' ? 1 : -1;
            await storage.saveSuggestion(suggestion);
            this._update();
        }
    }

    private startAutoUpdate() {
        this.updateInterval = setInterval(() => {
            this._update();
        }, 3000); // Update every 3 seconds
    }

    private stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    public dispose() {
        LiveFeedPanel.currentPanel = undefined;
        this.stopAutoUpdate();

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.title = 'Live Feed - CONAINT';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const storage = this.manager.getStorage();
        const problems = await storage.getProblems();
        const suggestions = await storage.getSuggestions();
        const connectionStatus = this.manager.getConnectionStatus();

        // Combine problems and suggestions into a single feed
        const activities = [
            ...problems.map(p => ({
                type: 'problem',
                id: p.id,
                title: p.title,
                user: p.userId,
                timestamp: p.timestamp,
                data: p
            })),
            ...suggestions.map(s => ({
                type: 'suggestion',
                id: s.id,
                title: `Suggestion for problem`,
                user: s.userId,
                timestamp: s.timestamp,
                data: s
            }))
        ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Live Problem Feed</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                    background: #1e1e1e;
                    color: #ffffff;
                    line-height: 1.5;
                }
                
                .header {
                    background: #2d2d30;
                    padding: 15px 20px;
                    border-bottom: 1px solid #3e3e42;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .header-title {
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 600;
                }
                
                .nav-buttons {
                    display: flex;
                    gap: 8px;
                }
                
                .nav-btn {
                    background: #007acc;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                
                .nav-btn:hover {
                    background: #005a9e;
                }
                
                .nav-btn.secondary {
                    background: #0e639c;
                }
                
                .stats-bar {
                    background: #252526;
                    padding: 20px;
                    margin: 20px;
                    border-radius: 8px;
                    border: 1px solid #3e3e42;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 40px;
                    text-align: center;
                }
                
                .stat-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                
                .stat-value {
                    font-size: 48px;
                    font-weight: bold;
                    color: #007acc;
                    margin-bottom: 8px;
                }
                
                .stat-label {
                    font-size: 14px;
                    color: #cccccc;
                    font-weight: 500;
                }
                
                .problems-container {
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                    border: none;
                    border-radius: 6px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s ease;
                }
                
                .refresh-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                    transform: translateY(-1px);
                }
                
                .connection-status {
                    padding: 10px 15px;
                    border-radius: 6px;
                    margin-bottom: 20px;
                    font-size: 14px;
                    font-weight: 500;
                }
                
                .connection-status.connected {
                    background-color: rgba(76, 175, 80, 0.1);
                    border: 1px solid rgba(76, 175, 80, 0.3);
                    color: #4caf50;
                }
                
                .connection-status.disconnected {
                    background-color: rgba(255, 152, 0, 0.1);
                    border: 1px solid rgba(255, 152, 0, 0.3);
                    color: #ff9800;
                }
                

                
                .problem-card {
                    background: #2d2d30;
                    border: 1px solid #3e3e42;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                
                .problem-header {
                    margin-bottom: 15px;
                }
                
                .problem-meta {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                    font-size: 12px;
                    color: #cccccc;
                }
                
                .problem-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #007acc;
                    margin-bottom: 10px;
                }
                
                .problem-content {
                    margin-bottom: 15px;
                }
                
                .problem-description {
                    color: #cccccc;
                    margin-bottom: 10px;
                    line-height: 1.6;
                }
                
                .problem-tags {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 15px;
                }
                
                .tag {
                    background: #007acc;
                    color: white;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 500;
                }
                
                .suggestion-area {
                    border-top: 1px solid #3e3e42;
                    padding-top: 15px;
                }
                
                .suggestion-textarea {
                    width: 100%;
                    background: #1e1e1e;
                    border: 1px solid #3e3e42;
                    border-radius: 4px;
                    padding: 12px;
                    color: #ffffff;
                    font-family: inherit;
                    font-size: 14px;
                    resize: vertical;
                    min-height: 80px;
                    margin-bottom: 10px;
                }
                
                .suggestion-textarea::placeholder {
                    color: #6a6a6a;
                }
                
                .suggestion-btn {
                    background: #007acc;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                
                .suggestion-btn:hover {
                    background: #005a9e;
                }
                

                

                
                .problem-suggestions {
                    margin-top: 15px;
                    border-top: 2px solid var(--vscode-textLink-foreground);
                    padding-top: 12px;
                    background: rgba(0, 122, 204, 0.05);
                    border-radius: 8px;
                    padding: 12px;
                }
                
                .suggestions-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    font-weight: 600;
                    color: var(--vscode-textLink-foreground);
                }
                
                .toggle-suggestions {
                    background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-textLink-foreground) 100%);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.2s ease;
                }
                
                .toggle-suggestions:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                }
                
                .suggestions-container {
                    padding: 10px;
                    background-color: var(--vscode-sideBar-background);
                    border-radius: 4px;
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .suggestion-item {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 10px;
                    margin-bottom: 8px;
                }
                
                .suggestion-content {
                    margin-bottom: 8px;
                    font-size: 13px;
                    line-height: 1.4;
                }
                
                .suggestion-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 11px;
                }
                
                .suggestion-votes {
                    display: flex;
                    gap: 5px;
                }
                
                .suggestion-votes button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                    padding: 2px 6px;
                    cursor: pointer;
                    font-size: 11px;
                }
                
                .no-suggestions {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    margin-bottom: 10px;
                }
                
                .add-suggestion {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid var(--vscode-panel-border);
                    background: rgba(255, 255, 255, 0.02);
                    padding: 12px;
                    border-radius: 6px;
                }
                
                .add-suggestion textarea {
                    width: 100%;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 2px solid var(--vscode-input-border);
                    border-radius: 6px;
                    padding: 10px;
                    resize: vertical;
                    margin-bottom: 10px;
                    font-family: var(--vscode-font-family);
                    font-size: 13px;
                    transition: border-color 0.2s ease;
                }
                
                .add-suggestion textarea:focus {
                    outline: none;
                    border-color: var(--vscode-textLink-foreground);
                    box-shadow: 0 0 0 1px var(--vscode-textLink-foreground);
                }
                
                .add-suggestion button {
                    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: all 0.2s ease;
                }
                
                .add-suggestion button:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
                }
                

                
                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    opacity: 0.6;
                }
                
                .empty-icon {
                    font-size: 4em;
                    margin-bottom: 20px;
                }
                
                .empty-state h3 {
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 10px;
                }
                
                .empty-state p {
                    opacity: 0.8;
                }
                

            </style>
        </head>
        <body>
            <div class="header">
                <h1>� Community Problems & Solutions</h1>
                <div class="header-actions">
                    <button onclick="refresh()" class="refresh-btn">🔄 Refresh</button>
                </div>
            </div>

            ${connectionStatus.connected ? 
                '<div class="connection-status connected">✅ Connected - Real-time updates active</div>' :
                '<div class="connection-status disconnected">⚠️ Offline - Showing local problems only</div>'}

            <div class="problems-container">
                ${problems.length > 0 ? 
                    problems.map(problem => {
                        const problemSuggestions = suggestions.filter(s => s.problemId === problem.id);
                        
                        return `
                            <div class="problem-card">
                                <div class="problem-header">
                                    <div class="problem-info">
                                        <div class="problem-title">📝 ${problem.title}</div>
                                        <div class="problem-meta">
                                            <span class="difficulty-badge ${problem.difficulty.toLowerCase()}">${problem.difficulty}</span>
                                            <span class="status-badge ${problem.status}">${problem.status}</span>
                                            <span class="user-info">by ${problem.userId}</span>
                                            <span class="time-info">${new Date(problem.timestamp).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="problem-description">
                                    ${problem.description}
                                </div>
                                
                                <div class="problem-tags">
                                    ${problem.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                                </div>
                                
                                <div class="problem-suggestions">
                                    <div class="suggestions-header">
                                        <span>💡 ${problemSuggestions.length} Solutions</span>
                                        <button class="toggle-suggestions" onclick="toggleSuggestions('${problem.id}')">${problemSuggestions.length > 0 ? 'Show Solutions' : 'Add First Solution'}</button>
                                    </div>
                                    <div class="suggestions-container" id="suggestions-${problem.id}" style="display: none;">
                                        ${problemSuggestions.length > 0 ? 
                                            problemSuggestions.map(s => `
                                                <div class="suggestion-item">
                                                    <div class="suggestion-content">${s.content}</div>
                                                    <div class="suggestion-footer">
                                                        <span class="suggestion-user">by ${s.userId}</span>
                                                        <div class="suggestion-votes">
                                                            <button onclick="vote('${s.id}', 'up')">👍 ${s.votes}</button>
                                                            <button onclick="vote('${s.id}', 'down')">👎</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            `).join('') : 
                                            '<div class="no-suggestions">No solutions yet. Be the first to help solve this problem!</div>'
                                        }
                                        <div class="add-suggestion">
                                            <textarea id="suggestion-${problem.id}" placeholder="Share your solution..." rows="3"></textarea>
                                            <button onclick="addSuggestion('${problem.id}')">💡 Add Solution</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') :
                    `<div class="empty-state">
                        <div class="empty-icon">🤔</div>
                        <h3>No Problems Yet</h3>
                        <p>Be the first to share a coding problem with the community!</p>
                    </div>`
                }
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }
                
                function clearFeed() {
                    vscode.postMessage({ command: 'clearFeed' });
                }
                
                // Auto-scroll functionality
                const problemsContainer = document.querySelector('.problems-container');
                if (problemsContainer && problemsContainer.children.length > 0) {
                    problemsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                // Suggestion functions
                function toggleSuggestions(problemId) {
                    const container = document.getElementById('suggestions-' + problemId);
                    const button = event.target;
                    
                    if (container.style.display === 'none') {
                        container.style.display = 'block';
                        button.textContent = 'Hide';
                    } else {
                        container.style.display = 'none';
                        button.textContent = 'Show';
                    }
                }
                
                function addSuggestion(problemId) {
                    const textarea = document.getElementById('suggestion-' + problemId);
                    const content = textarea.value.trim();
                    
                    if (!content) {
                        alert('Please enter a suggestion');
                        return;
                    }
                    
                    // Get user ID from stored session or generate one
                    let userId = sessionStorage.getItem('conaint-userId');
                    if (!userId) {
                        userId = prompt('Enter your User ID (e.g., matric number):');
                        if (!userId) {
                            alert('User ID is required to add suggestions');
                            return;
                        }
                        sessionStorage.setItem('conaint-userId', userId);
                    }
                    
                    vscode.postMessage({
                        command: 'addSuggestion',
                        problemId: problemId,
                        content: content,
                        userId: userId
                    });
                    
                    textarea.value = '';
                }
                
                function vote(suggestionId, voteType) {
                    vscode.postMessage({
                        command: 'voteSuggestion',
                        suggestionId: suggestionId,
                        vote: voteType
                    });
                }
            </script>
        </body>
        </html>`;
    }
}