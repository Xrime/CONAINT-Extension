import * as vscode from 'vscode';
import { Manager } from '../manager';

export class TestInspectorPanel {
    public static currentPanel: TestInspectorPanel | undefined;
    public static readonly viewType = 'conaint.testInspectorPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private manager: Manager;
    private demoInterval: NodeJS.Timeout | null = null;
    private demoRunning = false;

    public static createOrShow(extensionUri: vscode.Uri, manager: Manager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (TestInspectorPanel.currentPanel) {
            TestInspectorPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            TestInspectorPanel.viewType,
            'Test Inspector - CONAINT',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        TestInspectorPanel.currentPanel = new TestInspectorPanel(panel, extensionUri, manager);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, manager: Manager) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.manager = manager;

        this._update();

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
            case 'startDemo':
                await this.startDemo();
                break;
            case 'stopDemo':
                this.stopDemo();
                break;
            case 'generateFakeData':
                await this.generateFakeData();
                break;
            case 'clearTestData':
                await this.clearTestData();
                break;
            case 'refresh':
                this._update();
                break;
        }
    }

    private async startDemo() {
        if (this.demoRunning) {
            return;
        }

        this.demoRunning = true;
        vscode.window.showInformationMessage('Demo mode started - generating fake telemetry data');

        this.demoInterval = setInterval(async () => {
            await this.generateFakeTelemetry();
        }, 2000); // Generate data every 2 seconds

        this._update();
    }

    private stopDemo() {
        if (this.demoInterval) {
            clearInterval(this.demoInterval);
            this.demoInterval = null;
        }
        this.demoRunning = false;
        vscode.window.showInformationMessage('Demo mode stopped');
        this._update();
    }

    private async generateFakeTelemetry() {
        const storage = this.manager.getStorage();
        const telemetryTypes = ['keystroke', 'mouse', 'clipboard', 'file_change', 'selection'];
        const fakeUsers = ['student_001', 'student_002', 'student_003', 'student_004'];
        
        const randomType = telemetryTypes[Math.floor(Math.random() * telemetryTypes.length)];
        const randomUser = fakeUsers[Math.floor(Math.random() * fakeUsers.length)];
        
        const fakeTelemetry = {
            id: 'demo_' + Date.now().toString(),
            userId: randomUser,
            sessionId: 'demo_session_' + Date.now().toString(36),
            timestamp: Date.now(),
            type: randomType as any,
            data: this.generateFakeDataForType(randomType)
        };

        await storage.saveTelemetryData(fakeTelemetry);
    }

    private generateFakeDataForType(type: string): any {
        switch (type) {
            case 'keystroke':
                const sampleTexts = [
                    'function calculateSum(a, b) { return a + b; }',
                    'console.log("Hello World");',
                    'const result = Math.random() * 100;',
                    'if (condition) { doSomething(); }',
                    'for (let i = 0; i < 10; i++) { }'
                ];
                return {
                    document: 'file:///Users/student/project/main.js',
                    changes: [{
                        text: sampleTexts[Math.floor(Math.random() * sampleTexts.length)],
                        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 20 } }
                    }]
                };
            
            case 'mouse':
                return {
                    x: Math.floor(Math.random() * 1920),
                    y: Math.floor(Math.random() * 1080),
                    button: Math.random() > 0.5 ? 'left' : 'right',
                    action: Math.random() > 0.5 ? 'click' : 'move'
                };
            
            case 'clipboard':
                const clipboardTexts = [
                    'const api = "https://api.example.com";',
                    'npm install express',
                    'git commit -m "Fix bug"',
                    'SELECT * FROM users WHERE active = 1;'
                ];
                return {
                    content: clipboardTexts[Math.floor(Math.random() * clipboardTexts.length)],
                    action: Math.random() > 0.5 ? 'copy' : 'paste'
                };
            
            case 'file_change':
                const files = [
                    'main.js', 'utils.ts', 'component.jsx', 'styles.css', 'README.md'
                ];
                return {
                    file: files[Math.floor(Math.random() * files.length)],
                    action: Math.random() > 0.5 ? 'open' : 'save',
                    language: 'javascript'
                };
            
            case 'selection':
                return {
                    document: 'file:///Users/student/project/main.js',
                    selections: [{
                        start: { line: Math.floor(Math.random() * 50), character: 0 },
                        end: { line: Math.floor(Math.random() * 50), character: 20 },
                        text: 'selectedText'
                    }]
                };
            
            default:
                return { type: 'unknown', data: 'test data' };
        }
    }

    private async generateFakeData() {
        const storage = this.manager.getStorage();
        
        // Generate fake users
        const fakeUsers = [
            {
                id: 'student_001',
                name: 'Alice Johnson',
                role: 'student' as const,
                sessionId: 'session_001',
                lastActivity: Date.now() - Math.random() * 300000,
                stats: { problemsSubmitted: 3, suggestionsProvided: 7, score: 52 }
            },
            {
                id: 'student_002',
                name: 'Bob Smith',
                role: 'student' as const,
                sessionId: 'session_002',
                lastActivity: Date.now() - Math.random() * 300000,
                stats: { problemsSubmitted: 1, suggestionsProvided: 4, score: 25 }
            },
            {
                id: 'student_003',
                name: 'Carol Davis',
                role: 'student' as const,
                sessionId: 'session_003',
                lastActivity: Date.now() - Math.random() * 300000,
                stats: { problemsSubmitted: 5, suggestionsProvided: 2, score: 60 }
            },
            {
                id: 'instructor_001',
                name: 'Dr. Wilson',
                role: 'instructor' as const,
                sessionId: 'session_instructor',
                lastActivity: Date.now() - Math.random() * 300000,
                stats: { problemsSubmitted: 10, suggestionsProvided: 15, score: 175 }
            }
        ];

        for (const user of fakeUsers) {
            await storage.saveUser(user);
        }

        // Generate fake problems
        const fakeProblems = [
            {
                id: 'problem_001',
                title: 'Implement Binary Search',
                description: 'Create a function that performs binary search on a sorted array.',
                difficulty: 'Medium' as const,
                tags: ['algorithm', 'search', 'arrays'],
                userId: 'instructor_001',
                timestamp: Date.now() - 86400000,
                status: 'active' as const
            },
            {
                id: 'problem_002', 
                title: 'Debug Memory Leak',
                description: 'Find and fix the memory leak in the provided Node.js application.',
                difficulty: 'Hard' as const,
                tags: ['debugging', 'nodejs', 'memory'],
                userId: 'student_001',
                timestamp: Date.now() - 43200000,
                status: 'active' as const
            }
        ];

        for (const problem of fakeProblems) {
            await storage.saveProblem(problem);
        }

        // Generate fake suggestions
        const fakeSuggestions = [
            {
                id: 'suggestion_001',
                problemId: 'problem_001',
                content: 'Consider using recursion for a cleaner implementation.',
                userId: 'student_002',
                timestamp: Date.now() - 21600000,
                votes: 3,
                status: 'accepted' as const
            },
            {
                id: 'suggestion_002',
                problemId: 'problem_001',
                content: 'Add edge case handling for empty arrays.',
                userId: 'student_003',
                timestamp: Date.now() - 10800000,
                votes: 1,
                status: 'pending' as const
            }
        ];

        for (const suggestion of fakeSuggestions) {
            await storage.saveSuggestion(suggestion);
        }

        vscode.window.showInformationMessage('Fake test data generated successfully!');
        this._update();
    }

    private async clearTestData() {
        await this.manager.getStorage().clearAllData();
        vscode.window.showInformationMessage('All test data cleared');
        this._update();
    }

    public dispose() {
        TestInspectorPanel.currentPanel = undefined;
        this.stopDemo();

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
        this._panel.title = 'Test Inspector - CONAINT';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const storage = this.manager.getStorage();
        const problems = await storage.getProblems();
        const suggestions = await storage.getSuggestions();
        const users = await storage.getUsers();
        const telemetryData = await storage.getTelemetryData(10);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Test Inspector - CONAINT</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 20px;
                    line-height: 1.6;
                }
                
                .header {
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .demo-controls {
                    background-color: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                
                .controls {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                    flex-wrap: wrap;
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
                
                button:disabled {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    cursor: not-allowed;
                }
                
                .demo-status {
                    padding: 10px 15px;
                    border-radius: 4px;
                    margin-bottom: 15px;
                }
                
                .demo-active {
                    background-color: rgba(76, 175, 80, 0.1);
                    border: 1px solid rgba(76, 175, 80, 0.3);
                    color: #4caf50;
                }
                
                .demo-inactive {
                    background-color: rgba(158, 158, 158, 0.1);
                    border: 1px solid rgba(158, 158, 158, 0.3);
                    color: #9e9e9e;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }
                
                .stat-card {
                    background-color: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 15px;
                    text-align: center;
                }
                
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 5px;
                }
                
                .stat-label {
                    font-size: 12px;
                    opacity: 0.7;
                }
                
                .section {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                
                .section h3 {
                    margin: 0 0 15px 0;
                    color: var(--vscode-textLink-foreground);
                }
                
                .data-list {
                    max-height: 300px;
                    overflow-y: auto;
                }
                
                .data-item {
                    background-color: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 10px 15px;
                    margin-bottom: 10px;
                }
                
                .data-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 5px;
                }
                
                .data-title {
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                
                .data-timestamp {
                    font-size: 12px;
                    opacity: 0.6;
                }
                
                .data-content {
                    font-size: 14px;
                    white-space: pre-wrap;
                    max-height: 100px;
                    overflow-y: auto;
                }
                
                .telemetry-item {
                    border-left: 4px solid var(--vscode-textLink-foreground);
                }
                
                .telemetry-item.keystroke {
                    border-left-color: #4caf50;
                }
                
                .telemetry-item.mouse {
                    border-left-color: #2196f3;
                }
                
                .telemetry-item.clipboard {
                    border-left-color: #ff9800;
                }
                
                .telemetry-item.file_change {
                    border-left-color: #9c27b0;
                }
                
                .telemetry-item.selection {
                    border-left-color: #607d8b;
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
                
                .empty-state {
                    text-align: center;
                    padding: 40px 20px;
                    opacity: 0.6;
                }
                
                .pulse {
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🧪 Test Inspector</h1>
                <p>Demo environment for testing CONAINT features with simulated data</p>
            </div>

            <div class="demo-controls">
                <h3>Demo Controls</h3>
                
                <div class="demo-status ${this.demoRunning ? 'demo-active' : 'demo-inactive'}">
                    ${this.demoRunning ? 
                        '🟢 Demo Mode Active - Generating fake telemetry data every 2 seconds' :
                        '🔴 Demo Mode Inactive - No automatic data generation'}
                </div>

                <div class="controls">
                    <button onclick="startDemo()" ${this.demoRunning ? 'disabled' : ''}>Start Demo</button>
                    <button onclick="stopDemo()" ${!this.demoRunning ? 'disabled' : ''}>Stop Demo</button>
                    <button onclick="generateFakeData()">Generate Sample Data</button>
                    <button onclick="clearTestData()">Clear All Data</button>
                    <button onclick="refresh()">Refresh</button>
                </div>

                <div class="alert alert-info">
                    <strong>Note:</strong> This panel is for testing and demonstration purposes. 
                    Use it to simulate student activity and test the inspector functionality without real users.
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${problems.length}</div>
                    <div class="stat-label">TEST PROBLEMS</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${suggestions.length}</div>
                    <div class="stat-label">TEST SUGGESTIONS</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${users.length}</div>
                    <div class="stat-label">TEST USERS</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${telemetryData.length}</div>
                    <div class="stat-label">TELEMETRY EVENTS</div>
                </div>
            </div>

            <div class="section">
                <h3>Recent Test Telemetry ${this.demoRunning ? '<span class="pulse">●</span>' : ''}</h3>
                <div class="data-list">
                    ${telemetryData.length > 0 ? 
                        telemetryData.slice().reverse().map(item => `
                            <div class="data-item telemetry-item ${item.type}">
                                <div class="data-header">
                                    <div class="data-title">${item.type.toUpperCase()} - ${item.userId}</div>
                                    <div class="data-timestamp">${new Date(item.timestamp).toLocaleTimeString()}</div>
                                </div>
                                <div class="data-content">${JSON.stringify(item.data, null, 2)}</div>
                            </div>
                        `).join('') :
                        '<div class="empty-state">No telemetry data. Start demo mode or generate sample data.</div>'
                    }
                </div>
            </div>

            <div class="section">
                <h3>Test Users</h3>
                <div class="data-list">
                    ${users.length > 0 ? 
                        users.map(user => `
                            <div class="data-item">
                                <div class="data-header">
                                    <div class="data-title">${user.name} (${user.role})</div>
                                    <div class="data-timestamp">Score: ${user.stats.score}</div>
                                </div>
                                <div class="data-content">
                                    Problems: ${user.stats.problemsSubmitted} | 
                                    Suggestions: ${user.stats.suggestionsProvided} |
                                    Last Active: ${new Date(user.lastActivity).toLocaleString()}
                                </div>
                            </div>
                        `).join('') :
                        '<div class="empty-state">No test users. Generate sample data to create test users.</div>'
                    }
                </div>
            </div>

            <div class="section">
                <h3>Test Problems</h3>
                <div class="data-list">
                    ${problems.length > 0 ? 
                        problems.map(problem => `
                            <div class="data-item">
                                <div class="data-header">
                                    <div class="data-title">${problem.title}</div>
                                    <div class="data-timestamp">${problem.difficulty} - ${problem.status}</div>
                                </div>
                                <div class="data-content">${problem.description}</div>
                            </div>
                        `).join('') :
                        '<div class="empty-state">No test problems. Generate sample data to create test problems.</div>'
                    }
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function startDemo() {
                    vscode.postMessage({ command: 'startDemo' });
                }
                
                function stopDemo() {
                    vscode.postMessage({ command: 'stopDemo' });
                }
                
                function generateFakeData() {
                    vscode.postMessage({ command: 'generateFakeData' });
                }
                
                function clearTestData() {
                    if (confirm('Are you sure you want to clear all test data? This cannot be undone.')) {
                        vscode.postMessage({ command: 'clearTestData' });
                    }
                }
                
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }
            </script>
        </body>
        </html>`;
    }
}