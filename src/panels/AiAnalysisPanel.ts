// src/panels/AiAnalysisPanel.ts
import * as vscode from 'vscode';

export class AiAnalysisPanel {
  public static current: AiAnalysisPanel | undefined;
  public panel: vscode.WebviewPanel;
  private static context: vscode.ExtensionContext;

  constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(this.handleWebviewMessage.bind(this));
    this.panel.onDidDispose(() => { 
      AiAnalysisPanel.current = undefined; 
    });
    
    // Restore previous session data if available
    this.restoreSessionData();
  }

  public static setContext(context: vscode.ExtensionContext) {
    AiAnalysisPanel.context = context;
  }

  public static create() {
    if (AiAnalysisPanel.current) { 
      AiAnalysisPanel.current.panel.reveal(); 
      return; 
    }
    
    const panel = vscode.window.createWebviewPanel(
      'conaint-ai-analysis', 
      'CONAINT AI - Cheating Detection', 
      vscode.ViewColumn.Two, 
      { 
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true
      }
    );
    
    AiAnalysisPanel.current = new AiAnalysisPanel(panel);
  }

  private async handleWebviewMessage(message: any) {
    if (message.command === 'analyzeJson') {
      await this.analyzeSessionData(message.jsonData);
    }
    
    if (message.command === 'checkApiKey') {
      // Check if API token is configured
      const config = vscode.workspace.getConfiguration('conaint');
      const apiToken = config.get<string>('huggingfaceApiToken');
      this.panel.webview.postMessage({
        command: 'apiKeyStatus',
        hasKey: !!apiToken
      });
    }
    
    if (message.command === 'openSettings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'conaint.huggingfaceApiToken');
    }

    if (message.command === 'saveSessionData') {
      this.saveSessionData(message.data);
    }

    if (message.command === 'loadSessionData') {
      this.sendStoredSessionData();
    }

    if (message.command === 'clearSessionData') {
      this.clearSessionData();
    }
  }

  private restoreSessionData() {
    // Send stored session data to webview after a short delay to ensure webview is ready
    setTimeout(() => {
      this.sendStoredSessionData();
    }, 100);
  }

  private sendStoredSessionData() {
    if (!AiAnalysisPanel.context) return;
    
    const storedAnalyses = AiAnalysisPanel.context.globalState.get('aiAnalysis.analyses', []);
    const storedSessions = AiAnalysisPanel.context.globalState.get('aiAnalysis.sessions', []);
    
    this.panel.webview.postMessage({
      command: 'restoreSessionData',
      analyses: storedAnalyses,
      sessions: storedSessions
    });
  }

  private saveSessionData(data: any) {
    if (!AiAnalysisPanel.context) return;
    
    // Get existing data
    const existingAnalyses = AiAnalysisPanel.context.globalState.get('aiAnalysis.analyses', []) as any[];
    const existingSessions = AiAnalysisPanel.context.globalState.get('aiAnalysis.sessions', []) as any[];
    
    // Add new data
    if (data.analysis) {
      existingAnalyses.push({
        timestamp: Date.now(),
        analysis: data.analysis,
        sessionId: data.sessionId || 'unknown'
      });
      
      // Keep only last 10 analyses to prevent storage bloat
      if (existingAnalyses.length > 10) {
        existingAnalyses.splice(0, existingAnalyses.length - 10);
      }
    }
    
    if (data.sessionData) {
      existingSessions.push({
        timestamp: Date.now(),
        sessionData: data.sessionData,
        sessionId: data.sessionId || 'unknown'
      });
      
      // Keep only last 5 sessions to prevent storage bloat
      if (existingSessions.length > 5) {
        existingSessions.splice(0, existingSessions.length - 5);
      }
    }
    
    // Save to storage
    AiAnalysisPanel.context.globalState.update('aiAnalysis.analyses', existingAnalyses);
    AiAnalysisPanel.context.globalState.update('aiAnalysis.sessions', existingSessions);
  }

  private clearSessionData() {
    if (!AiAnalysisPanel.context) return;
    
    AiAnalysisPanel.context.globalState.update('aiAnalysis.analyses', []);
    AiAnalysisPanel.context.globalState.update('aiAnalysis.sessions', []);
    
    this.panel.webview.postMessage({
      command: 'sessionDataCleared'
    });
  }

  private async analyzeSessionData(jsonData: string) {
    try {
      this.panel.webview.postMessage({
        command: 'analysisStarted'
      });

      // Get API token from VS Code configuration
      const config = vscode.workspace.getConfiguration('conaint');
      const apiToken = config.get<string>('huggingfaceApiToken');
      
      if (!apiToken) {
        this.panel.webview.postMessage({
          command: 'analysisError',
          error: 'Please configure your Hugging Face API token in VS Code settings (conaint.huggingfaceApiToken). Get a free token from https://huggingface.co/settings/tokens'
        });
        return;
      }

      // Parse the session data
      let sessionData;
      try {
        sessionData = JSON.parse(jsonData);
      } catch (e) {
        this.panel.webview.postMessage({
          command: 'analysisError',
          error: 'Invalid JSON format. Please paste valid session export data.'
        });
        return;
      }

      // Call Hugging Face API with fallback to rule-based analysis
      let analysis;
      try {
        analysis = await this.callHuggingFaceAPI(apiToken, sessionData);
      } catch (aiError) {
        console.warn('AI API failed, using rule-based analysis:', aiError);
        analysis = this.performRuleBasedAnalysis(sessionData);
      }
      
      // Generate a session ID for tracking
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      // Save analysis results automatically
      this.saveSessionData({
        analysis: analysis,
        sessionData: sessionData,
        sessionId: sessionId
      });
      
      this.panel.webview.postMessage({
        command: 'analysisComplete',
        analysis: analysis,
        sessionId: sessionId
      });

    } catch (error) {
      this.panel.webview.postMessage({
        command: 'analysisError',
        error: 'Analysis failed: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  }

  
    private async callHuggingFaceAPI(apiToken: string, sessionData: any): Promise<string> {
    const prompt = this.generateAnalysisPrompt(sessionData);
    
    // Use GPT-2 large - works with basic HF tokens and completely free
    const response = await fetch('https://api-inference.huggingface.co/models/gpt2-large', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 800,
          temperature: 0.8,
          do_sample: true,
          return_full_text: false,
          pad_token_id: 50256
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Handle different response formats
    if (Array.isArray(data) && data.length > 0) {
      return data[0].generated_text || 'No analysis generated';
    } else if (data.generated_text) {
      return data.generated_text;
    } else {
      throw new Error('Unexpected response format from Hugging Face API');
    }
  }


  private performRuleBasedAnalysis(sessionData: any): string {
    const events = sessionData.events || [];
    const sessionInfo = sessionData.sessionInfo || {};
    
    // Group events by user
    const userActivities: { [userId: string]: any[] } = {};
    events.forEach((event: any) => {
      if (!userActivities[event.userId]) {
        userActivities[event.userId] = [];
      }
      userActivities[event.userId].push(event);
    });

    let report = `# 🔍 CONAINT AI ANALYSIS REPORT\n\n`;
    report += `**Session Overview:**\n`;
    report += `- Duration: ${sessionInfo.duration || 'Unknown'} seconds\n`;
    report += `- Total Events: ${events.length}\n`;
    report += `- Number of Students: ${Object.keys(userActivities).length}\n\n`;

    const suspiciousStudents: string[] = [];
    const normalStudents: string[] = [];

    Object.entries(userActivities).forEach(([userId, activities]) => {
      const keystrokes = activities.filter(a => a.type === 'telemetry.keystroke').length;
      const pastes = activities.filter(a => a.type === 'telemetry.paste').length;
      const fileChanges = activities.filter(a => a.type === 'telemetry.openfile').length;
      const focusChanges = activities.filter(a => a.type === 'telemetry.focus').length;

      let suspicionScore = 0;
      const flags: string[] = [];

      // Rule 1: Excessive pasting (>5 paste operations)
      if (pastes > 5) {
        suspicionScore += 3;
        flags.push(`🚩 Excessive pasting: ${pastes} paste operations`);
      }

      // Rule 2: Very low typing to paste ratio
      if (pastes > 0 && keystrokes / pastes < 10) {
        suspicionScore += 2;
        flags.push(`🚩 Low typing-to-paste ratio: ${Math.round(keystrokes / pastes)} keystrokes per paste`);
      }

      // Rule 3: Excessive file switching (>15 file changes)
      if (fileChanges > 15) {
        suspicionScore += 2;
        flags.push(`🚩 Excessive file switching: ${fileChanges} file changes`);
      }

      // Rule 4: Too many focus changes (leaving VS Code often)
      if (focusChanges > 20) {
        suspicionScore += 2;
        flags.push(`🚩 Frequent focus changes: ${focusChanges} times (possibly using external resources)`);
      }

      // Rule 5: Very low activity overall
      if (activities.length < 10 && sessionInfo.duration > 300) {
        suspicionScore += 1;
        flags.push(`⚠️ Very low activity: Only ${activities.length} events in ${Math.round(sessionInfo.duration / 60)} minutes`);
      }

      // Determine suspicion level
      let suspicionLevel = 'Normal';
      if (suspicionScore >= 5) {
        suspicionLevel = 'Highly Suspicious';
        suspiciousStudents.push(userId);
      } else if (suspicionScore >= 3) {
        suspicionLevel = 'Suspicious';
        suspiciousStudents.push(userId);
      } else {
        normalStudents.push(userId);
      }

      report += `## 👤 STUDENT: ${userId}\n`;
      report += `**Behavior Assessment:** ${suspicionLevel} (Score: ${suspicionScore}/10)\n`;
      report += `**Statistics:**\n`;
      report += `- Total Activities: ${activities.length}\n`;
      report += `- Typing Events: ${keystrokes}\n`;
      report += `- Paste Operations: ${pastes}\n`;
      report += `- File Switches: ${fileChanges}\n`;
      report += `- Focus Changes: ${focusChanges}\n`;

      if (flags.length > 0) {
        report += `**Red Flags:**\n`;
        flags.forEach(flag => report += `- ${flag}\n`);
      } else {
        report += `**Status:** ✅ No suspicious patterns detected\n`;
      }
      report += `\n`;
    });

    // Summary
    report += `## 📊 EXECUTIVE SUMMARY\n\n`;
    if (suspiciousStudents.length > 0) {
      report += `⚠️ **${suspiciousStudents.length} student(s) flagged for suspicious behavior:**\n`;
      suspiciousStudents.forEach(student => report += `- ${student}\n`);
    } else {
      report += `✅ **No students flagged for suspicious behavior**\n`;
    }

    report += `\n## 🎯 RECOMMENDATIONS\n\n`;
    if (suspiciousStudents.length > 0) {
      report += `1. **Immediate Review Required:** Investigate flagged students manually\n`;
      report += `2. **Follow-up:** Review their submitted code for plagiarism\n`;
      report += `3. **Interview:** Consider one-on-one discussions with flagged students\n`;
    } else {
      report += `1. **All Clear:** No immediate concerns detected\n`;
      report += `2. **Continue Monitoring:** Keep observing future sessions\n`;
    }

    report += `\n---\n*Analysis performed using CONAINT AI advanced detection algorithms*`;

    return report;
  }

  private generateAnalysisPrompt(sessionData: any): string {
    const events = sessionData.events || [];
    const sessionInfo = sessionData.sessionInfo || {};
    
    // Group events by user
    const userActivities: { [userId: string]: any[] } = {};
    events.forEach((event: any) => {
      if (!userActivities[event.userId]) {
        userActivities[event.userId] = [];
      }
      userActivities[event.userId].push(event);
    });

    const userAnalysis = Object.entries(userActivities).map(([userId, activities]) => {
      const keystrokes = activities.filter(a => a.type === 'telemetry.keystroke').length;
      const pastes = activities.filter(a => a.type === 'telemetry.paste').length;
      const fileChanges = activities.filter(a => a.type === 'telemetry.openfile').length;
      const focusChanges = activities.filter(a => a.type === 'telemetry.focus').length;
      
      return `
STUDENT: ${userId}
- Total Activities: ${activities.length}
- Typing Events: ${keystrokes}
- Paste Operations: ${pastes}
- File Switches: ${fileChanges}
- Focus Changes: ${focusChanges}
- Activity Timeline: ${activities.slice(0, 10).map(a => `${new Date(a.ts).toLocaleTimeString()}: ${a.type}`).join(', ')}`;
    }).join('');

    const prompt = `You are an expert educational supervisor analyzing VS Code session data to detect potential cheating or suspicious behavior during a programming exam/assignment.

SESSION INFORMATION:
- Duration: ${sessionInfo.duration || 'Unknown'} seconds
- Total Events: ${events.length}
- Number of Students: ${Object.keys(userActivities).length}

STUDENT ACTIVITY DATA:${userAnalysis}

ANALYSIS REQUEST:
Please analyze this data and provide a comprehensive report in the following format:

1. **EXECUTIVE SUMMARY**
   - Overall assessment of the session
   - Number of students flagged for suspicious behavior
   - Key findings

2. **INDIVIDUAL STUDENT ANALYSIS**
   For each student, provide:
   - Behavior assessment (Normal/Suspicious/Highly Suspicious)
   - Specific red flags or concerning patterns
   - Cheating probability (Low/Medium/High)
   - Detailed explanation

3. **SUSPICIOUS BEHAVIOR PATTERNS DETECTED**
   - Excessive copy-pasting (>5 paste operations)
   - Rapid file switching (>10 file changes)
   - Minimal typing with high output
   - Frequent focus changes (leaving VS Code often)
   - Unusual activity timing patterns

4. **RECOMMENDATIONS**
   - Students requiring immediate review
   - Follow-up actions recommended
   - Additional monitoring suggestions

5. **DETAILED EVIDENCE**
   - Specific timestamps and activities that raise concerns
   - Comparison between students
   - Statistical analysis

Please be thorough, objective, and provide specific evidence for any claims of suspicious behavior. Focus on patterns that suggest external assistance, plagiarism, or unauthorized resource usage.`;

    return prompt;
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>CONAINT AI - Cheating Detection</title>
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
            padding-bottom: 15px;
            border-bottom: 2px solid var(--vscode-editorWidget-border);
        }
        .title {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .ai-icon {
            font-size: 24px;
        }
        .controls {
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .btn:hover {
            opacity: 0.8;
        }
        .btn-primary {
            background: #007acc;
            color: white;
        }
        .btn-secondary {
            background: var(--vscode-editorWidget-background);
            color: var(--vscode-editor-foreground);
            border: 1px solid var(--vscode-editorWidget-border);
        }
        .input-section {
            margin-bottom: 20px;
            padding: 20px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 8px;
        }
        .input-section h3 {
            margin-top: 0;
            color: var(--vscode-editor-foreground);
        }
        .textarea {
            width: 100%;
            min-height: 200px;
            padding: 12px;
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 4px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: 'Courier New', monospace;
            font-size: 12px;
            resize: vertical;
        }
        .analysis-section {
            margin-top: 20px;
            padding: 20px;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 8px;
        }
        .loading {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 20px;
            color: #007acc;
        }
        .loading .spinner {
            width: 20px;
            height: 20px;
            border: 2px solid #007acc;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .error {
            padding: 15px;
            background: #d32f2f;
            color: white;
            border-radius: 6px;
            margin: 10px 0;
        }
        .success {
            padding: 15px;
            background: #2e7d32;
            color: white;
            border-radius: 6px;
            margin: 10px 0;
        }
        .api-status {
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .api-status.configured {
            background: #e8f5e8;
            color: #2e7d32;
            border: 1px solid #4caf50;
        }
        .api-status.not-configured {
            background: #ffebee;
            color: #c62828;
            border: 1px solid #f44336;
        }
        .analysis-result {
            white-space: pre-wrap;
            line-height: 1.6;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .instructions {
            background: #fff3cd;
            color: #856404;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #ffeaa7;
        }
        .instructions h4 {
            margin-top: 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">
            <span class="ai-icon">🤖</span>
            <h2>CONAINT AI - Cheating Detection</h2>
        </div>
    </div>

    <div id="apiStatus" class="api-status">
        <span>Checking API configuration...</span>
    </div>



    <div class="input-section">
        <h3>📁 Session Data Input</h3>
        <textarea id="jsonInput" class="textarea" placeholder="Paste your exported session JSON data here...

Example format:
{
  &quot;sessionInfo&quot;: {
    &quot;duration&quot;: 1800,
    &quot;users&quot;: 3,
    &quot;events&quot;: 150
  },
  &quot;events&quot;: [
    {
      &quot;userId&quot;: &quot;student_001&quot;,
      &quot;type&quot;: &quot;telemetry.keystroke&quot;,
      &quot;payload&quot;: {...},
      &quot;ts&quot;: 1703123456789
    }
  ]
}"></textarea>
        <div style="margin-top: 10px;">
            <button id="analyzeBtn" class="btn btn-primary" disabled>🔍 Analyze Session</button>
            <button id="clearBtn" class="btn btn-secondary">🗑️ Clear</button>
        </div>
    </div>

    <div id="analysisSection" class="analysis-section" style="display: none;">
        <h3>📊 Analysis Results</h3>
        <div id="analysisContent"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Check API key status on load
        vscode.postMessage({ command: 'checkApiKey' });

        // Button handlers
        document.getElementById('analyzeBtn').onclick = function() {
            const jsonData = document.getElementById('jsonInput').value.trim();
            if (!jsonData) {
                alert('Please paste session JSON data first');
                return;
            }
            
            vscode.postMessage({
                command: 'analyzeJson',
                jsonData: jsonData
            });
        };

        document.getElementById('clearBtn').onclick = function() {
            document.getElementById('jsonInput').value = '';
            document.getElementById('analysisSection').style.display = 'none';
            updateAnalyzeButton();
        };



        // Update analyze button state
        function updateAnalyzeButton() {
            const hasText = document.getElementById('jsonInput').value.trim().length > 0;
            const hasApiKey = document.querySelector('.api-status.configured') !== null;
            document.getElementById('analyzeBtn').disabled = !hasText || !hasApiKey;
        }

        document.getElementById('jsonInput').oninput = updateAnalyzeButton;

        // Request stored data on load
        vscode.postMessage({ command: 'loadSessionData' });

        // Message handler
        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'apiKeyStatus') {
                const statusEl = document.getElementById('apiStatus');
                if (message.hasKey) {
                    statusEl.className = 'api-status configured';
                    statusEl.innerHTML = '<span>✅ CONAINT AI Ready - Powered by Advanced Analytics</span>';
                } else {
                    statusEl.className = 'api-status not-configured';
                    statusEl.innerHTML = '<span>❌ CONAINT AI not available</span>';
                }
                updateAnalyzeButton();
            }
            
            if (message.command === 'analysisStarted') {
                document.getElementById('analysisSection').style.display = 'block';
                document.getElementById('analysisContent').innerHTML = \`
                    <div class="loading">
                        <div class="spinner"></div>
                        <span>CONAINT AI is analyzing session data... This may take 30-60 seconds.</span>
                    </div>
                \`;
            }
            
            if (message.command === 'analysisComplete') {
                document.getElementById('analysisContent').innerHTML = \`
                    <div class="success">✅ CONAINT AI Analysis completed successfully! <small>(Auto-saved)</small></div>
                    <div class="analysis-result">\${message.analysis}</div>
                \`;
            }
            
            if (message.command === 'analysisError') {
                document.getElementById('analysisSection').style.display = 'block';
                document.getElementById('analysisContent').innerHTML = \`
                    <div class="error">❌ \${message.error}</div>
                \`;
            }

            if (message.command === 'restoreSessionData') {
                restoreStoredData(message.analyses, message.sessions);
            }

            if (message.command === 'sessionDataCleared') {
                document.getElementById('analysisSection').style.display = 'none';
                showNotification('✅ All stored analysis data cleared', 'success');
            }
        });

        // Function to restore stored data
        function restoreStoredData(analyses, sessions) {
            if (analyses && analyses.length > 0) {
                const lastAnalysis = analyses[analyses.length - 1];
                document.getElementById('analysisSection').style.display = 'block';
                document.getElementById('analysisContent').innerHTML = \`
                    <div class="success">📁 Restored from previous session (\${new Date(lastAnalysis.timestamp).toLocaleString()})</div>
                    <div class="analysis-result">\${lastAnalysis.analysis}</div>
                    <div style="margin-top: 15px;">
                        <button onclick="showAnalysisHistory()" class="btn btn-secondary">📚 Show Analysis History (\${analyses.length})</button>
                        <button onclick="clearStoredData()" class="btn btn-secondary" style="margin-left: 10px;">🗑️ Clear All Stored Data</button>
                    </div>
                \`;
                
                // Store data for history viewing
                window.storedAnalyses = analyses;
                window.storedSessions = sessions;
            }
        }

        // Function to show analysis history
        function showAnalysisHistory() {
            if (!window.storedAnalyses) return;
            
            let historyHtml = '<div class="analysis-history"><h4>📚 Analysis History</h4>';
            window.storedAnalyses.forEach((analysis, index) => {
                historyHtml += \`
                    <div class="history-item" style="border: 1px solid var(--vscode-editorWidget-border); margin: 10px 0; padding: 15px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <strong>Analysis #\${index + 1}</strong>
                            <small>\${new Date(analysis.timestamp).toLocaleString()}</small>
                        </div>
                        <div class="analysis-result" style="max-height: 200px; overflow-y: auto;">\${analysis.analysis}</div>
                    </div>
                \`;
            });
            historyHtml += '</div>';
            
            document.getElementById('analysisContent').innerHTML = historyHtml;
        }

        // Function to clear stored data
        function clearStoredData() {
            if (confirm('Are you sure you want to clear all stored analysis data? This cannot be undone.')) {
                vscode.postMessage({ command: 'clearSessionData' });
            }
        }

        // Function to show notifications
        function showNotification(message, type) {
            const notification = document.createElement('div');
            notification.className = type === 'success' ? 'success' : 'error';
            notification.textContent = message;
            notification.style.position = 'fixed';
            notification.style.top = '20px';
            notification.style.right = '20px';
            notification.style.zIndex = '1000';
            notification.style.maxWidth = '300px';
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 3000);
        }
    </script>
</body>
</html>`;
  }
}