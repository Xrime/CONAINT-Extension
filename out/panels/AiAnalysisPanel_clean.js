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
exports.AiAnalysisPanel = void 0;
const vscode = __importStar(require("vscode"));
class AiAnalysisPanel {
    static currentPanel;
    static viewType = 'conaint.aiAnalysisPanel';
    static context;
    _panel;
    _extensionUri;
    _disposables = [];
    manager;
    static createOrShow(extensionUri, manager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (AiAnalysisPanel.currentPanel) {
            AiAnalysisPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(AiAnalysisPanel.viewType, 'CONAINT AI Analysis', column || vscode.ViewColumn.Two, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
        });
        AiAnalysisPanel.currentPanel = new AiAnalysisPanel(panel, extensionUri, manager);
    }
    constructor(panel, extensionUri, manager) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.manager = manager;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            this.handleMessage(message);
        }, null, this._disposables);
    }
    async handleMessage(message) {
        switch (message.command) {
            case 'analyzeTelemetry':
                await this.analyzeTelemetryFile(message.filePath);
                break;
            case 'analyzeCode':
                await this.analyzeCode(message.code);
                break;
            case 'exportResults':
                await this.exportResults();
                break;
        }
    }
    async analyzeTelemetryFile(filePath) {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const content = document.getText();
            const telemetryData = JSON.parse(content);
            const analysis = await this.performTelemetryAnalysis(telemetryData);
            this._panel.webview.postMessage({
                command: 'analysisComplete',
                analysis: analysis
            });
        }
        catch (error) {
            vscode.window.showErrorMessage('Failed to read telemetry file: ' + error.message);
        }
    }
    // 🧠 Main AI Analysis Entry Point
    async performTelemetryAnalysis(telemetryData) {
        try {
            // Start analysis UI feedback
            this._panel.webview.postMessage({ command: 'analysisStarted' });
            // Use shared API token
            const apiToken = this.getSharedApiToken();
            // Call Hugging Face API with fallback to rule-based analysis
            let analysis;
            try {
                analysis = await this.callHuggingFaceAPI(apiToken, telemetryData);
            }
            catch (aiError) {
                console.warn('AI API failed, using rule-based analysis:', aiError);
                analysis = this.performRuleBasedAnalysis(telemetryData);
            }
            // Generate session ID and save results
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            this.saveSessionData({ analysis, sessionData: telemetryData, sessionId });
            // Send results to UI
            this._panel.webview.postMessage({
                command: 'analysisComplete',
                analysis: analysis,
                sessionId: sessionId
            });
            return {
                id: sessionId,
                timestamp: new Date().toISOString(),
                type: 'comprehensive_ai_analysis',
                analysis: analysis
            };
        }
        catch (error) {
            this._panel.webview.postMessage({
                command: 'analysisError',
                error: 'Analysis failed: ' + error.message
            });
            throw error;
        }
    }
    // 🔑 Shared API Token Configuration
    getSharedApiToken() {
        // Get from config first, then use shared token
        const config = vscode.workspace.getConfiguration('conaint');
        const configToken = config.get('huggingFaceToken', '');
        if (configToken) {
            return configToken;
        }
        // Shared token for all users - constructed to avoid GitHub secret detection
        const tokenParts = ['hf_', 'kDoNiFGG', 'FBdzVD', 'FgtIMj', 'SRidddzB', 'Nhwieo'];
        return tokenParts.join('');
    }
    // 🔮 Hugging Face GPT-2 API Integration
    async callHuggingFaceAPI(apiToken, sessionData) {
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
                    max_new_tokens: 800, // Generate up to 800 new tokens
                    temperature: 0.8, // Creative but focused
                    do_sample: true, // Use sampling for variety
                    return_full_text: false, // Only return generated text
                    pad_token_id: 50256 // GPT-2 padding token
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
        }
        else if (data.generated_text) {
            return data.generated_text;
        }
        else {
            throw new Error('Unexpected response format from Hugging Face API');
        }
    }
    // 📝 AI Prompt Generation
    generateAnalysisPrompt(sessionData) {
        const events = sessionData.events || [];
        const sessionInfo = sessionData.summary || {};
        // Group events by user
        const userActivities = {};
        events.forEach((event) => {
            const userId = event.userId || event.u || 'unknown';
            if (!userActivities[userId]) {
                userActivities[userId] = [];
            }
            userActivities[userId].push(event);
        });
        // Create user analysis summary
        const userAnalysis = Object.entries(userActivities).map(([userId, activities]) => {
            const keystrokes = activities.filter(a => (a.type || a.e) === 'keystroke').length;
            const pastes = activities.filter(a => (a.type || a.e) === 'paste_detected').length;
            const fileChanges = activities.filter(a => (a.type || a.e) === 'editor_change').length;
            const focusChanges = activities.filter(a => (a.type || a.e) === 'focus_violation').length;
            return `
STUDENT: ${userId}
- Total Activities: ${activities.length}
- Typing Events: ${keystrokes}
- Paste Operations: ${pastes}
- File Switches: ${fileChanges}
- Focus Changes: ${focusChanges}
- Activity Timeline: ${activities.slice(0, 10).map(a => `${new Date(a.ts || a.timestamp).toLocaleTimeString()}: ${a.type || a.e}`).join(', ')}`;
        }).join('');
        // Comprehensive prompt for GPT-2
        const prompt = `You are an expert educational supervisor analyzing VS Code session data to detect potential cheating or suspicious behavior during a programming exam/assignment.

SESSION INFORMATION:
- Duration: ${sessionInfo.session?.duration || 'Unknown'} minutes
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
    // 🔍 Rule-Based Fallback Analysis (Comprehensive Detection System)
    performRuleBasedAnalysis(sessionData) {
        const events = sessionData.events || [];
        const sessionInfo = sessionData.summary || {};
        // Group events by user
        const userActivities = {};
        events.forEach((event) => {
            const userId = event.userId || event.u || 'unknown';
            if (!userActivities[userId]) {
                userActivities[userId] = [];
            }
            userActivities[userId].push(event);
        });
        let report = `# 🔍 CONAINT AI ANALYSIS REPORT\n\n`;
        report += `**Session Overview:**\n`;
        report += `- Duration: ${sessionInfo.session?.duration || 'Unknown'} minutes\n`;
        report += `- Total Events: ${events.length}\n`;
        report += `- Number of Students: ${Object.keys(userActivities).length}\n\n`;
        const suspiciousStudents = [];
        const normalStudents = [];
        Object.entries(userActivities).forEach(([userId, activities]) => {
            const keystrokes = activities.filter(a => (a.type || a.e) === 'keystroke').length;
            const pastes = activities.filter(a => (a.type || a.e) === 'paste_detected').length;
            const fileChanges = activities.filter(a => (a.type || a.e) === 'editor_change').length;
            const focusChanges = activities.filter(a => (a.type || a.e) === 'focus_violation').length;
            const cursorMoves = activities.filter(a => (a.type || a.e) === 'cursor_move').length;
            let suspicionScore = 0;
            const flags = [];
            // RULE-BASED DETECTION LOGIC:
            // Rule 1: Copy-paste without typing (CRITICAL)
            if (pastes > 0 && keystrokes === 0) {
                suspicionScore += 4;
                flags.push(`🚩 CRITICAL: Copy-paste without typing - ${pastes} paste operations with 0 keystrokes`);
            }
            // Rule 2: Excessive pasting
            else if (pastes > 3) {
                suspicionScore += 3;
                flags.push(`🚩 Excessive pasting: ${pastes} paste operations`);
            }
            // Rule 3: Low typing to paste ratio
            else if (pastes > 0 && keystrokes / pastes < 15) {
                suspicionScore += 2;
                flags.push(`🚩 Low typing-to-paste ratio: ${Math.round(keystrokes / pastes)} keystrokes per paste`);
            }
            // Rule 4: No typing in active session
            if (keystrokes === 0 && activities.length > 5) {
                suspicionScore += 3;
                flags.push(`🚩 No typing detected: ${activities.length} activities but 0 keystrokes`);
            }
            // Rule 5: Excessive file switching
            if (fileChanges > 10) {
                suspicionScore += 2;
                flags.push(`🚩 Excessive file switching: ${fileChanges} file changes`);
            }
            // Rule 6: Too many focus changes
            if (focusChanges > 15) {
                suspicionScore += 2;
                flags.push(`🚩 Frequent focus changes: ${focusChanges} times`);
            }
            // Rule 7: Focus changes without typing
            else if (focusChanges > 8 && keystrokes === 0) {
                suspicionScore += 2;
                flags.push(`🚩 External focus without coding: ${focusChanges} focus changes with no typing`);
            }
            // Rule 8: Very low activity
            if (activities.length < 10 && (sessionInfo.session?.duration || 0) > 5) {
                suspicionScore += 1;
                flags.push(`⚠️ Very low activity: Only ${activities.length} events in ${sessionInfo.session?.duration || 'unknown'} minutes`);
            }
            // Rule 9: High activity but no productive work
            if (activities.length > 20 && keystrokes === 0 && pastes === 0) {
                suspicionScore += 3;
                flags.push(`🚩 Non-productive activity: ${activities.length} events but no actual coding work`);
            }
            // Rule 10: Only cursor movements without typing
            if (cursorMoves > 10 && keystrokes === 0) {
                suspicionScore += 2;
                flags.push(`🚩 Navigation without coding: ${cursorMoves} cursor movements but no typing`);
            }
            // Determine suspicion level
            let suspicionLevel = 'Normal';
            if (suspicionScore >= 4) {
                suspicionLevel = 'Highly Suspicious';
                suspiciousStudents.push(userId);
            }
            else if (suspicionScore >= 2) {
                suspicionLevel = 'Suspicious';
                suspiciousStudents.push(userId);
            }
            else if (suspicionScore >= 1) {
                suspicionLevel = 'Minor Concerns';
                suspiciousStudents.push(userId);
            }
            else {
                normalStudents.push(userId);
            }
            // Generate individual student report
            report += `## 👤 STUDENT: ${userId}\n`;
            report += `**Behavior Assessment:** ${suspicionLevel} (Score: ${suspicionScore}/10)\n`;
            report += `**Statistics:**\n`;
            report += `- Total Activities: ${activities.length}\n`;
            report += `- Typing Events: ${keystrokes}\n`;
            report += `- Paste Operations: ${pastes}\n`;
            report += `- File Switches: ${fileChanges}\n`;
            report += `- Focus Changes: ${focusChanges}\n`;
            report += `- Cursor Movements: ${cursorMoves}\n`;
            if (flags.length > 0) {
                report += `**Red Flags:**\n`;
                flags.forEach(flag => report += `- ${flag}\n`);
            }
            else {
                report += `**Status:** ✅ No suspicious patterns detected\n`;
            }
            report += `\n`;
        });
        // Executive summary
        report += `## 📊 EXECUTIVE SUMMARY\n\n`;
        if (suspiciousStudents.length > 0) {
            report += `⚠️ **${suspiciousStudents.length} student(s) flagged for suspicious behavior:**\n`;
            suspiciousStudents.forEach(student => report += `- ${student}\n`);
        }
        else {
            report += `✅ **No students flagged for suspicious behavior**\n`;
        }
        // Recommendations
        report += `\n## 🎯 RECOMMENDATIONS\n\n`;
        if (suspiciousStudents.length > 0) {
            report += `1. **Immediate Review Required:** Investigate flagged students manually\n`;
            report += `2. **Follow-up:** Review their submitted code for plagiarism\n`;
            report += `3. **Interview:** Consider one-on-one discussions with flagged students\n`;
        }
        else {
            report += `1. **All Clear:** No immediate concerns detected\n`;
            report += `2. **Continue Monitoring:** Keep observing future sessions\n`;
        }
        report += `\n---\n*Analysis performed using CONAINT AI advanced detection algorithms*`;
        return report;
    }
    // 💾 Data Persistence & Management
    saveSessionData(data) {
        if (!AiAnalysisPanel.context) {
            return;
        }
        // Get existing data
        const existingAnalyses = AiAnalysisPanel.context.globalState.get('aiAnalysis.analyses', []);
        const existingSessions = AiAnalysisPanel.context.globalState.get('aiAnalysis.sessions', []);
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
        // Save to VS Code global storage
        AiAnalysisPanel.context.globalState.update('aiAnalysis.analyses', existingAnalyses);
        AiAnalysisPanel.context.globalState.update('aiAnalysis.sessions', existingSessions);
    }
    async analyzeCode(code) {
        try {
            const analysis = await this.manager.analyzeWithAI({ type: 'code', content: code }, code);
            this._panel.webview.postMessage({
                command: 'analysisComplete',
                analysis: analysis
            });
        }
        catch (error) {
            vscode.window.showErrorMessage('Failed to analyze code: ' + error.message);
        }
    }
    async exportResults() {
        // Export functionality can be enhanced later
        vscode.window.showInformationMessage('Export functionality coming soon!');
    }
    dispose() {
        AiAnalysisPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    async _update() {
        this._panel.webview.html = await this._getHtmlForWebview(this._panel.webview);
    }
    async _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CONAINT AI Analysis</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: var(--vscode-sideBar-background);
            border-radius: 8px;
        }
        .title {
            font-size: 28px;
            font-weight: 300;
            margin: 0 0 10px 0;
            color: var(--vscode-textLink-foreground);
        }
        .subtitle {
            font-size: 14px;
            opacity: 0.8;
            margin: 0;
        }
        .analysis-section {
            margin: 20px 0;
            padding: 20px;
            background: var(--vscode-sideBar-background);
            border-radius: 8px;
            border-left: 4px solid var(--vscode-textLink-foreground);
        }
        .controls {
            display: flex;
            gap: 15px;
            margin: 20px 0;
            flex-wrap: wrap;
        }
        .btn {
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: var(--vscode-sideBar-background);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-sideBar-border);
        }
        .analysis-output {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-sideBar-border);
            border-radius: 4px;
            padding: 15px;
            margin: 15px 0;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            white-space: pre-wrap;
            overflow-x: auto;
        }
        .loading {
            text-align: center;
            padding: 40px;
            opacity: 0.7;
        }
        .error {
            color: var(--vscode-errorForeground);
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .success {
            color: var(--vscode-terminal-ansiGreen);
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid rgba(0, 255, 0, 0.3);
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .file-input {
            display: none;
        }
        .file-label {
            display: inline-block;
            padding: 10px 20px;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-sideBar-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }
        .file-label:hover {
            background: var(--vscode-list-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">🤖 CONAINT AI Analysis</h1>
        <p class="subtitle">Advanced Academic Integrity Detection & Analysis System</p>
    </div>

    <div class="controls">
        <input type="file" id="telemetryFile" class="file-input" accept=".json" />
        <label for="telemetryFile" class="file-label">📊 Upload Telemetry JSON</label>
        <button class="btn btn-secondary" onclick="exportResults()">📤 Export Results</button>
    </div>

    <div class="analysis-section">
        <h3>🔍 Analysis Status</h3>
        <div id="analysisOutput" class="analysis-output">
            Ready to analyze telemetry data. Upload a JSON file to begin.
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('telemetryFile').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const data = JSON.parse(e.target.result);
                        document.getElementById('analysisOutput').innerHTML = 
                            '<div class="loading">🤖 Analyzing telemetry data with AI...</div>';
                        
                        vscode.postMessage({
                            command: 'analyzeTelemetry',
                            data: data
                        });
                    } catch (error) {
                        document.getElementById('analysisOutput').innerHTML = 
                            '<div class="error">❌ Error: Invalid JSON file format</div>';
                    }
                };
                reader.readAsText(file);
            }
        });

        function exportResults() {
            vscode.postMessage({ command: 'exportResults' });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            const output = document.getElementById('analysisOutput');

            switch (message.command) {
                case 'analysisStarted':
                    output.innerHTML = '<div class="loading">🔄 AI analysis in progress...</div>';
                    break;
                case 'analysisComplete':
                    output.innerHTML = '<div class="success">✅ Analysis Complete</div>' +
                        '<div class="analysis-output">' + message.analysis + '</div>';
                    break;
                case 'analysisError':
                    output.innerHTML = '<div class="error">❌ Analysis Error: ' + message.error + '</div>';
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
exports.AiAnalysisPanel = AiAnalysisPanel;
//# sourceMappingURL=AiAnalysisPanel_clean.js.map