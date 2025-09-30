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
exports.InspectorPanel = void 0;
// src/panels/InspectorPanel.ts
const vscode = __importStar(require("vscode"));
class InspectorPanel {
    constructor(panel, demoMode = false) {
        this.users = new Map();
        this.isDemoMode = false;
        console.log(`[InspectorPanel] Constructor called with demoMode: ${demoMode}`);
        this.panel = panel;
        this.isDemoMode = demoMode;
        console.log('[InspectorPanel] Setting HTML content...');
        this.panel.webview.html = this._html();
        console.log('[InspectorPanel] Setting up message handler...');
        this.panel.webview.onDidReceiveMessage(this.handleWebviewMessage.bind(this));
        console.log('[InspectorPanel] Setting up dispose handler...');
        this.panel.onDidDispose(() => {
            console.log(`[InspectorPanel] Panel disposed, demoMode was: ${this.isDemoMode}`);
            if (this.isDemoMode) {
                InspectorPanel.demoInstance = undefined;
            }
            else {
                InspectorPanel.current = undefined;
            }
        });
        console.log('[InspectorPanel] Constructor completed successfully');
    }
    static create(demoMode = false) {
        console.log(`[InspectorPanel] Creating panel with demoMode: ${demoMode}`);
        if (demoMode) {
            if (InspectorPanel.demoInstance) {
                console.log('[InspectorPanel] Demo instance already exists, revealing it');
                InspectorPanel.demoInstance.panel.reveal();
                return InspectorPanel.demoInstance;
            }
            console.log('[InspectorPanel] Creating new DEMO instance');
            const panel = vscode.window.createWebviewPanel('inspector-demo', 'Inspector Dashboard (DEMO MODE)', vscode.ViewColumn.Two, { enableScripts: true });
            InspectorPanel.demoInstance = new InspectorPanel(panel, true);
            console.log('[InspectorPanel] Demo instance created successfully');
            return InspectorPanel.demoInstance;
        }
        else {
            if (InspectorPanel.current) {
                console.log('[InspectorPanel] Real instance already exists, revealing it');
                InspectorPanel.current.panel.reveal();
                return InspectorPanel.current;
            }
            console.log('[InspectorPanel] Creating new REAL instance');
            const panel = vscode.window.createWebviewPanel('inspector', 'Inspector Dashboard', vscode.ViewColumn.Two, { enableScripts: true });
            InspectorPanel.current = new InspectorPanel(panel, false);
            console.log('[InspectorPanel] Real instance created successfully');
            return InspectorPanel.current;
        }
    }
    receiveTelemetry(userId, type, payload, ts, displayName) {
        // Only accept real telemetry if this is not demo mode, and only demo telemetry if this is demo mode
        const isDemoData = userId && userId.startsWith('DEMO_');
        if (this.isDemoMode !== isDemoData) {
            return; // Don't mix demo and real data
        }
        let tile = this.users.get(userId);
        if (!tile) {
            tile = { userId, displayName, elId: 'u_' + Math.random().toString(36).slice(2, 8), lastSeen: ts, events: [] };
            this.users.set(userId, tile);
            this.panel.webview.postMessage({ command: 'newUser', userId, elId: tile.elId, displayName });
        }
        if (displayName)
            tile.displayName = displayName;
        tile.lastSeen = ts;
        tile.events.unshift({ type, payload, ts });
        tile.events = tile.events.slice(0, 50);
        // Suspicious activity detection
        let suspicious = false;
        const pasteEvents = tile.events.filter(e => e.type === 'telemetry.paste');
        if (pasteEvents.length > 2)
            suspicious = true;
        const fileSwitches = tile.events.filter(e => e.type === 'telemetry.openfile');
        if (fileSwitches.length > 5)
            suspicious = true;
        this.panel.webview.postMessage({ command: 'suspicious', userId, suspicious });
        // If payload has preview, update codePreview
        if (payload && payload.preview !== undefined) {
            this.panel.webview.postMessage({ command: 'codePreview', userId, preview: payload.preview, file: payload.file });
        }
        this.panel.webview.postMessage({ command: 'telemetry', userId, type, payload, ts, events: tile.events });
    }
    // Static method to get the appropriate instance for telemetry
    static getInstanceForTelemetry(isDemoData) {
        if (isDemoData) {
            return InspectorPanel.demoInstance;
        }
        else {
            return InspectorPanel.current;
        }
    }
    handleWebviewMessage(message) {
        if (message.command === 'exportSession') {
            this.handleExportSession(message.data, message.readableReport);
        }
        if (message.command === 'flagUser') {
            vscode.window.showInformationMessage(`User ${message.userId} has been flagged: ${message.note || 'No reason provided'}`);
        }
        if (message.command === 'openFile') {
            vscode.workspace.openTextDocument(message.file).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        }
    }
    async handleExportSession(data, readableReport) {
        try {
            // Check if this is demo data
            const isDemoData = data.rawData?.events?.some((event) => event.userId && event.userId.startsWith('DEMO_'));
            const fileName = isDemoData ?
                `DEMO-inspector-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt` :
                `inspector-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
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
                // Add demo header to report if needed
                let finalReport = readableReport;
                if (isDemoData) {
                    finalReport = `🧪 DEMO MODE REPORT - FAKE DATA ONLY
This report contains simulated data for demonstration purposes.
No real student activity was monitored.

${readableReport}`;
                }
                // Save human-readable report
                const readableUri = saveUri.with({ path: saveUri.path.replace(/\.(txt|json)$/, '.txt') });
                await vscode.workspace.fs.writeFile(readableUri, Buffer.from(finalReport, 'utf8'));
                // Save JSON data
                const jsonUri = saveUri.with({ path: saveUri.path.replace(/\.(txt|json)$/, '.json') });
                const jsonData = isDemoData ? { ...data, DEMO_MODE: true } : data;
                await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(jsonData, null, 2), 'utf8'));
                const prefix = isDemoData ? "🧪 DEMO " : "";
                vscode.window.showInformationMessage(`${prefix}Session exported to:\n${readableUri.fsPath}\n${jsonUri.fsPath}`);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to export session: ${error}`);
        }
    }
    _html() {
        return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Inspector Dashboard</title>
      <style>
        :root { 
          --bg: var(--vscode-editor-background); 
          --fg: var(--vscode-editor-foreground); 
          --card: var(--vscode-editorWidget-background); 
          --border: var(--vscode-editorWidget-border); 
          --flag: #e74c3c; 
          --success: #27ae60;
          --warning: #f39c12;
          --info: #3498db;
        }
        body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial; padding:12px; color:var(--fg); background:var(--bg); margin:0; }
        
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin-bottom: 15px; 
          padding-bottom: 10px; 
          border-bottom: 1px solid var(--border);
        }
        
        .header h2 { margin: 0; }
        
        .controls { 
          display: flex; 
          gap: 8px; 
        }
        
        .btn {
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          transition: all 0.2s;
        }
        
        .export-btn {
          background: var(--success);
          color: white;
        }
        
        .export-btn:hover {
          background: #219a52;
        }
        
        .clear-btn {
          background: var(--warning);
          color: white;
        }
        
        .clear-btn:hover {
          background: #d68910;
        }
        
        .stats-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
          margin-bottom: 20px;
          padding: 15px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        
        .stat-item {
          text-align: center;
        }
        
        .stat-label {
          display: block;
          font-size: 0.8em;
          color: var(--vscode-descriptionForeground);
        }
        
        .stat-value {
          display: block;
          font-size: 1.4em;
          font-weight: bold;
          color: var(--info);
        }
        
        .grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(300px,1fr)); gap:15px; }
        .card { border:1px solid var(--border); background:var(--card); padding:12px; border-radius:10px; position:relative; transition: all 0.2s; }
        .card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .userId { font-weight:700; margin-bottom:8px; font-size: 1.1em; }
        .event { font-size:0.85rem; margin-top:8px; padding:8px; border-radius:6px; background:var(--bg); border:1px solid var(--border); }
        .meta { color:var(--vscode-editorHint-foreground); font-size:0.8rem; margin-bottom: 4px; }
        .flag-btn { position:absolute; top:10px; right:10px; background:var(--flag); color:#fff; border:none; border-radius:4px; padding:6px 10px; cursor:pointer; font-size:0.85em; }
        .flag-btn:hover { background: #c0392b; }
        .flagged { box-shadow: 0 0 0 3px var(--flag); }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>🔍 Inspector — Live Telemetry Dashboard</h2>
        <div class="controls">
          <div id="demoIndicator" style="display:none; background:#ff9800; color:white; padding:8px 12px; border-radius:6px; font-weight:bold; margin-right:10px;">
            🧪 DEMO MODE - Fake Data Only
          </div>
          <button id="exportBtn" class="btn export-btn">📊 Export Complete Report</button>
          <button id="clearBtn" class="btn clear-btn">🗑️ Clear Session</button>
        </div>
      </div>
      <div class="stats-bar" id="statsBar">
        <div class="stat-item">
          <span class="stat-label">Active Users:</span>
          <span class="stat-value" id="userCount">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total Events:</span>
          <span class="stat-value" id="eventCount">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Flags:</span>
          <span class="stat-value" id="flagCount">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Session Time:</span>
          <span class="stat-value" id="sessionTime">00:00</span>
        </div>
      </div>
      <div id="grid" class="grid"></div>
      <script>
        (function() {
          console.log('[Inspector] Script starting...');
          
          const vscode = acquireVsCodeApi();
          const grid = document.getElementById('grid');
          let allEvents = [];
          let allFlags = [];
          let sessionStartTime = Date.now();
          let activeUsers = new Set();
          let timerInterval = null;
          
          console.log('[Inspector] Variables initialized, session start time:', new Date(sessionStartTime));


        window.addEventListener('message', e => {
          const m = e.data;
          if (m.command === 'newUser') {
            addUserCard(m.userId, m.elId, m.displayName);
            activeUsers.add(m.userId);
            updateStats();
            
            // Show demo indicator if this is a demo user
            if (m.userId && m.userId.startsWith('DEMO_')) {
              const demoIndicator = document.getElementById('demoIndicator');
              if (demoIndicator) {
                demoIndicator.style.display = 'block';
              }
            }
          }
          if (m.command === 'telemetry') {
            appendEvent(m.userId, m.type, m.payload, m.ts, m.events);
            allEvents.push({ userId: m.userId, type: m.type, payload: m.payload, ts: m.ts });
            activeUsers.add(m.userId);
            updateStats();
          }
          if (m.command === 'codePreview') updateCodePreview(m.userId, m.preview, m.file);
          if (m.command === 'suspicious') setSuspicious(m.userId, m.suspicious);
        });

        function addUserCard(userId, elId, displayName) {
          if (document.getElementById(elId)) return;
          const div = document.createElement('div');
          div.className = 'card';
          div.id = elId;
          div.innerHTML = '<div class="userId">' +
            (displayName ? '<b>' + escapeHtml(displayName) + '</b> (' + escapeHtml(userId) + ')' : escapeHtml(userId)) + '</div>' +
            '<button class="flag-btn" onclick="flagUser(\'' + elId + '\', \'' + userId + '\')">Flag</button>' +
            '<div class="flag-note" id="flag_' + elId + '" style="display:none;margin:6px 0;color:#e74c3c;font-size:0.9em;"></div>' +
            '<div class="codePreview" id="code_' + elId + '" style="margin:8px 0; background:#222; color:#fff; padding:6px; border-radius:6px; font-family:monospace; font-size:0.95em; max-height:120px; overflow:auto; display:none;"></div>' +
            '<div id="timeline_' + elId + '" style="margin:8px 0 4px 0;font-size:0.9em;color:#888;"></div>' +
            '<div id="ev_' + elId + '">No events yet</div>';
          grid.prepend(div);
        }

        function appendEvent(userId, type, payload, ts, events) {
          const cards = Array.from(document.querySelectorAll('.card'));
          for (const n of cards) {
            if (n.innerText && n.innerText.includes(userId)) {
              const evContainer = n.querySelector('[id^="ev_"]');
              const el = document.createElement('div');
              el.className = 'event';
              el.innerHTML = '<div class="meta">' + new Date(ts).toLocaleTimeString() + ' — ' + escapeHtml(type) + '</div><div>' + escapeHtml(JSON.stringify(payload)) + '</div>';
              evContainer.prepend(el);
              while (evContainer.childNodes.length > 10) evContainer.removeChild(evContainer.lastChild);
              // Update timeline
              if (events) {
                const timelineDiv = n.querySelector('[id^="timeline_"]');
                if (timelineDiv) {
                  timelineDiv.innerHTML = events.slice(0, 6).map(function(e) {
                    return '<span style="margin-right:8px;">' + new Date(e.ts).toLocaleTimeString() + ' <b>' + escapeHtml(e.type.replace('telemetry.', '')) + '</b></span>';
                  }).join('');
                }
              }
              return;
            }
          }
          // If user not found, add them
          addUserCard(userId, 'card_' + userId);
          appendEvent(userId, type, payload, ts, events);
        }

        window.flagUser = function(elId, userId) {
          const card = document.getElementById(elId);
          if (!card) return;
          const note = prompt('Enter flag reason or note:');
          card.classList.add('flagged');
          const noteDiv = document.getElementById('flag_' + elId);
          if (noteDiv) {
            noteDiv.style.display = 'block';
            noteDiv.textContent = 'Flagged: ' + (note || '(no reason)');
          }
          allFlags.push({ userId: userId, note: note, ts: Date.now() });
          vscode.postMessage({ command: 'flagUser', userId, note });
          updateStats();
        }

          // Set up button handlers
          document.addEventListener('DOMContentLoaded', function() {
            console.log('[Inspector] DOM loaded, setting up buttons...');
            
            const exportBtn = document.getElementById('exportBtn');
            const clearBtn = document.getElementById('clearBtn');
            
            if (exportBtn) {
              exportBtn.onclick = exportSession;
              console.log('[Inspector] Export button handler set');
            } else {
              console.error('[Inspector] Export button not found');
            }
            
            if (clearBtn) {
              clearBtn.onclick = clearSession;
              console.log('[Inspector] Clear button handler set');
            } else {
              console.error('[Inspector] Clear button not found');
            }
          });
          
          // Also set them up immediately in case DOM is already loaded
          setTimeout(function() {
            const exportBtn = document.getElementById('exportBtn');
            const clearBtn = document.getElementById('clearBtn');
            
            if (exportBtn && !exportBtn.onclick) {
              exportBtn.onclick = exportSession;
              console.log('[Inspector] Export button handler set (delayed)');
            }
            
            if (clearBtn && !clearBtn.onclick) {
              clearBtn.onclick = clearSession;
              console.log('[Inspector] Clear button handler set (delayed)');
            }
          }, 100);

          function updateStats() {
            try {
              const userCountEl = document.getElementById('userCount');
              const eventCountEl = document.getElementById('eventCount');
              const flagCountEl = document.getElementById('flagCount');
              
              if (userCountEl) userCountEl.textContent = activeUsers.size;
              if (eventCountEl) eventCountEl.textContent = allEvents.length;
              if (flagCountEl) flagCountEl.textContent = allFlags.length;
              
              console.log('[Inspector] Stats updated:', {
                users: activeUsers.size,
                events: allEvents.length,
                flags: allFlags.length
              });
            } catch (error) {
              console.error('[Inspector] updateStats error:', error);
            }
          }

          // Timer function
          function updateTimer() {
            try {
              const elapsed = Date.now() - sessionStartTime;
              const hours = Math.floor(elapsed / 3600000);
              const minutes = Math.floor((elapsed % 3600000) / 60000);
              const seconds = Math.floor((elapsed % 60000) / 1000);
              
              const timeStr = hours > 0 ? 
                hours.toString().padStart(2, '0') + ':' + 
                minutes.toString().padStart(2, '0') + ':' + 
                seconds.toString().padStart(2, '0') :
                minutes.toString().padStart(2, '0') + ':' + 
                seconds.toString().padStart(2, '0');
                
              const timerElement = document.getElementById('sessionTime');
              if (timerElement) {
                timerElement.textContent = timeStr;
                console.log('[Inspector] Timer updated:', timeStr);
              } else {
                console.error('[Inspector] sessionTime element not found!');
              }
            } catch (error) {
              console.error('[Inspector] Timer error:', error);
            }
          }
          
          // Export function
          function exportSession() {
            try {
              console.log('[Inspector] Export button clicked');
              const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);
              const exportData = {
                sessionInfo: {
                  exportDate: new Date().toISOString(),
                  sessionDuration: sessionDuration + ' seconds',
                  totalUsers: activeUsers.size,
                  totalEvents: allEvents.length,
                  totalFlags: allFlags.length
                },
                rawData: {
                  events: allEvents,
                  flags: allFlags
                }
              };
              
              const report = generateSimpleReport();
              vscode.postMessage({ 
                command: 'exportSession', 
                data: exportData,
                readableReport: report
              });
            } catch (error) {
              console.error('[Inspector] Export error:', error);
              alert('Export failed: ' + error.message);
            }
          }
          
          // Clear function
          function clearSession() {
            try {
              console.log('[Inspector] Clear button clicked');
              if (confirm('Clear all session data?')) {
                allEvents = [];
                allFlags = [];
                activeUsers.clear();
                sessionStartTime = Date.now();
                
                const grid = document.getElementById('grid');
                if (grid) {
                  grid.innerHTML = '';
                }
                
                updateStats();
                console.log('[Inspector] Session cleared');
                alert('Session data cleared');
              }
            } catch (error) {
              console.error('[Inspector] Clear error:', error);
            }
          }
          
          function generateSimpleReport() {
            const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);
            const minutes = Math.floor(sessionDuration / 60);
            const seconds = sessionDuration % 60;
            
            return \`Inspector Session Report
Generated: \${new Date().toLocaleString()}
Duration: \${minutes} minutes \${seconds} seconds
Users: \${activeUsers.size}
Events: \${allEvents.length}
Flags: \${allFlags.length}

Event Details:
\${allEvents.map(e => \`\${new Date(e.ts).toLocaleTimeString()} - \${e.userId}: \${e.type}\`).join('\\n')}
\`;
          }
          
          // Start timer
          console.log('[Inspector] Starting timer...');
          updateTimer(); // Initial call
          timerInterval = setInterval(updateTimer, 1000);
          console.log('[Inspector] Timer interval set:', timerInterval);

          // Initialize stats
          updateStats();
          
        })(); // End of main function
    </body>
    </html>`;
    }
}
exports.InspectorPanel = InspectorPanel;
allEvents.forEach(event => {
    if (!users[event.userId]) {
        users[event.userId] = {
            totalEvents: 0,
            keystrokes: 0,
            pastes: 0,
            fileChanges: 0,
            cursorMoves: 0,
            suspicious: false
        };
    }
    users[event.userId].totalEvents++;
    if (event.type === 'telemetry.keystroke')
        users[event.userId].keystrokes++;
    if (event.type === 'telemetry.paste')
        users[event.userId].pastes++;
    if (event.type === 'telemetry.openfile')
        users[event.userId].fileChanges++;
    if (event.type === 'telemetry.cursor')
        users[event.userId].cursorMoves++;
    // Mark as suspicious if many pastes or file changes
    if (users[event.userId].pastes > 2 || users[event.userId].fileChanges > 5) {
        users[event.userId].suspicious = true;
    }
});
return users;
function generateHumanReadableReport() {
    const report = [];
    const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);
    const minutes = Math.floor(sessionDuration / 60);
    const seconds = sessionDuration % 60;
    report.push('='.repeat(80));
    report.push('                    VISUAL STUDIO CODE INSPECTION REPORT                    ');
    report.push('='.repeat(80));
    report.push('');
    report.push('📅 Report Generated: ' + new Date().toLocaleString());
    report.push('⏱️  Session Duration: ' + minutes + ' minutes and ' + seconds + ' seconds');
    report.push('👥 Total Students Monitored: ' + Object.keys(getUserSummaries()).length);
    report.push('📊 Total Activities Recorded: ' + allEvents.length);
    report.push('🚩 Students Flagged: ' + allFlags.length);
    report.push('');
    // Executive Summary
    report.push('-'.repeat(50));
    report.push('📋 EXECUTIVE SUMMARY');
    report.push('-'.repeat(50));
    const suspiciousUsers = Object.values(getUserSummaries()).filter(u => u.suspicious).length;
    const highActivityUsers = Object.values(getUserSummaries()).filter(u => u.totalEvents > 50).length;
    report.push('• Students with suspicious behavior: ' + suspiciousUsers);
    report.push('• Students with high activity: ' + highActivityUsers);
    report.push('• Average events per student: ' + Math.round(allEvents.length / Object.keys(getUserSummaries()).length));
    report.push('');
    // Detailed User Analysis
    report.push('-'.repeat(50));
    report.push('👤 DETAILED STUDENT ANALYSIS');
    report.push('-'.repeat(50));
    const userSummaries = getUserSummaries();
    Object.entries(userSummaries).forEach(([userId, data], index) => {
        report.push('');
        report.push('STUDENT #' + (index + 1) + ': ' + userId);
        report.push('  📈 Activity Level: ' + getActivityLevel(data.totalEvents));
        report.push('  ⌨️  Typing Events: ' + data.keystrokes + ' times');
        report.push('  📋 Copy/Paste Actions: ' + data.pastes + (data.pastes > 3 ? ' ⚠️  EXCESSIVE PASTING' : ' ✅ Normal'));
        report.push('  📁 File Switching: ' + data.fileChanges + (data.fileChanges > 8 ? ' ⚠️  FREQUENT FILE CHANGES' : ' ✅ Normal'));
        report.push('  🖱️  Cursor Movements: ' + data.cursorMoves + ' times');
        report.push('  📱 VS Code Focus Changes: ' + (data.focusChanges || 0) + ' times');
        report.push('  📐 Window Size Changes: ' + (data.windowChanges || 0) + ' times');
        if (data.suspicious) {
            report.push('  🚨 STATUS: FLAGGED FOR SUSPICIOUS ACTIVITY');
            report.push('  📝 Potential Issues: ' + getPotentialIssues(data));
        }
        else {
            report.push('  ✅ STATUS: Normal Activity Pattern');
        }
    });
    // Flagged Students Details
    if (allFlags.length > 0) {
        report.push('');
        report.push('-'.repeat(50));
        report.push('🚩 FLAGGED STUDENTS DETAILS');
        report.push('-'.repeat(50));
        allFlags.forEach((flag, index) => {
            report.push('');
            report.push('FLAG #' + (index + 1));
            report.push('👤 Student ID: ' + flag.userId);
            report.push('⏰ Time Flagged: ' + new Date(flag.ts).toLocaleString());
            report.push('📝 Reason: ' + (flag.note || 'Manual flag by inspector - no specific reason provided'));
            report.push('📊 Activity at time of flag: ' + getActivityAtTime(flag.userId, flag.ts));
        });
    }
    // Session Timeline
    report.push('');
    report.push('-'.repeat(50));
    report.push('⏰ DETAILED SESSION TIMELINE');
    report.push('-'.repeat(50));
    const sortedEvents = [...allEvents].sort((a, b) => a.ts - b.ts);
    sortedEvents.forEach(event => {
        const time = new Date(event.ts).toLocaleTimeString();
        const action = humanizeEventType(event.type);
        const details = getEventDetails(event);
        report.push(time + ' | ' + event.userId + ' | ' + action + details);
    });
    // Recommendations
    report.push('');
    report.push('-'.repeat(50));
    report.push('💡 INSPECTOR RECOMMENDATIONS');
    report.push('-'.repeat(50));
    report.push('• Review students with excessive copy/paste activity');
    report.push('• Check students who frequently switch between files');
    report.push('• Investigate students who left VS Code frequently');
    report.push('• Follow up with flagged students for clarification');
    report.push('• Consider additional monitoring for suspicious patterns');
    report.push('');
    report.push('='.repeat(80));
    report.push('                           END OF INSPECTION REPORT                           ');
    report.push('='.repeat(80));
    return report.join('\\n');
}
function getUserSummaries() {
    const users = {};
    allEvents.forEach(event => {
        if (!users[event.userId]) {
            users[event.userId] = {
                totalEvents: 0,
                keystrokes: 0,
                pastes: 0,
                fileChanges: 0,
                cursorMoves: 0,
                suspicious: false
            };
        }
        users[event.userId].totalEvents++;
        if (event.type === 'telemetry.keystroke')
            users[event.userId].keystrokes++;
        if (event.type === 'telemetry.paste')
            users[event.userId].pastes++;
        if (event.type === 'telemetry.openfile')
            users[event.userId].fileChanges++;
        if (event.type === 'telemetry.cursor')
            users[event.userId].cursorMoves++;
        if (users[event.userId].pastes > 2 || users[event.userId].fileChanges > 5) {
            users[event.userId].suspicious = true;
        }
    });
    return users;
}
function getActivityLevel(eventCount) {
    if (eventCount > 100)
        return 'Very High';
    if (eventCount > 50)
        return 'High';
    if (eventCount > 20)
        return 'Medium';
    if (eventCount > 5)
        return 'Low';
    return 'Very Low';
}
function humanizeEventType(type) {
    const map = {
        'telemetry.keystroke': 'was typing',
        'telemetry.paste': 'pasted content',
        'telemetry.cursor': 'moved cursor position',
        'telemetry.openfile': 'opened/switched file',
        'telemetry.focus': 'changed VS Code focus',
        'telemetry.resize': 'resized VS Code window',
        'telemetry.extension': 'used extension'
    };
    return map[type] || type;
}
function getPotentialIssues(userData) {
    const issues = [];
    if (userData.pastes > 3)
        issues.push('Excessive copy-pasting');
    if (userData.fileChanges > 8)
        issues.push('Frequent file switching');
    if (userData.focusChanges > 10)
        issues.push('Leaving VS Code frequently');
    if (userData.windowChanges > 5)
        issues.push('Resizing window frequently');
    return issues.join(', ') || 'General suspicious pattern';
}
function getActivityAtTime(userId, timestamp) {
    const userEvents = allEvents.filter(e => e.userId === userId);
    const eventsAroundTime = userEvents.filter(e => Math.abs(e.ts - timestamp) < 30000); // 30 seconds
    return eventsAroundTime.length + ' activities in 30-second window';
}
function getEventDetails(event) {
    if (event.payload && event.payload.file) {
        const fileName = event.payload.file.split('\\\\').pop() || event.payload.file.split('/').pop();
        return ' in ' + fileName;
    }
    if (event.payload && event.payload.sample) {
        return ' (' + event.payload.sample.substring(0, 20) + '...)';
    }
    return '';
}
function setSuspicious(userId, suspicious) {
    const cards = Array.from(document.querySelectorAll('.card'));
    for (const n of cards) {
        if (n.innerText && n.innerText.includes(userId)) {
            if (suspicious)
                n.style.boxShadow = '0 0 0 3px #e67e22';
            else
                n.style.boxShadow = '';
        }
    }
}
function updateCodePreview(userId, preview, file) {
    const cards = Array.from(document.querySelectorAll('.card'));
    for (const n of cards) {
        if (n.innerText && n.innerText.includes(userId)) {
            const codeDiv = n.querySelector('.codePreview');
            if (codeDiv) {
                codeDiv.style.display = 'block';
                codeDiv.innerHTML = '<div style="font-size:0.8em;color:#aaa;">' +
                    (file ? '<a href="#" onclick="openFile(\'' + escapeHtml(file) + '\')">' + escapeHtml(file) + '</a>' : '') +
                    '</div>' +
                    '<pre style="margin:0;white-space:pre-wrap;">' + escapeHtml(preview || '') + '</pre>';
            }
            return;
        }
    }
}
window.openFile = function (file) {
    vscode.postMessage({ command: 'openFile', file });
};
function escapeHtml(s) { return (s === undefined || s === null) ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/script>
    < /body>
    < /html>`;
//# sourceMappingURL=InspectorPanel_BROKEN.js.map