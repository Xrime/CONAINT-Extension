import * as vscode from 'vscode';
import { Manager } from '../manager';

export class MainDashboard {
    public static currentPanel: MainDashboard | undefined;
    public static readonly viewType = 'conaint.mainDashboard';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private manager: Manager;
    private updateInterval: NodeJS.Timeout | null = null;

    public static createOrShow(extensionUri: vscode.Uri, manager: Manager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (MainDashboard.currentPanel) {
            MainDashboard.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            MainDashboard.viewType,
            'CONAINT Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        MainDashboard.currentPanel = new MainDashboard(panel, extensionUri, manager);
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
            case 'connect':
                try {
                    await this.manager.connect(message.url);
                    this._update();
                } catch (error) {
                    vscode.window.showErrorMessage('Failed to connect: ' + (error as Error).message);
                }
                break;
            case 'disconnect':
                this.manager.disconnect();
                this._update();
                break;
            case 'refresh':
                this._update();
                break;
            case 'openPanel':
                vscode.commands.executeCommand(message.panelCommand);
                break;
            case 'startInspector':
                try {
                    await this.manager.startInspectorMode();
                    this._update();
                } catch (error) {
                    vscode.window.showWarningMessage('Inspector mode start cancelled');
                }
                break;
            case 'joinSession':
                await this.manager.joinInspectorSession(message.sessionId);
                this._update();
                break;
            case 'joinSessionWithCredentials':
                if (message.userId && message.sessionId) {
                    this.manager.joinSession(message.sessionId.trim(), message.userId.trim());
                    this._update();
                } else {
                    vscode.window.showWarningMessage('Please provide both User ID and Session ID');
                }
                break;
            case 'leaveSession':
                await this.manager.leaveInspectorSession();
                this._update();
                break;
            case 'savePanelPreferences':
                await this.savePanelPreferences(message.preferences);
                break;
            case 'loadPanelPreferences':
                await this.loadPanelPreferences();
                break;
            case 'showMessage':
                vscode.window.showInformationMessage(message.message);
                break;
        }
    }

    private async savePanelPreferences(preferences: any) {
        const storage = this.manager.getStorage();
        await storage['context'].globalState.update('conaint.dashboard.preferences', preferences);
        vscode.window.showInformationMessage('Panel preferences saved!');
    }

    private async loadPanelPreferences() {
        const storage = this.manager.getStorage();
        const preferences = storage['context'].globalState.get('conaint.dashboard.preferences', null);
        
        if (preferences) {
            // Send preferences back to webview
            this._panel.webview.postMessage({
                command: 'applyPreferences',
                preferences: preferences
            });
        }
    }

    private startAutoUpdate() {
        // Check connection status every 5 seconds
        this.updateInterval = setInterval(() => {
            this._updateConnectionStatus();
        }, 5000);
    }

    private stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    private _updateConnectionStatus() {
        const connectionStatus = this.manager.getConnectionStatus();
        this._panel.webview.postMessage({
            command: 'updateConnectionStatus',
            connected: connectionStatus.connected
        });
    }

    public dispose() {
        MainDashboard.currentPanel = undefined;
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
        this._panel.title = 'CONAINT Dashboard';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const connectionStatus = this.manager.getConnectionStatus();
        const userId = this.manager.getUserId();
        const sessionId = this.manager.getSessionId();
        const storage = this.manager.getStorage();
        
        const problems = await storage.getProblems();
        const users = await storage.getUsers();
        const telemetryData = await storage.getTelemetryData(10);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CONAINT Dashboard</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 0;
                    margin: 0;
                    line-height: 1.6;
                }
                
                .header {
                    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
                    padding: 30px;
                    text-align: center;
                    color: white;
                    margin-bottom: 0;
                    position: relative;
                }
                
                .logo-section h1 {
                    margin: 0;
                    font-size: 2.2em;
                    font-weight: 300;
                    letter-spacing: 1px;
                }
                
                .subtitle {
                    margin: 8px 0 0 0;
                    opacity: 0.9;
                    font-size: 1em;
                    font-weight: 300;
                }
                
                .status {
                    position: absolute;
                    top: 20px;
                    right: 30px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 0.9em;
                }
                
                .status-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    display: inline-block;
                }
                
                .connected {
                    background-color: #4caf50;
                }
                
                .disconnected {
                    background-color: #f44336;
                }
                

                
                .main-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 30px;
                    padding: 40px;
                    max-width: 1400px;
                    margin: 0 auto;
                }
                
                .panel-card {
                    background-color: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 12px;
                    padding: 0;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    position: relative;
                    min-height: 180px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                
                .panel-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
                    border-color: #007acc;
                }
                
                .panel-icon {
                    font-size: 3em;
                    text-align: center;
                    padding: 25px 0 15px 0;
                    background: linear-gradient(135deg, var(--vscode-sideBar-background) 0%, var(--vscode-editor-background) 100%);
                }
                
                .panel-content {
                    padding: 0 25px 25px 25px;
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                }
                
                .panel-content h3 {
                    margin: 0 0 10px 0;
                    color: var(--vscode-textLink-foreground);
                    font-size: 1.2em;
                    font-weight: 600;
                }
                
                .panel-content p {
                    margin: 0 0 20px 0;
                    font-size: 0.9em;
                    opacity: 0.8;
                    flex-grow: 1;
                    line-height: 1.5;
                }
                
                .panel-btn {
                    background: linear-gradient(135deg, #007acc 0%, #005a9e 100%);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 10px 16px;
                    font-size: 0.9em;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    align-self: flex-start;
                }
                
                .panel-btn:hover {
                    background: linear-gradient(135deg, #005a9e 0%, #007acc 100%);
                    transform: translateY(-1px);
                }
                
                .inspector-features {
                    background-color: var(--vscode-sideBar-background);
                    border-top: 1px solid var(--vscode-panel-border);
                    padding: 30px 40px;
                    margin-top: 20px;
                }
                
                .inspector-features h3 {
                    color: var(--vscode-textLink-foreground);
                    margin: 0 0 20px 0;
                    font-size: 1.3em;
                    text-align: center;
                }
                
                .feature-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    max-width: 1000px;
                    margin: 0 auto;
                }
                
                .feature-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    transition: all 0.2s ease;
                }
                
                .feature-item:hover {
                    border-color: var(--vscode-textLink-foreground);
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .feature-icon {
                    font-size: 1.2em;
                    min-width: 20px;
                }
                
                .feature-label {
                    font-size: 0.9em;
                    font-weight: 500;
                }
                
                .join-session-card {
                    cursor: default !important;
                }
                
                .join-form {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .join-input {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 8px 12px;
                    font-size: 0.9em;
                    width: 100%;
                    box-sizing: border-box;
                }
                
                .join-input:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                
                .join-input::placeholder {
                    color: var(--vscode-input-placeholderForeground);
                }
                
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 14px;
                    margin-right: 10px;
                    margin-bottom: 10px;
                }
                
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                button:disabled {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    cursor: not-allowed;
                }
                
                input, select {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 6px 10px;
                    font-size: 14px;
                    margin-right: 10px;
                    margin-bottom: 10px;
                    min-width: 200px;
                }
                

                
                .section {
                    margin-bottom: 30px;
                }
                
                .section h2 {
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 15px;
                }
                
                .inspector-section {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                
                .session-info {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 4px solid var(--vscode-textLink-foreground);
                    padding: 10px 15px;
                    margin: 10px 0;
                    border-radius: 0 4px 4px 0;
                }
                
                .alert {
                    padding: 10px 15px;
                    border-radius: 4px;
                    margin: 10px 0;
                }
                
                .alert-info {
                    background-color: rgba(33, 150, 243, 0.1);
                    border: 1px solid rgba(33, 150, 243, 0.3);
                    color: var(--vscode-textLink-foreground);
                }
                
                .alert-warning {
                    background-color: rgba(255, 193, 7, 0.1);
                    border: 1px solid rgba(255, 193, 7, 0.3);
                    color: #ff9800;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo-section">
                    <h1>� CONAINT Dashboard</h1>
                    <p class="subtitle">Real-time collaboration and activity monitoring for VS Code</p>
                </div>
                <div class="status connection-status">
                    <span class="status-indicator ${connectionStatus.connected ? 'connected' : 'disconnected'}"></span>
                    <span class="connection-text">${connectionStatus.connected ? 'Connected to server' : 'Disconnected'}</span>
                </div>
            </div>

            <div class="main-grid">
                <!-- First Row -->
                <div class="panel-card" onclick="openPanel('manager.submitProblem')">
                    <div class="panel-icon">❓</div>
                    <div class="panel-content">
                        <h3>Submit Problem</h3>
                        <p>Share coding problems with the community and get help from others</p>
                        <button class="panel-btn">Create Problem</button>
                    </div>
                </div>

                <div class="panel-card" onclick="openPanel('manager.openLiveFeed')">
                    <div class="panel-icon">🔔</div>
                    <div class="panel-content">
                        <h3>Live Feed</h3>
                        <p>View and respond to problems from all users in real time</p>
                        <button class="panel-btn">Open Feed</button>
                    </div>
                </div>

                <div class="panel-card" onclick="openPanel('manager.startInspector')">
                    <div class="panel-icon">⏺️</div>
                    <div class="panel-content">
                        <h3>Start Inspector</h3>
                        <p>Monitor user activity and create inspection sessions</p>
                        <button class="panel-btn">Start Monitoring</button>
                    </div>
                </div>

                <div class="panel-card" onclick="openPanel('manager.testInspector')">
                    <div class="panel-icon">🎯</div>
                    <div class="panel-content">
                        <h3>Test Inspector</h3>
                        <p>Demo mode with sample data for testing features</p>
                        <button class="panel-btn">Test Mode</button>
                    </div>
                </div>

                <div class="panel-card join-session-card">
                    <div class="panel-icon">🔗</div>
                    <div class="panel-content">
                        <h3>Join Session</h3>
                        <p>Join an existing inspector session with your credentials</p>
                        <div class="join-form">
                            <input type="text" id="joinUserId" placeholder="Enter your User ID" class="join-input">
                            <input type="text" id="joinSessionId" placeholder="Enter Session ID" class="join-input">
                            <button class="panel-btn" onclick="joinSessionWithCredentials()">Join Session</button>
                        </div>
                    </div>
                </div>

                <!-- Second Row -->
                <div class="panel-card" onclick="openPanel('manager.openLeaderboard')">
                    <div class="panel-icon">🏆</div>
                    <div class="panel-content">
                        <h3>Leaderboard</h3>
                        <p>View contribution rankings and community statistics</p>
                        <button class="panel-btn">View Rankings</button>
                    </div>
                </div>

                <div class="panel-card" onclick="openPanel('manager.openAiAnalysis')">
                    <div class="panel-icon">🤖</div>
                    <div class="panel-content">
                        <h3>CONAINT AI</h3>
                        <p>Advanced AI-powered analysis to detect academic integrity violations and suspicious patterns</p>
                        <button class="panel-btn">Open CONAINT AI</button>
                    </div>
                </div>

                <div class="panel-card" onclick="openPanel('manager.loadCommunityProblems')">
                    <div class="panel-icon">🌍</div>
                    <div class="panel-content">
                        <h3>Load Community Problems</h3>
                        <p>View recent problems and solutions shared by the global CONAINT community</p>
                        <button class="panel-btn">Load Global Feed</button>
                    </div>
                </div>
            </div>

            <div class="inspector-features">
                <h3>🔍 Inspector Mode Features</h3>
                <div class="feature-grid">
                    <div class="feature-item">
                        <span class="feature-icon">📊</span>
                        <span class="feature-label">Keystroke Monitoring</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">📋</span>
                        <span class="feature-label">Paste Detection</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">📁</span>
                        <span class="feature-label">File Activity Tracking</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">👁️</span>
                        <span class="feature-label">Live Code Preview</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">⚠️</span>
                        <span class="feature-label">Suspicious Activity Detection</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">📖</span>
                        <span class="feature-label">Human-Readable Logs</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">🚩</span>
                        <span class="feature-label">User Flagging System</span>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function connect() {
                    const url = document.getElementById('serverUrl').value;
                    if (url) {
                        vscode.postMessage({
                            command: 'connect',
                            url: url
                        });
                    }
                }
                
                function disconnect() {
                    vscode.postMessage({
                        command: 'disconnect'
                    });
                }
                
                function refresh() {
                    vscode.postMessage({
                        command: 'refresh'
                    });
                }
                
                function openPanel(panelCommand) {
                    vscode.postMessage({
                        command: 'openPanel',
                        panelCommand: panelCommand
                    });
                }
                
                // Simple refresh functionality
                function refreshDashboard() {
                    vscode.postMessage({
                        command: 'refresh'
                    });
                }
                
                // Join session with user ID and session ID
                function joinSessionWithCredentials() {
                    const userId = document.getElementById('joinUserId').value.trim();
                    const sessionId = document.getElementById('joinSessionId').value.trim();
                    
                    if (!userId) {
                        alert('Please enter your User ID');
                        return;
                    }
                    
                    if (!sessionId) {
                        alert('Please enter Session ID');
                        return;
                    }
                    
                    vscode.postMessage({
                        command: 'joinSessionWithCredentials',
                        userId: userId,
                        sessionId: sessionId
                    });
                }

                // Listen for connection status updates from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateConnectionStatus') {
                        const statusElement = document.querySelector('.connection-status .connection-text');
                        const indicatorElement = document.querySelector('.status-indicator');
                        
                        if (statusElement && indicatorElement) {
                            if (message.connected) {
                                statusElement.textContent = 'Connected to server';
                                indicatorElement.className = 'status-indicator connected';
                            } else {
                                statusElement.textContent = 'Disconnected';
                                indicatorElement.className = 'status-indicator disconnected';
                            }
                        }
                    }
                });

            </script>
        </body>
        </html>`;
    }
}