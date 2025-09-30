// src/panels/MainDashboard.ts
import * as vscode from 'vscode';

export class MainDashboard {
  public static current: MainDashboard | undefined;
  public panel: vscode.WebviewPanel;

  constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this._html();
    this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
    this.panel.onDidDispose(() => { MainDashboard.current = undefined; });
    
    // Start connection health monitoring
    this.startConnectionHealthCheck();
  }

  public static create() {
    if (MainDashboard.current) { 
      MainDashboard.current.panel.reveal(); 
      return; 
    }
    const panel = vscode.window.createWebviewPanel(
      'mainDashboard', 
      'CONAINT Dashboard', 
      vscode.ViewColumn.One, 
      { 
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true
      }
    );
    MainDashboard.current = new MainDashboard(panel);
  }

  private handleMessage(message: any) {
    switch (message.command) {
      case 'submitProblem':
        vscode.commands.executeCommand('manager.submitProblem');
        break;
      case 'openLiveFeed':
        vscode.commands.executeCommand('manager.openLiveFeed');
        break;
      case 'startInspector':
        vscode.commands.executeCommand('manager.startInspector');
        break;
      case 'showJoinDialog':
        this.showJoinInspectorDialog();
        break;
      case 'joinInspector':
        this.joinInspectorSession(message.sessionId, message.displayName);
        break;
      case 'openLeaderboard':
        vscode.commands.executeCommand('manager.openLeaderboard');
        break;
      case 'testInspector':
        vscode.commands.executeCommand('manager.testInspector');
        break;
      case 'openAiAnalysis':
        vscode.commands.executeCommand('manager.openAiAnalysis');
        break;
    }
  }

  private showJoinInspectorDialog() {
    this.panel.webview.postMessage({ command: 'showJoinDialog' });
  }

  private joinInspectorSession(sessionId: string, displayName: string) {
    if (!sessionId || !displayName) {
      vscode.window.showErrorMessage('Please provide both Session ID and Display Name');
      return;
    }
    // Execute the join command with the provided data
    vscode.commands.executeCommand('manager._internal.joinInspector', { sessionId, displayName });
    vscode.window.showInformationMessage(`Joined inspector session: ${sessionId} as ${displayName}`);
  }

  public updateConnectionStatus(connected: boolean, sessionId?: string) {
    this.panel.webview.postMessage({ 
      command: 'updateStatus', 
      connected, 
      sessionId 
    });
  }

  // Periodically check connection status
  private startConnectionHealthCheck() {
    setInterval(() => {
      // Request connection status update from extension
      vscode.commands.executeCommand('manager._internal.checkConnection');
    }, 5000); // Check every 5 seconds
  }

  private _html() {
    return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        :root {
          --bg: var(--vscode-editor-background);
          --fg: var(--vscode-editor-foreground);
          --card: var(--vscode-editorWidget-background);
          --border: var(--vscode-editorWidget-border);
          --accent: var(--vscode-button-background);
          --accent-hover: var(--vscode-button-hoverBackground);
          --success: #4CAF50;
          --warning: #FF9800;
          --error: #f44336;
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          background: var(--bg);
          color: var(--fg);
          padding: 20px;
          line-height: 1.6;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid var(--border);
        }
        
        .header h1 {
          font-size: 2.5em;
          margin-bottom: 10px;
          background: linear-gradient(45deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .status-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--card);
          padding: 15px;
          border-radius: 10px;
          margin-bottom: 30px;
          border: 1px solid var(--border);
        }
        
        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--error);
          animation: pulse 2s infinite;
        }
        
        .status-dot.connected {
          background: var(--success);
        }
        
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        
        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 15px;
          padding: 25px;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        
        .card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          border-color: var(--accent);
        }
        
        .card-icon {
          font-size: 3em;
          margin-bottom: 15px;
          text-align: center;
        }
        
        .card h3 {
          margin-bottom: 10px;
          color: var(--accent);
        }
        
        .card p {
          color: var(--vscode-descriptionForeground);
          margin-bottom: 15px;
        }
        
        .btn {
          background: var(--accent);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 12px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.3s ease;
          width: 100%;
        }
        
        .btn:hover {
          background: var(--accent-hover);
        }
        
        .btn.secondary {
          background: transparent;
          border: 1px solid var(--accent);
          color: var(--accent);
        }
        
        .join-dialog {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          z-index: 1000;
        }
        
        .join-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--card);
          border-radius: 15px;
          padding: 30px;
          min-width: 400px;
          border: 1px solid var(--border);
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        
        .form-group input {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--fg);
          font-size: 14px;
        }
        
        .form-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        
        .inspector-features {
          background: var(--card);
          border-radius: 15px;
          padding: 20px;
          border: 1px solid var(--border);
          margin-top: 20px;
        }
        
        .feature-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-top: 15px;
        }
        
        .feature-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: var(--bg);
          border-radius: 8px;
        }
        
        .feature-item .icon {
          font-size: 1.2em;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🚀 CONAINT Dashboard</h1>
        <p>Real-time collaboration and activity monitoring for VS Code</p>
      </div>
      
      <div class="status-bar">
        <div class="status-indicator">
          <div class="status-dot" id="statusDot"></div>
          <span id="statusText">Connecting to server...</span>
        </div>
        <div id="sessionInfo" style="display: none;">
          <strong>Session:</strong> <span id="sessionId">-</span>
        </div>
      </div>
      
      <div class="grid">
        <div class="card" onclick="submitProblem()">
          <div class="card-icon">❓</div>
          <h3>Submit Problem</h3>
          <p>Share coding problems with the community and get help from others</p>
          <button class="btn">Create Problem</button>
        </div>
        
        <div class="card" onclick="openLiveFeed()">
          <div class="card-icon">📡</div>
          <h3>Live Feed</h3>
          <p>View and respond to problems from all users in real-time</p>
          <button class="btn">Open Feed</button>
        </div>
        
        <div class="card" onclick="startInspector()">
          <div class="card-icon">👁️</div>
          <h3>Start Inspector</h3>
          <p>Monitor user activity and create inspection sessions</p>
          <button class="btn">Start Monitoring</button>
        </div>
        
        <div class="card" onclick="testInspector()">
          <div class="card-icon">🧪</div>
          <h3>Test Inspector</h3>
          <p>Demo mode with sample data for testing features</p>
          <button class="btn secondary">Test Mode</button>
        </div>
        
        <div class="card" onclick="showJoinDialog()">
          <div class="card-icon">🔗</div>
          <h3>Join Session</h3>
          <p>Join an existing inspector session with a session ID</p>
          <button class="btn secondary">Join Session</button>
        </div>
        
        <div class="card" onclick="openLeaderboard()">
          <div class="card-icon">🏆</div>
          <h3>Leaderboard</h3>
          <p>View contribution rankings and community statistics</p>
          <button class="btn">View Rankings</button>
        </div>
        
        <div class="card" onclick="openAiAnalysis()">
          <div class="card-icon">🤖</div>
          <h3>CONAINT AI</h3>
          <p>Advanced AI-powered analysis to detect academic integrity violations and suspicious patterns</p>
          <button class="btn">Open CONAINT AI</button>
        </div>
      </div>
      
      <div class="inspector-features">
        <h3>🔍 Inspector Mode Features</h3>
        <div class="feature-list">
          <div class="feature-item">
            <span class="icon">⌨️</span>
            <span>Keystroke Monitoring</span>
          </div>
          <div class="feature-item">
            <span class="icon">📋</span>
            <span>Paste Detection</span>
          </div>
          <div class="feature-item">
            <span class="icon">📁</span>
            <span>File Activity Tracking</span>
          </div>
          <div class="feature-item">
            <span class="icon">👀</span>
            <span>Live Code Preview</span>
          </div>
          <div class="feature-item">
            <span class="icon">⚠️</span>
            <span>Suspicious Activity Detection</span>
          </div>
          <div class="feature-item">
            <span class="icon">📊</span>
            <span>Human-Readable Logs</span>
          </div>
          <div class="feature-item">
            <span class="icon">🚩</span>
            <span>User Flagging System</span>
          </div>
          <div class="feature-item">
            <span class="icon">💾</span>
            <span>Session Export</span>
          </div>
        </div>
      </div>
      
      <!-- Join Inspector Dialog -->
      <div class="join-dialog" id="joinDialog">
        <div class="join-content">
          <h3>Join Inspector Session</h3>
          <div class="form-group">
            <label for="sessionIdInput">Session ID:</label>
            <input type="text" id="sessionIdInput" placeholder="Enter session ID (e.g., abc123-def456-...)">
          </div>
          <div class="form-group">
            <label for="displayNameInput">Your Display Name:</label>
            <input type="text" id="displayNameInput" placeholder="Enter your name">
          </div>
          <div class="form-actions">
            <button class="btn secondary" onclick="closeJoinDialog()">Cancel</button>
            <button class="btn" onclick="joinSession()">Join Session</button>
          </div>
        </div>
      </div>
      
      <script>
        const vscode = acquireVsCodeApi();
        
        function submitProblem() {
          vscode.postMessage({ command: 'submitProblem' });
        }
        
        function openLiveFeed() {
          vscode.postMessage({ command: 'openLiveFeed' });
        }
        
        function startInspector() {
          vscode.postMessage({ command: 'startInspector' });
        }
        
        function showJoinDialog() {
          document.getElementById('joinDialog').style.display = 'block';
        }
        
        function closeJoinDialog() {
          document.getElementById('joinDialog').style.display = 'none';
        }
        
        function joinSession() {
          const sessionId = document.getElementById('sessionIdInput').value.trim();
          const displayName = document.getElementById('displayNameInput').value.trim();
          
          if (!sessionId || !displayName) {
            alert('Please fill in both Session ID and Display Name');
            return;
          }
          
          vscode.postMessage({ 
            command: 'joinInspector', 
            sessionId, 
            displayName 
          });
          closeJoinDialog();
        }
        
        function openLeaderboard() {
          vscode.postMessage({ command: 'openLeaderboard' });
        }
        
        function openAiAnalysis() {
          vscode.postMessage({ command: 'openAiAnalysis' });
        }
        
        function testInspector() {
          vscode.postMessage({ command: 'testInspector' });
        }
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
          const message = event.data;
          
          if (message.command === 'updateStatus') {
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            const sessionInfo = document.getElementById('sessionInfo');
            const sessionId = document.getElementById('sessionId');
            
            if (message.connected) {
              statusDot.classList.add('connected');
              statusText.textContent = 'Connected to server';
              
              if (message.sessionId) {
                sessionInfo.style.display = 'block';
                sessionId.textContent = message.sessionId;
              }
            } else {
              statusDot.classList.remove('connected');
              statusText.textContent = 'Disconnected from server';
              sessionInfo.style.display = 'none';
            }
          }
        });
        
        // Close dialog when clicking outside
        document.getElementById('joinDialog').addEventListener('click', function(e) {
          if (e.target === this) {
            closeJoinDialog();
          }
        });
      </script>
    </body>
    </html>`;
  }
}