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
exports.JoinInspectorPanel = void 0;
const vscode = __importStar(require("vscode"));
class JoinInspectorPanel {
    manager;
    static currentPanel;
    static viewType = 'conaint.joinInspectorPanel';
    _panel;
    _extensionUri;
    _disposables = [];
    static createOrShow(extensionUri, manager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (JoinInspectorPanel.currentPanel) {
            JoinInspectorPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(JoinInspectorPanel.viewType, 'Join Inspector Session', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'media'),
                vscode.Uri.joinPath(extensionUri, 'out')
            ]
        });
        JoinInspectorPanel.currentPanel = new JoinInspectorPanel(panel, extensionUri, manager);
    }
    constructor(panel, extensionUri, manager) {
        this.manager = manager;
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (message) => {
            await this._handleMessage(message);
        }, null, this._disposables);
    }
    async _handleMessage(message) {
        switch (message.command) {
            case 'joinInspector':
                // Following your architecture - use the new joinSession method
                this.manager.joinSession(message.sessionId, message.displayName);
                vscode.window.showInformationMessage(`Joined inspector session: ${message.sessionId} as ${message.displayName}`);
                // Refresh the panel to show the active session with user's displayName
                await this._update();
                break;
            case 'leaveSession':
                await this.manager.leaveInspectorSession();
                console.log(`📝 Student session ended`);
                vscode.window.showInformationMessage('Left inspector session');
                break;
            case 'checkConnection':
                const connectionStatus = this.manager.getConnectionStatus();
                this._panel.webview.postMessage({
                    command: 'connectionStatus',
                    connected: connectionStatus.connected,
                    url: connectionStatus.url,
                    error: connectionStatus.error
                });
                break;
        }
    }
    // Focus tracking methods removed - handled by main Manager class now
    async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }
    async _getHtmlForWebview(webview) {
        const currentSession = this.manager.getSessionId();
        const userId = this.manager.getUserId();
        const displayName = this.manager.getDisplayName();
        // Check for temporary stored credentials from dashboard
        const storage = this.manager.getStorage();
        const tempUserId = await storage['context'].globalState.get('conaint.temp.userId', '');
        const tempSessionId = await storage['context'].globalState.get('conaint.temp.sessionId', '');
        // Clear temporary credentials after reading
        if (tempUserId || tempSessionId) {
            await storage['context'].globalState.update('conaint.temp.userId', undefined);
            await storage['context'].globalState.update('conaint.temp.sessionId', undefined);
        }
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Join Inspector Session</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.6;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    padding: 20px;
                    margin: 0;
                }
                
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 20px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 8px;
                }
                
                .form-group {
                    margin-bottom: 20px;
                }
                
                label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: var(--vscode-input-foreground);
                }
                
                input[type="text"] {
                    width: 100%;
                    padding: 12px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                
                input[type="text"]:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                
                .btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    margin-right: 10px;
                    margin-bottom: 10px;
                    transition: opacity 0.2s;
                }
                
                .btn:hover {
                    opacity: 0.8;
                }
                
                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .btn-primary {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                
                .btn-danger {
                    background: #d73a49;
                    color: white;
                }
                
                .session-status {
                    padding: 15px;
                    border-radius: 6px;
                    margin-top: 20px;
                    text-align: center;
                }
                
                .session-active {
                    background: rgba(40, 167, 69, 0.1);
                    border: 1px solid rgba(40, 167, 69, 0.3);
                    color: #28a745;
                }
                
                .session-inactive {
                    background: rgba(108, 117, 125, 0.1);
                    border: 1px solid rgba(108, 117, 125, 0.3);
                    color: #6c757d;
                }
                
                .timer {
                    font-size: 18px;
                    font-weight: bold;
                    margin: 10px 0;
                }
                
                .instructions {
                    background: var(--vscode-textBlockQuote-background);
                    border-left: 4px solid var(--vscode-textBlockQuote-border);
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 0 4px 4px 0;
                }
                
                .warning {
                    background: rgba(255, 193, 7, 0.1);
                    border: 1px solid rgba(255, 193, 7, 0.3);
                    color: #856404;
                    padding: 15px;
                    border-radius: 4px;
                    margin: 20px 0;
                }
                
                .focus-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 10px 0;
                    padding: 8px;
                    border-radius: 4px;
                    background: rgba(40, 167, 69, 0.1);
                    border: 1px solid rgba(40, 167, 69, 0.3);
                }
                
                .focus-status.focus-lost {
                    background: rgba(220, 53, 69, 0.1);
                    border: 1px solid rgba(220, 53, 69, 0.3);
                }
                
                .focus-indicator {
                    font-size: 16px;
                }
                
                .focus-text {
                    font-weight: 600;
                }
                
                .server-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 15px 0;
                    padding: 10px;
                    border-radius: 4px;
                    background: rgba(255, 193, 7, 0.1);
                    border: 1px solid rgba(255, 193, 7, 0.3);
                }
                
                .server-status.connected {
                    background: rgba(40, 167, 69, 0.1);
                    border: 1px solid rgba(40, 167, 69, 0.3);
                }
                
                .server-status.disconnected {
                    background: rgba(220, 53, 69, 0.1);
                    border: 1px solid rgba(220, 53, 69, 0.3);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>� Join Inspector Session</h1>
                    <p>Enter your session details to join an academic integrity monitoring session</p>
                </div>
                
                ${!currentSession ? `
                <!-- Join Session Dialog (Following your architecture) -->
                <div class="join-dialog">
                    <div class="join-content">
                        <div class="form-group">
                            <label for="sessionIdInput">Session ID:</label>
                            <input type="text" id="sessionIdInput" placeholder="Enter session ID (e.g., abc123-def456-...)" value="${tempSessionId}">
                        </div>
                        <div class="form-group">
                            <label for="displayNameInput">Your Display Name:</label>
                            <input type="text" id="displayNameInput" placeholder="Enter your name" value="${tempUserId}">
                        </div>
                        <div class="form-actions">
                            <button class="btn btn-primary" onclick="joinSession()">Join Session</button>
                        </div>
                    </div>
                </div>
                
                <div class="instructions">
                    <h3>📋 Instructions:</h3>
                    <ul>
                        <li>Get the Session ID from your instructor</li>
                        <li>Enter your display name</li>
                        <li>Click "Join Session" to start monitoring</li>
                        <li>Focus tracking will be automatic and silent</li>
                    </ul>
                </div>
                
                <div class="warning">
                    <strong>⚠️ Important:</strong> Your activities will be monitored during this session. 
                    Focus changes will be tracked automatically.
                </div>
                ` : `
                <!-- Session Active (Simplified) -->
                <div class="session-status session-active">
                    <h3>✅ Session Active</h3>
                    <p><strong>Session:</strong> ${currentSession}</p>
                    <p><strong>Student:</strong> ${displayName || userId}</p>
                    <p><strong>Status:</strong> Monitoring active - focus tracking enabled</p>
                    <button onclick="leaveSession()" class="btn btn-danger">Leave Session</button>
                </div>
                
                <div class="warning">
                    <strong>🔍 Monitoring Active:</strong> Your VS Code activity is being tracked. 
                    Focus changes are monitored silently.
                </div>
                `}
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // Session joining logic (following your architecture)
                function joinSession() {
                    const sessionId = document.getElementById('sessionIdInput').value.trim();
                    const displayName = document.getElementById('displayNameInput').value.trim();
                    
                    // Validation
                    if (!sessionId || !displayName) {
                        alert('Please fill in both Session ID and Display Name');
                        return;
                    }
                    
                    // Send message to extension (following your protocol)
                    vscode.postMessage({ 
                        command: 'joinInspector', 
                        sessionId, 
                        displayName 
                    });
                }
                
                function leaveSession() {
                    vscode.postMessage({ command: 'leaveSession' });
                }
                    
                    if (!focusStatus || !focusIndicator || !focusText) return;
                    
                    // This is a simple check - VS Code API provides limited focus detection
                    // The actual focus detection happens in the extension backend
                    const isFocused = document.hasFocus();
                    
                    if (isFocused) {
                        focusStatus.classList.remove('focus-lost');
                        focusIndicator.textContent = '🟢';
                        focusText.textContent = 'VS Code Focused';
                    } else {
                        focusStatus.classList.add('focus-lost');
                        focusIndicator.textContent = '🔴';
                        focusText.textContent = 'Focus Lost - Return to VS Code!';
                    }
                }
                
                // Server connection check
                function checkServerConnection() {
                    const serverStatus = document.getElementById('serverStatus');
                    const serverIndicator = document.getElementById('serverIndicator');
                    const serverText = document.getElementById('serverText');
                    
                    if (!serverStatus || !serverIndicator || !serverText) return;
                    
                    vscode.postMessage({ command: 'checkConnection' });
                }

            </script>
        </body>
        </html>`;
    }
    dispose() {
        JoinInspectorPanel.currentPanel = undefined;
        // Focus tracking cleanup handled by main Manager class
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
exports.JoinInspectorPanel = JoinInspectorPanel;
//# sourceMappingURL=JoinInspectorPanel.js.map