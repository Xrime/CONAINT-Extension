// src/panels/LiveFeedPanel.ts
import * as vscode from 'vscode';
import { Problem, Suggestion } from '../protocol';

export class LiveFeedPanel {
  public static current: LiveFeedPanel | undefined;
  private panel: vscode.WebviewPanel;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this._getHtml([]);
    this.panel.webview.onDidReceiveMessage(this.onMessage.bind(this));
    this.panel.onDidDispose(() => { LiveFeedPanel.current = undefined; });
  }

  public static create(initialProblems: Problem[] = []) {
    if (LiveFeedPanel.current) { 
      LiveFeedPanel.current.panel.reveal(); 
      return; 
    }
    const panel = vscode.window.createWebviewPanel(
      'liveFeed',
      'Live Problem Feed',
      vscode.ViewColumn.One,
      { 
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true
      }
    );
    LiveFeedPanel.current = new LiveFeedPanel(panel);
    
    // Request global problems from server when opening Live Feed
    setTimeout(() => {
      panel.webview.postMessage({ command: 'init', problems: initialProblems });
      // Request global problems
      vscode.commands.executeCommand('manager._internal.requestGlobalProblems');
    }, 200);
  }

  public postNewProblem(problem: Problem) {
    this.panel.webview.postMessage({ command: 'newProblem', problem });
  }

  public postNewSuggestion(s: Suggestion) {
    this.panel.webview.postMessage({ command: 'newSuggestion', suggestion: s });
  }

  private onMessage(msg: any) {
    if (msg.command === 'suggest') {
      vscode.commands.executeCommand('manager._internal.handleSuggest', msg.suggestion);
    }
    if (msg.command === 'accept') {
      vscode.commands.executeCommand('manager._internal.handleAccept', msg);
    }
    if (msg.command === 'openDashboard') {
      vscode.commands.executeCommand('manager.openDashboard');
    }
    if (msg.command === 'submitProblem') {
      vscode.commands.executeCommand('manager.submitProblem');
    }
    if (msg.command === 'openInspector') {
      vscode.commands.executeCommand('manager.startInspector');
    }
  }

  private _getHtml(problems: Problem[]) {
    return `<!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        :root {
          --bg: var(--vscode-editor-background);
          --fg: var(--vscode-editor-foreground);
          --card: var(--vscode-editorWidget-background);
          --border: var(--vscode-editorWidget-border);
          --accent: var(--vscode-button-background);
          --accept: #2ecc71;
          --info: #3498db;
        }
        body { 
          font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial; 
          padding:12px; 
          color:var(--fg); 
          background:var(--bg); 
          margin:0; 
          height: 100vh; 
          overflow-y: auto; 
          overflow-x: hidden;
        }
        
        .main-container {
          max-height: calc(100vh - 24px);
          overflow-y: auto;
          overflow-x: hidden;
        }
        
        .problems-list {
          max-height: calc(100vh - 200px);
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 8px;
        }
        
        /* Custom scrollbar for better UX */
        .problems-list::-webkit-scrollbar {
          width: 8px;
        }
        
        .problems-list::-webkit-scrollbar-track {
          background: var(--vscode-scrollbarSlider-background);
          border-radius: 10px;
        }
        
        .problems-list::-webkit-scrollbar-thumb {
          background: var(--vscode-scrollbarSlider-hoverBackground);
          border-radius: 10px;
        }
        
        .problems-list::-webkit-scrollbar-thumb:hover {
          background: var(--vscode-scrollbarSlider-activeBackground);
        }
        
        /* Loading animation */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid var(--border);
        }
        
        .header h2 { margin: 0; }
        
        .nav-buttons {
          display: flex;
          gap: 8px;
        }
        
        .nav-btn {
          padding: 8px 12px;
          background: var(--info);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          transition: all 0.2s;
        }
        
        .nav-btn:hover {
          background: #2980b9;
          transform: translateY(-1px);
        }
        
        .stats {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
          padding: 15px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          text-align: center;
        }
        
        .stat-item {
          flex: 1;
        }
        
        .stat-number {
          display: block;
          font-size: 1.8em;
          font-weight: bold;
          color: var(--accent);
        }
        
        .stat-label {
          display: block;
          font-size: 0.9em;
          color: var(--vscode-descriptionForeground);
        }
        
        .card { border:1px solid var(--border); background:var(--card); padding:15px; border-radius:12px; margin-bottom:20px; box-shadow: 0 3px 8px rgba(0,0,0,0.1); transition: all 0.2s; }
        .card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.15); }
        .card h3 { margin-bottom: 10px; color: var(--accent); }
        .card-meta { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
        pre { background:#1e1e1e; color:#eee; padding:10px; border-radius:8px; overflow:auto; margin: 10px 0; }
        textarea { width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); margin-top:8px; resize: vertical; min-height: 60px; }
        .btn { background:var(--accent); color:var(--vscode-button-foreground); border:none; padding:8px 14px; border-radius:6px; cursor:pointer; margin-top:8px; transition: all 0.2s; }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .accept-btn { background:var(--accept); color:#fff; margin-left:8px; }
        .suggest { margin-top:12px; padding:10px; border-left:4px solid var(--border); background: var(--bg); border-radius: 0 8px 8px 0; }
        .accepted { border-left:4px solid var(--accept); font-weight:bold; background: rgba(46, 204, 113, 0.1); }
        .suggestion-meta { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-bottom: 5px; }
      </style>
    </head>
    <body>
      <div class="main-container">
      <div class="header">
        <h2>� Live Problem Feed</h2>
        <div class="nav-buttons">
          <button class="nav-btn" onclick="openDashboard()">🏠 Dashboard</button>
          <button class="nav-btn" onclick="submitProblem()">➕ New Problem</button>
          <button class="nav-btn" onclick="openInspector()">👁️ Inspector</button>
        </div>
      </div>
      
      <div class="stats" id="stats">
        <div class="stat-item">
          <span class="stat-number" id="problemCount">0</span>
          <span class="stat-label">Problems</span>
        </div>
        <div class="stat-item">
          <span class="stat-number" id="suggestionCount">0</span>
          <span class="stat-label">Suggestions</span>
        </div>
        <div class="stat-item">
          <span class="stat-number" id="acceptedCount">0</span>
          <span class="stat-label">Accepted</span>
        </div>
      </div>
      
      <div class="problems-list">
        <div id="feed"></div>
        <div id="loading" style="display: none; text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">
          <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid var(--vscode-descriptionForeground); border-radius: 50%; border-top: 2px solid var(--accent); animation: spin 1s linear infinite;"></div>
          <p style="margin-top: 10px;">Loading more problems...</p>
        </div>
        <div id="scrollEnd" style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); font-style: italic;">
          <p>📡 End of feed - Use "Load Community Problems" to get more content!</p>
        </div>
      </div>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const feed = document.getElementById('feed');

        window.addEventListener('message', event => {
          const m = event.data;
          if (m.command === 'init') {
            feed.innerHTML = '';
            m.problems.forEach(addProblem);
          } else if (m.command === 'newProblem') {
            addProblem(m.problem, true);
          } else if (m.command === 'newSuggestion') {
            addSuggestionToUI(m.suggestion);
          }
        });

        function addProblem(p, prepend) {
          const el = document.createElement('div');
          el.className = 'card';
          el.id = p.problemId;
          const timeStr = new Date(p.timestamp).toLocaleString();
          const tags = (p.tags && p.tags.length) ? p.tags.map(t => '<span style="background:var(--accent);color:white;padding:2px 6px;border-radius:12px;font-size:0.8em;margin-right:4px;">' + escapeHtml(t) + '</span>').join('') : '';
          
          el.innerHTML = '<div class="card-meta">Posted by ' + escapeHtml(p.ownerId || 'Anonymous') + ' • ' + timeStr + '</div>' +
            '<h3>' + escapeHtml(p.title) + '</h3>' +
            (p.snippet ? '<pre>' + escapeHtml(p.snippet) + '</pre>' : '') +
            '<p>' + escapeHtml(p.description || '') + '</p>' +
            (tags ? '<div style="margin:10px 0;">' + tags + '</div>' : '') +
            '<textarea id="s_' + p.problemId + '" placeholder="Share your suggestion or solution..."></textarea>' +
            '<button class="btn" onclick="sendSuggest(\\'' + p.problemId + '\\')">💡 Add Suggestion</button>' +
            '<div id="slist_' + p.problemId + '"></div>';
          if (prepend) feed.prepend(el); else feed.append(el);

          if (p.suggestions && p.suggestions.length) {
            p.suggestions.forEach(s => addSuggestionToUI(s));
          }
          updateStats();
        }

        function sendSuggest(pid) {
          const txt = document.getElementById('s_' + pid).value.trim();
          if (!txt) return alert('Enter suggestion text');
          const suggestion = {
            suggestionId: 's_' + Date.now(),
            problemId: pid,
            authorId: 'u_' + Math.random().toString(36).slice(2,8),
            content: txt,
            timestamp: Date.now()
          };
          vscode.postMessage({ command: 'suggest', suggestion });
          document.getElementById('s_' + pid).value = '';
        }

        function addSuggestionToUI(s) {
          const list = document.getElementById('slist_' + s.problemId);
          if (!list) return;
          const node = document.createElement('div');
          node.className = 'suggest' + (s.accepted ? ' accepted' : '');
          node.id = s.suggestionId;
          const timeStr = new Date(s.timestamp).toLocaleTimeString();
          const statusIcon = s.accepted ? '✅' : '💡';
          const statusText = s.accepted ? 'ACCEPTED SOLUTION' : 'Suggestion';
          
          node.innerHTML = '<div class="suggestion-meta">' + statusIcon + ' ' + statusText + ' by ' + escapeHtml(s.authorId || 'Anonymous') + ' • ' + timeStr + '</div>' +
            '<div>' + escapeHtml(s.content) + '</div>' +
            (s.accepted ? '' : '<button class="accept-btn" onclick="acceptSuggest(\\'' + s.problemId + '\\', \\'' + s.suggestionId + '\\')">✅ Mark as Solution</button>');
          list.appendChild(node);
          updateStats();
        }

        function acceptSuggest(pid, sid) {
          vscode.postMessage({ command: 'accept', problemId: pid, suggestionId: sid });
          const node = document.getElementById(sid);
          if (node) { node.classList.add('accepted'); }
        }

        function updateStats() {
          const problems = document.querySelectorAll('.card').length;
          const suggestions = document.querySelectorAll('.suggest').length;
          const accepted = document.querySelectorAll('.accepted').length;
          
          document.getElementById('problemCount').textContent = problems;
          document.getElementById('suggestionCount').textContent = suggestions;
          document.getElementById('acceptedCount').textContent = accepted;
        }

        function openDashboard() {
          // Send message to open dashboard
          vscode.postMessage({ command: 'openDashboard' });
        }

        function submitProblem() {
          vscode.postMessage({ command: 'submitProblem' });
        }

        function openInspector() {
          vscode.postMessage({ command: 'openInspector' });
        }

        function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
      </script>
    </body>
    </html>`;
  }
}
