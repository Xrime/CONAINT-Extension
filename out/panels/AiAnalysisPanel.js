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
    static setContext(context) {
        AiAnalysisPanel.context = context;
    }
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
        console.log('🔍 AiAnalysisPanel received message:', message);
        switch (message.command) {
            case 'analyzeTelemetryJSON':
                console.log('📊 Processing analyzeTelemetryJSON command');
                await this.analyzeTelemetryJSON(message.jsonData);
                break;
            case 'analyzeCode':
                console.log('📝 Processing analyzeCode command');
                await this.analyzeCode(message.code);
                break;
            default:
                console.log('❓ Unknown command:', message.command);
        }
    }
    async analyzeTelemetryJSON(jsonString) {
        console.log('🔍 analyzeTelemetryJSON called with data length:', jsonString?.length || 0);
        try {
            console.log('📋 Parsing JSON data...');
            const telemetryData = JSON.parse(jsonString);
            console.log('✅ JSON parsed successfully:', Object.keys(telemetryData));
            const hasData = telemetryData.data || telemetryData.events ||
                Array.isArray(telemetryData) ||
                Object.values(telemetryData).some(val => Array.isArray(val));
            console.log('🔍 Data validation - hasData:', hasData);
            if (!hasData) {
                throw new Error('Invalid JSON format. Expected telemetry data with events array or data property.');
            }
            console.log('🤖 Starting telemetry analysis...');
            const analysis = await this.performRuleBasedAnalysis(telemetryData);
            console.log('✅ Analysis completed');
            console.log('📤 Sending analysis results to webview');
            this._panel.webview.postMessage({
                command: 'analysisComplete',
                analysis: analysis,
                sessionId: 'analysis_' + Date.now()
            });
            console.log('📤 Results sent successfully');
        }
        catch (error) {
            console.error('❌ Telemetry analysis error:', error);
            this._panel.webview.postMessage({
                command: 'analysisError',
                error: 'Failed to analyze JSON: ' + error.message
            });
        }
    }
    performRuleBasedAnalysis(sessionData) {
        let events = [];
        let sessionInfo = {};
        if (sessionData.data && Array.isArray(sessionData.data)) {
            events = sessionData.data;
            sessionInfo = sessionData;
        }
        else if (sessionData.events && Array.isArray(sessionData.events)) {
            events = sessionData.events;
            sessionInfo = sessionData.summary || sessionData;
        }
        else if (Array.isArray(sessionData)) {
            events = sessionData;
        }
        else {
            events = Object.values(sessionData).find(val => Array.isArray(val)) || [];
        }
        const userActivities = {};
        events.forEach((event) => {
            const userId = event.userId || event.u || 'unknown';
            if (!userActivities[userId]) {
                userActivities[userId] = [];
            }
            userActivities[userId].push(event);
        });
        let report = `# 🔍 CONAINT AI ANALYSIS REPORT\\n\\n`;
        report += `**Session Overview:**\\n`;
        report += `- Session ID: ${sessionInfo.sessionId || 'Unknown'}\\n`;
        report += `- Total Events: ${events.length}\\n`;
        report += `- Number of Students: ${Object.keys(userActivities).length}\\n\\n`;
        const suspiciousStudents = [];
        Object.entries(userActivities).forEach(([userId, activities]) => {
            const keystrokes = activities.filter(a => (a.type || a.e) === 'keystroke_activity').length;
            const pastes = activities.filter(a => (a.type || a.e) === 'paste_detected').length;
            const fileChanges = activities.filter(a => (a.type || a.e) === 'editor_change').length;
            const focusChanges = activities.filter(a => {
                const eventType = a.type || a.e;
                return eventType === 'focus_violation' || eventType === 'focus_restoration' || eventType === 'window_focus';
            }).length;
            let suspicionScore = 0;
            const flags = [];
            // Rule-based detection
            if (pastes > 0 && keystrokes === 0) {
                suspicionScore += 4;
                flags.push(`🚩 CRITICAL: Copy-paste without typing - ${pastes} paste operations with 0 keystrokes`);
            }
            if (pastes > 3) {
                suspicionScore += 3;
                flags.push(`🚩 Excessive pasting: ${pastes} paste operations`);
            }
            if (keystrokes === 0 && activities.length > 5) {
                suspicionScore += 3;
                flags.push(`🚩 No typing detected: ${activities.length} activities but 0 keystrokes`);
            }
            if (focusChanges > 10) {
                suspicionScore += 5;
                flags.push(`🚩 Extreme focus volatility: ${focusChanges} changes in a single session`);
            }
            else if (focusChanges > 2) {
                suspicionScore += 4;
                flags.push(`🚩 Frequent focus changes: ${focusChanges} times (threshold > 2)`);
            }
            let suspicionLevel = 'Normal';
            if (suspicionScore >= 6) {
                suspicionLevel = 'Highly Suspicious';
                suspiciousStudents.push(userId);
            }
            else if (suspicionScore >= 2) {
                suspicionLevel = suspicionScore >= 4 ? 'Cheating Suspected' : 'Suspicious';
                suspiciousStudents.push(userId);
            }
            report += `## 👤 STUDENT: ${userId}\\n`;
            report += `**Behavior Assessment:** ${suspicionLevel} (Score: ${suspicionScore}/10)\\n`;
            report += `**Statistics:**\\n`;
            report += `- Total Activities: ${activities.length}\\n`;
            report += `- Typing Events: ${keystrokes}\\n`;
            report += `- Paste Operations: ${pastes}\\n`;
            report += `- File Switches: ${fileChanges}\\n`;
            report += `- Focus Changes: ${focusChanges}\\n`;
            if (flags.length > 0) {
                report += `**Red Flags:**\\n`;
                flags.forEach(flag => report += `- ${flag}\\n`);
            }
            else {
                report += `**Status:** ✅ No suspicious patterns detected\\n`;
            }
            report += `\\n`;
        });
        report += `## 📊 EXECUTIVE SUMMARY\\n\\n`;
        if (suspiciousStudents.length > 0) {
            report += `⚠️ **${suspiciousStudents.length} student(s) flagged for suspicious behavior:**\\n`;
            suspiciousStudents.forEach(student => report += `- ${student}\\n`);
        }
        else {
            report += `✅ **No students flagged for suspicious behavior**\\n`;
        }
        return report;
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
        this._panel.webview.html = this._getHtmlForWebview();
    }
    _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CONAINT AI Analysis</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background-color: var(--vscode-editor-background); padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; padding: 20px; background: var(--vscode-sideBar-background); border-radius: 8px; }
        .title { font-size: 28px; font-weight: 300; margin: 0 0 10px 0; color: var(--vscode-textLink-foreground); }
        .subtitle { font-size: 14px; opacity: 0.8; margin: 0; }
        .json-input-section { margin-bottom: 20px; }
        .json-input-section h3 { margin-bottom: 10px; color: var(--vscode-foreground); }
        #jsonInput { width: 100%; min-height: 200px; padding: 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-family: var(--vscode-editor-font-family); resize: vertical; margin-bottom: 10px; }
        .btn { padding: 10px 20px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-right: 10px; }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn-secondary { background: var(--vscode-sideBar-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-sideBar-border); }
        .analysis-section { margin: 20px 0; padding: 20px; background: var(--vscode-sideBar-background); border-radius: 8px; }
        .analysis-output { background: var(--vscode-editor-background); border: 1px solid var(--vscode-sideBar-border); border-radius: 4px; padding: 15px; margin: 15px 0; white-space: pre-wrap; }
        .loading { text-align: center; padding: 40px; opacity: 0.7; }
        .error { color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); padding: 15px; border-radius: 4px; }
        .success { color: var(--vscode-terminal-ansiGreen); background: rgba(0, 255, 0, 0.1); border: 1px solid rgba(0, 255, 0, 0.3); padding: 15px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">🤖 CONAINT AI Analysis</h1>
        <p class="subtitle">Advanced Academic Integrity Detection & Analysis System</p>
    </div>

    <div class="json-input-section">
        <h3>📋 Paste Telemetry JSON Data</h3>
        <textarea id="jsonInput" placeholder="Paste your telemetry JSON data here..." rows="10"></textarea>
        <br>
        <button class="btn" onclick="analyzeJsonData()">🤖 Analyze JSON</button>
        <button class="btn btn-secondary" onclick="testJS()">🧪 Test JS</button>
    </div>

    <div class="analysis-section">
        <h3>🔍 Analysis Results</h3>
        <div id="analysisOutput" class="analysis-output">
            Ready to analyze telemetry data. Paste JSON data above and click Analyze.
        </div>
    </div>

    <script>
        console.log('🚀 CONAINT AI Analysis Panel JavaScript started');
        
        const vscode = acquireVsCodeApi();
        console.log('📋 vscode API available:', typeof vscode);

        function testJS() {
            console.log('🧪 Test button clicked');
            alert('JavaScript is working!');
            document.getElementById('analysisOutput').innerHTML = '<div class="success">✅ JavaScript is working correctly!</div>';
        }

        function analyzeJsonData() {
            console.log('🔍 analyzeJsonData() called');
            const jsonInput = document.getElementById('jsonInput').value.trim();
            console.log('📊 JSON input length:', jsonInput.length);
            
            if (!jsonInput) {
                document.getElementById('analysisOutput').innerHTML = '<div class="error">❌ Please paste JSON data first</div>';
                return;
            }
            
            try {
                const parsedData = JSON.parse(jsonInput);
                console.log('✅ JSON parsed successfully');
                
                document.getElementById('analysisOutput').innerHTML = '<div class="loading">🤖 Analyzing telemetry data with AI...</div>';
                
                console.log('📤 Sending message to extension');
                vscode.postMessage({
                    command: 'analyzeTelemetryJSON',
                    jsonData: jsonInput
                });
                console.log('📤 Message sent successfully');
            } catch (error) {
                console.error('❌ JSON parsing error:', error);
                document.getElementById('analysisOutput').innerHTML = '<div class="error">❌ Error: Invalid JSON format - ' + error.message + '</div>';
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;
            console.log('📨 Received message from extension:', message);
            const output = document.getElementById('analysisOutput');

            switch (message.command) {
                case 'analysisStarted':
                    output.innerHTML = '<div class="loading">🔄 AI analysis in progress...</div>';
                    break;
                case 'analysisComplete':
                    const analysis = message.analysis || 'No analysis data';
                    const formattedResult = typeof analysis === 'string' ? analysis.replace(/\\\\n/g, '<br>') : JSON.stringify(analysis, null, 2);
                    output.innerHTML = '<div class="success">✅ Analysis Complete</div><div class="analysis-output">' + formattedResult + '</div>';
                    break;
                case 'analysisError':
                    output.innerHTML = '<div class="error">❌ Analysis Error: ' + message.error + '</div>';
                    break;
            }
        });

        console.log('🌍 JavaScript initialization complete');
    </script>
</body>
</html>`;
    }
}
exports.AiAnalysisPanel = AiAnalysisPanel;
//# sourceMappingURL=AiAnalysisPanel.js.map