// Test Inspector Panel - Minimal Version for Debugging
import * as vscode from 'vscode';

export class TestInspectorPanel {
  public static current: TestInspectorPanel | undefined;
  public panel: vscode.WebviewPanel;

  constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => { 
      TestInspectorPanel.current = undefined; 
    });
  }

  public static create() {
    if (TestInspectorPanel.current) { 
      TestInspectorPanel.current.panel.reveal(); 
      return; 
    }
    
    const panel = vscode.window.createWebviewPanel(
      'test-inspector', 
      'TEST Inspector Dashboard', 
      vscode.ViewColumn.Two, 
      { 
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true
      }
    );
    
    TestInspectorPanel.current = new TestInspectorPanel(panel);
    console.log("[TestInspector] Panel created successfully");
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Inspector</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background: var(--vscode-editor-background);
            }
            .timer {
                font-size: 2em;
                font-weight: bold;
                color: #007acc;
                margin: 20px 0;
            }
            .status {
                padding: 10px;
                background: var(--vscode-editorWidget-background);
                border: 1px solid var(--vscode-editorWidget-border);
                border-radius: 5px;
                margin: 10px 0;
            }
            button {
                padding: 10px 20px;
                background: #007acc;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                margin: 5px;
            }
            button:hover {
                background: #005a9e;
            }
        </style>
    </head>
    <body>
        <h1>🧪 TEST Inspector Panel</h1>
        <div class="status" id="status">Initializing...</div>
        <div class="timer" id="timer">00:00</div>
        <button onclick="testFunction()">Test Button</button>
        <button onclick="addTestUser()">Add Test User</button>
        <div id="users"></div>

        <script>
            console.log('[TestInspector] HTML loaded, starting timer...');
            
            const startTime = Date.now();
            let userCount = 0;
            
            function updateTimer() {
                const elapsed = Date.now() - startTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                const timeStr = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
                
                const timerElement = document.getElementById('timer');
                if (timerElement) {
                    timerElement.textContent = timeStr;
                    console.log('[TestInspector] Timer updated:', timeStr);
                } else {
                    console.error('[TestInspector] Timer element not found!');
                }
                
                // Update status
                const statusElement = document.getElementById('status');
                if (statusElement) {
                    statusElement.textContent = 'Running for ' + timeStr + ' - Users: ' + userCount;
                }
            }
            
            function testFunction() {
                console.log('[TestInspector] Test button clicked');
                alert('Test button working! Timer: ' + document.getElementById('timer').textContent);
            }
            
            function addTestUser() {
                userCount++;
                const usersDiv = document.getElementById('users');
                const userDiv = document.createElement('div');
                userDiv.innerHTML = '<p>👤 Test User ' + userCount + ' - Added at ' + document.getElementById('timer').textContent + '</p>';
                usersDiv.appendChild(userDiv);
                console.log('[TestInspector] Added test user', userCount);
            }
            
            // Update status immediately
            document.getElementById('status').textContent = 'Timer starting...';
            
            // Start timer
            console.log('[TestInspector] Starting timer interval...');
            updateTimer(); // Initial call
            const timerInterval = setInterval(updateTimer, 1000);
            
            console.log('[TestInspector] Timer interval started, ID:', timerInterval);
        </script>
    </body>
    </html>`;
  }
}