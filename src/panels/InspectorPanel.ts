// src/panels/InspectorPanel.ts - COMPLETELY REWRITTEN FOR RELIABILITY
import * as vscode from 'vscode';

interface UserTile {
  userId: string;
  displayName?: string;
  elId: string;
  lastSeen: number;
  events: any[];
}

export class InspectorPanel {
  public static current: InspectorPanel | undefined;
  public static demoInstance: InspectorPanel | undefined;
  public panel: vscode.WebviewPanel;
  private users: Map<string, UserTile> = new Map();
  private isDemoMode: boolean = false;

  constructor(panel: vscode.WebviewPanel, demoMode: boolean = false) {
    console.log(`[InspectorPanel] Constructor called with demoMode: ${demoMode}`);
    this.panel = panel;
    this.isDemoMode = demoMode;
    
    console.log('[InspectorPanel] Setting HTML content...');
    this.panel.webview.html = this.getHtml();
    
    console.log('[InspectorPanel] Setting up message handler...');
    this.panel.webview.onDidReceiveMessage(this.handleWebviewMessage.bind(this));
    
    console.log('[InspectorPanel] Setting up dispose handler...');
    this.panel.onDidDispose(() => { 
      console.log(`[InspectorPanel] Panel disposed, demoMode was: ${this.isDemoMode}`);
      if (this.isDemoMode) {
        InspectorPanel.demoInstance = undefined;
      } else {
        InspectorPanel.current = undefined;
      }
    });
    
    console.log('[InspectorPanel] Constructor completed successfully');
  }

  public static create(demoMode: boolean = false) {
    console.log(`[InspectorPanel] Creating panel with demoMode: ${demoMode}`);
    
    if (demoMode) {
      if (InspectorPanel.demoInstance) { 
        console.log('[InspectorPanel] Demo instance already exists, revealing it');
        InspectorPanel.demoInstance.panel.reveal(); 
        return InspectorPanel.demoInstance; 
      }
      console.log('[InspectorPanel] Creating new DEMO instance');
      const panel = vscode.window.createWebviewPanel('inspector-demo', 'Inspector Dashboard (DEMO MODE)', vscode.ViewColumn.Two, { 
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true
      });
      InspectorPanel.demoInstance = new InspectorPanel(panel, true);
      console.log('[InspectorPanel] Demo instance created successfully');
      return InspectorPanel.demoInstance;
    } else {
      if (InspectorPanel.current) { 
        console.log('[InspectorPanel] Real instance already exists, revealing it');
        InspectorPanel.current.panel.reveal(); 
        return InspectorPanel.current; 
      }
      console.log('[InspectorPanel] Creating new REAL instance');
      const panel = vscode.window.createWebviewPanel('inspector', 'Inspector Dashboard', vscode.ViewColumn.Two, { 
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true
      });
      InspectorPanel.current = new InspectorPanel(panel, false);
      console.log('[InspectorPanel] Real instance created successfully');
      return InspectorPanel.current;
    }
  }

  public receiveTelemetry(userId: string, type: string, payload: any, ts: number, displayName?: string) {
    // Only accept real telemetry if this is not demo mode, and only demo telemetry if this is demo mode
    const isDemoData = userId && userId.startsWith('DEMO_');
    if (this.isDemoMode !== isDemoData) {
      return; // Don't mix demo and real data
    }
    
    let tile = this.users.get(userId);
    if (!tile) {
      tile = { userId, displayName, elId: 'u_' + Math.random().toString(36).slice(2,8), lastSeen: ts, events: [] };
      this.users.set(userId, tile);
      this.panel.webview.postMessage({ command: 'newUser', userId, elId: tile.elId, displayName });
    }
    if (displayName) tile.displayName = displayName;
    tile.lastSeen = ts;
    tile.events.unshift({ type, payload, ts });
    tile.events = tile.events.slice(0, 50);
    
    this.panel.webview.postMessage({ command: 'telemetry', userId, type, payload, ts, events: tile.events });
  }

  // Static method to get the appropriate instance for telemetry
  public static getInstanceForTelemetry(isDemoData: boolean): InspectorPanel | undefined {
    if (isDemoData) {
      return InspectorPanel.demoInstance;
    } else {
      return InspectorPanel.current;
    }
  }

  private handleWebviewMessage(message: any) {
    if (message.command === 'exportSession') {
      this.handleExportSession(message.data, message.readableReport);
    }
    if (message.command === 'flagUser') {
      vscode.window.showInformationMessage(`User ${message.userId} has been flagged: ${message.note || 'No reason provided'}`);
    }
  }

  private async handleExportSession(data: any, readableReport: string) {
    try {
      const isDemoData = data.isDemoMode || false;
      
      const fileName = isDemoData ? 
        `DEMO-inspector-session-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt` :
        `inspector-session-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;
      
      const saveUri = await vscode.window.showSaveDialog({
        saveLabel: isDemoData ? 'Export Demo Session Report' : 'Export Session Report',
        filters: {
          'Text Files': ['txt'],
          'JSON Files': ['json'],
          'All Files': ['*']
        },
        defaultUri: vscode.Uri.file(fileName)
      });

      if (saveUri) {
        let finalReport = readableReport;
        if (isDemoData) {
          finalReport = `🧪 DEMO MODE REPORT - FAKE DATA ONLY\nThis report contains simulated data for demonstration purposes.\n\n${readableReport}`;
        }
        
        // Save text report
        const readableUri = saveUri.with({ path: saveUri.path.replace(/\.(txt|json)$/, '.txt') });
        await vscode.workspace.fs.writeFile(readableUri, Buffer.from(finalReport, 'utf8'));
        
        // Save JSON data
        const jsonUri = saveUri.with({ path: saveUri.path.replace(/\.(txt|json)$/, '.json') });
        const jsonData = isDemoData ? { ...data, DEMO_MODE: true } : data;
        await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(jsonData, null, 2), 'utf8'));
        
        const prefix = isDemoData ? "🧪 DEMO " : "";
        vscode.window.showInformationMessage(`${prefix}Session exported successfully!`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to export session: ${error}`);
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Inspector Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
        }
        .controls {
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .export-btn {
            background: #007acc;
            color: white;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 6px;
        }
        .stat-item {
            text-align: center;
        }
        .stat-label {
            display: block;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .stat-value {
            display: block;
            font-size: 24px;
            font-weight: bold;
            color: #007acc;
        }
        .users-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }
        .user-card {
            padding: 15px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 6px;
        }
        .user-name {
            font-weight: bold;
            margin-bottom: 10px;
        }
        .user-event {
            font-size: 12px;
            margin: 5px 0;
            padding: 5px;
            background: var(--vscode-editor-background);
            border-radius: 3px;
        }
        .demo-indicator {
            background: #ff9800;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-weight: bold;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>🔍 Inspector Dashboard</h2>
        <div class="controls">
            <div id="demoIndicator" class="demo-indicator" style="display:none;">
                🧪 DEMO MODE
            </div>
            <button id="exportBtn" class="btn export-btn">📊 Export Report</button>
        </div>
    </div>

    <div class="stats">
        <div class="stat-item">
            <span class="stat-label">Users</span>
            <span class="stat-value" id="userCount">0</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Events</span>
            <span class="stat-value" id="eventCount">0</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Flags</span>
            <span class="stat-value" id="flagCount">0</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Time</span>
            <span class="stat-value" id="sessionTime">00:00</span>
        </div>
    </div>

    <div id="usersGrid" class="users-grid"></div>

    <script>
        console.log('[Inspector] Starting up...');
        
        const vscode = acquireVsCodeApi();
        let sessionStartTime = Date.now();
        let allEvents = [];
        let allFlags = [];
        let activeUsers = new Set();
        let timerInterval = null;

        console.log('[Inspector] Session start time:', new Date(sessionStartTime));

        // Timer function
        function updateTimer() {
            try {
                const elapsed = Date.now() - sessionStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                const timeStr = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
                
                const timerEl = document.getElementById('sessionTime');
                if (timerEl) {
                    timerEl.textContent = timeStr;
                }
                
                console.log('[Inspector] Timer:', timeStr);
            } catch (error) {
                console.error('[Inspector] Timer error:', error);
            }
        }

        // Export function
        function exportSession() {
            try {
                console.log('[Inspector] Export clicked');
                
                const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);
                const minutes = Math.floor(sessionDuration / 60);
                const seconds = sessionDuration % 60;
                
                const report = \`Inspector Session Report
Generated: \${new Date().toLocaleString()}
Duration: \${minutes}m \${seconds}s
Users: \${activeUsers.size}
Events: \${allEvents.length}
Flags: \${allFlags.length}

Event Log:
\${allEvents.map(e => \`\${new Date(e.ts).toLocaleTimeString()} - \${e.userId}: \${e.type}\`).join('\\n')}
\`;

                const exportData = {
                    sessionInfo: {
                        duration: sessionDuration,
                        users: activeUsers.size,
                        events: allEvents.length,
                        flags: allFlags.length
                    },
                    events: allEvents,
                    flags: allFlags,
                    isDemoMode: document.getElementById('demoIndicator').style.display !== 'none'
                };

                vscode.postMessage({
                    command: 'exportSession',
                    data: exportData,
                    readableReport: report
                });
                
                console.log('[Inspector] Export message sent');
            } catch (error) {
                console.error('[Inspector] Export error:', error);
                alert('Export failed: ' + error.message);
            }
        }



        // Update stats
        function updateStats() {
            try {
                document.getElementById('userCount').textContent = activeUsers.size;
                document.getElementById('eventCount').textContent = allEvents.length;
                document.getElementById('flagCount').textContent = allFlags.length;
            } catch (error) {
                console.error('[Inspector] Stats error:', error);
            }
        }

        // Add user to grid
        function addUser(userId, displayName) {
            const grid = document.getElementById('usersGrid');
            const card = document.createElement('div');
            card.className = 'user-card';
            card.id = 'user_' + userId;
            card.innerHTML = \`
                <div class="user-name">\${displayName || userId}</div>
                <div id="events_\${userId}"></div>
            \`;
            grid.appendChild(card);
            
            // Show demo indicator if demo user
            if (userId.startsWith('DEMO_')) {
                document.getElementById('demoIndicator').style.display = 'block';
            }
        }

        // Add event to user
        function addEvent(userId, type, payload, ts) {
            const eventsDiv = document.getElementById('events_' + userId);
            if (eventsDiv) {
                const eventEl = document.createElement('div');
                eventEl.className = 'user-event';
                eventEl.textContent = \`\${new Date(ts).toLocaleTimeString()} - \${type}: \${JSON.stringify(payload).slice(0, 50)}\`;
                eventsDiv.insertBefore(eventEl, eventsDiv.firstChild);
                
                // Keep only last 5 events visible
                while (eventsDiv.children.length > 5) {
                    eventsDiv.removeChild(eventsDiv.lastChild);
                }
            }
        }

        // Message handler
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('[Inspector] Received message:', message.command);
            
            if (message.command === 'newUser') {
                addUser(message.userId, message.displayName);
                activeUsers.add(message.userId);
                updateStats();
            }
            
            if (message.command === 'telemetry') {
                allEvents.push({
                    userId: message.userId,
                    type: message.type,
                    payload: message.payload,
                    ts: message.ts
                });
                
                addEvent(message.userId, message.type, message.payload, message.ts);
                updateStats();
            }
        });

        // Set up button handlers
        document.getElementById('exportBtn').onclick = exportSession;

        // Start timer
        console.log('[Inspector] Starting timer...');
        updateTimer(); // Initial call
        timerInterval = setInterval(updateTimer, 1000);
        
        console.log('[Inspector] Setup complete, timer started with ID:', timerInterval);
    </script>
</body>
</html>`;
  }
}