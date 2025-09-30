// src/panels/SubmitProblemPanel.ts
import * as vscode from 'vscode';
import { Problem } from '../protocol';

export class SubmitProblemPanel {
  public static current: SubmitProblemPanel | undefined;
  private panel: vscode.WebviewPanel;
  private static context: vscode.ExtensionContext;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this._getHtml();
    this.panel.webview.onDidReceiveMessage(this.onMessage.bind(this));
    this.panel.onDidDispose(() => { 
      SubmitProblemPanel.current = undefined; 
    });
  }

  public static setContext(context: vscode.ExtensionContext) {
    SubmitProblemPanel.context = context;
  }

  public static create(extensionUri: vscode.Uri) {
    if (SubmitProblemPanel.current) {
      SubmitProblemPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel('submitProblem', 'Submit Problem', vscode.ViewColumn.One, { 
      enableScripts: true,
      retainContextWhenHidden: true,
      enableFindWidget: true
    });
    SubmitProblemPanel.current = new SubmitProblemPanel(panel);
  }

  private onMessage(msg: any) {
    if (msg.command === 'submit') {
      const problem: Problem = msg.problem;
      // Clear saved draft after successful submission
      if (SubmitProblemPanel.context) {
        SubmitProblemPanel.context.globalState.update('submitProblem.draft', undefined);
      }
      // pass to extension host for centralized handling
      vscode.commands.executeCommand('manager._internal.handleSubmit', problem);
      this.panel.dispose();
    }
    if (msg.command === 'openDashboard') {
      vscode.commands.executeCommand('manager.openDashboard');
    }
    if (msg.command === 'openLiveFeed') {
      vscode.commands.executeCommand('manager.openLiveFeed');
    }
    if (msg.command === 'openInspector') {
      vscode.commands.executeCommand('manager.startInspector');
    }
    if (msg.command === 'saveDraft') {
      this.saveDraft(msg.data);
    }
    if (msg.command === 'loadDraft') {
      this.loadDraft();
    }
    if (msg.command === 'clearDraft') {
      this.clearDraft();
    }
  }

  private saveDraft(data: any) {
    if (!SubmitProblemPanel.context) return;
    
    const draft = {
      title: data.title || '',
      snippet: data.snippet || '',
      description: data.description || '',
      tags: data.tags || '',
      timestamp: Date.now()
    };
    
    SubmitProblemPanel.context.globalState.update('submitProblem.draft', draft);
  }

  private loadDraft() {
    if (!SubmitProblemPanel.context) return;
    
    const draft = SubmitProblemPanel.context.globalState.get('submitProblem.draft');
    if (draft) {
      this.panel.webview.postMessage({
        command: 'restoreDraft',
        draft: draft
      });
    }
  }

  private clearDraft() {
    if (!SubmitProblemPanel.context) return;
    
    SubmitProblemPanel.context.globalState.update('submitProblem.draft', undefined);
    this.panel.webview.postMessage({
      command: 'draftCleared'
    });
  }

  private _getHtml(): string {
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
          --info: #3498db;
          --success: #27ae60;
        }
        body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial; padding:20px; color:var(--fg); background:var(--bg); margin:0; }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 25px;
          padding-bottom: 15px;
          border-bottom: 2px solid var(--border);
        }
        
        .header h2 { margin: 0; color: var(--accent); }
        
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
        }
        
        .form-container {
          max-width: 600px;
          margin: 0 auto;
          background: var(--card);
          padding: 25px;
          border-radius: 12px;
          border: 1px solid var(--border);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        
        .field { margin-bottom:20px; }
        
        .field label {
          display: block;
          margin-bottom: 6px;
          font-weight: bold;
          color: var(--fg);
        }
        
        input, textarea { 
          width:100%; 
          padding:12px; 
          border-radius:8px; 
          border:1px solid var(--border); 
          background:var(--bg); 
          color:var(--fg); 
          font-size: 14px;
          transition: border-color 0.2s;
        }
        
        input:focus, textarea:focus {
          outline: none;
          border-color: var(--accent);
        }
        
        textarea { resize: vertical; min-height:100px; font-family: inherit; }
        
        .row { display:flex; gap:12px; align-items:flex-end; }
        .row input { flex: 1; }
        
        .submit-btn { 
          background:var(--success); 
          color:white; 
          border:none; 
          padding:12px 20px; 
          border-radius:8px; 
          cursor:pointer; 
          font-size: 16px;
          font-weight: bold;
          transition: all 0.2s;
        }
        
        .submit-btn:hover {
          background: #219a52;
          transform: translateY(-2px);
        }
        
        .hint { 
          font-size:0.9rem; 
          color:var(--vscode-editorHint-foreground); 
          margin-top:15px; 
          padding: 10px;
          background: var(--bg);
          border-radius: 6px;
          border-left: 4px solid var(--info);
        }
        
        .examples {
          margin-top: 20px;
          padding: 15px;
          background: var(--bg);
          border-radius: 8px;
          border: 1px dashed var(--border);
        }
        
        .examples h4 {
          margin: 0 0 10px 0;
          color: var(--info);
        }
        
        .example-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        
        .tag-example {
          background: var(--accent);
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.8em;
          cursor: pointer;
        }
        
        .tag-example:hover {
          opacity: 0.8;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>❓ Submit a Problem</h2>
        <div class="nav-buttons">
          <button class="nav-btn" onclick="openDashboard()">🏠 Dashboard</button>
          <button class="nav-btn" onclick="openLiveFeed()">📡 Live Feed</button>
          <button class="nav-btn" onclick="openInspector()">👁️ Inspector</button>
        </div>
      </div>
      
      <div class="form-container">
        <div class="field">
          <label for="title">Problem Title *</label>
          <input id="title" placeholder="Brief description of your problem" />
        </div>
        
        <div class="field">
          <label for="snippet">Code Snippet (Optional)</label>
          <textarea id="snippet" placeholder="Paste your code here for context..."></textarea>
        </div>
        
        <div class="field">
          <label for="description">Detailed Description *</label>
          <textarea id="description" placeholder="Explain what you're trying to achieve, what's not working, error messages, etc."></textarea>
        </div>
        
        <div class="field row">
          <div style="flex: 1;">
            <label for="tags">Tags (Optional)</label>
            <input id="tags" placeholder="javascript, react, bug, help-wanted" />
          </div>
          <button class="submit-btn" onclick="submit()">🚀 Post Question</button>
        </div>
        
        <div class="hint">
          💡 <strong>Tip:</strong> Select code in your editor and paste it into the code snippet field. Be specific about your problem to get better help!
        </div>
        
        <div class="examples">
          <h4>Popular Tags:</h4>
          <div class="example-tags">
            <span class="tag-example" onclick="addTag('javascript')">javascript</span>
            <span class="tag-example" onclick="addTag('python')">python</span>
            <span class="tag-example" onclick="addTag('react')">react</span>
            <span class="tag-example" onclick="addTag('bug')">bug</span>
            <span class="tag-example" onclick="addTag('help-wanted')">help-wanted</span>
            <span class="tag-example" onclick="addTag('typescript')">typescript</span>
            <span class="tag-example" onclick="addTag('css')">css</span>
            <span class="tag-example" onclick="addTag('nodejs')">nodejs</span>
          </div>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        let isDraftLoaded = false;
        
        function submit() {
          const title = document.getElementById('title').value.trim();
          const description = document.getElementById('description').value.trim();
          
          if (!title) {
            alert('Please enter a problem title');
            return;
          }
          
          if (!description) {
            alert('Please describe your problem');
            return;
          }
          
          const problem = {
            problemId: 'p_' + Date.now(),
            ownerId: 'u_' + Math.random().toString(36).slice(2,8),
            title: title,
            snippet: document.getElementById('snippet').value || '',
            description: description,
            tags: (document.getElementById('tags').value || '').split(',').map(s=>s.trim()).filter(Boolean),
            suggestions: [],
            visibility: 'public',
            timestamp: Date.now()
          };
          vscode.postMessage({ command: 'submit', problem });
        }
        
        function addTag(tag) {
          const tagsInput = document.getElementById('tags');
          const currentTags = tagsInput.value.split(',').map(s => s.trim()).filter(Boolean);
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            tagsInput.value = currentTags.join(', ');
            saveDraft();
          }
        }
        
        function openDashboard() {
          vscode.postMessage({ command: 'openDashboard' });
        }
        
        function openLiveFeed() {
          vscode.postMessage({ command: 'openLiveFeed' });
        }
        
        function openInspector() {
          vscode.postMessage({ command: 'openInspector' });
        }

        // Auto-save draft functionality
        function saveDraft() {
          const data = {
            title: document.getElementById('title').value,
            snippet: document.getElementById('snippet').value,
            description: document.getElementById('description').value,
            tags: document.getElementById('tags').value
          };
          
          // Only save if there's actual content
          if (data.title || data.snippet || data.description || data.tags) {
            vscode.postMessage({ command: 'saveDraft', data: data });
          }
        }

        // Add auto-save on input changes
        function setupAutoSave() {
          const inputs = ['title', 'snippet', 'description', 'tags'];
          inputs.forEach(id => {
            const element = document.getElementById(id);
            element.addEventListener('input', saveDraft);
            element.addEventListener('blur', saveDraft);
          });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
          const message = event.data;
          
          if (message.command === 'restoreDraft') {
            if (!isDraftLoaded) {
              const draft = message.draft;
              document.getElementById('title').value = draft.title || '';
              document.getElementById('snippet').value = draft.snippet || '';
              document.getElementById('description').value = draft.description || '';
              document.getElementById('tags').value = draft.tags || '';
              
              // Show restoration notification
              showNotification('📝 Draft restored from ' + new Date(draft.timestamp).toLocaleString(), 'info');
              isDraftLoaded = true;
            }
          }
          
          if (message.command === 'draftCleared') {
            showNotification('🗑️ Draft cleared', 'success');
          }
        });

        function showNotification(message, type) {
          const notification = document.createElement('div');
          notification.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 6px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            \${type === 'success' ? 'background: #27ae60;' : 
              type === 'error' ? 'background: #e74c3c;' : 
              'background: #3498db;'}
          \`;
          notification.textContent = message;
          
          document.body.appendChild(notification);
          
          setTimeout(() => {
            if (document.body.contains(notification)) {
              document.body.removeChild(notification);
            }
          }, 4000);
        }

        function clearDraft() {
          if (confirm('Clear the current draft? This will erase all unsaved changes.')) {
            document.getElementById('title').value = '';
            document.getElementById('snippet').value = '';
            document.getElementById('description').value = '';
            document.getElementById('tags').value = '';
            vscode.postMessage({ command: 'clearDraft' });
          }
        }
        
        // Initialize on load
        document.addEventListener('DOMContentLoaded', () => {
          document.getElementById('title').focus();
          setupAutoSave();
          
          // Request draft restoration
          vscode.postMessage({ command: 'loadDraft' });
          
          // Add clear draft button
          const clearBtn = document.createElement('button');
          clearBtn.textContent = '🗑️ Clear Draft';
          clearBtn.className = 'btn btn-secondary';
          clearBtn.style.marginLeft = '10px';
          clearBtn.onclick = clearDraft;
          
          const submitBtn = document.querySelector('.submit-btn');
          submitBtn.parentNode.appendChild(clearBtn);
        });
      </script>
    </body>
    </html>`;
  }
}
