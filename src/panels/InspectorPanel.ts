import * as vscode from 'vscode';
import { Manager } from '../manager';

export class InspectorPanel {
    public static currentPanel: InspectorPanel | undefined;
    public static readonly viewType = 'conaint.inspectorPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private manager: Manager;
    private updateInterval: NodeJS.Timeout | null = null;

    public static createOrShow(extensionUri: vscode.Uri, manager: Manager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (InspectorPanel.currentPanel) {
            InspectorPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            InspectorPanel.viewType,
            'CONAINT Inspector',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        InspectorPanel.currentPanel = new InspectorPanel(panel, extensionUri, manager);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, manager: Manager) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.manager = manager;

        this._update();
        this.startAutoUpdate();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.onDidChangeViewState(event => {
            if (event.webviewPanel.active) {
                this.sendSessionStateToWebview();
            }
        }, null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                this.handleMessage(message);
            },
            null,
            this._disposables
        );
    }



    private async exportTelemetryData() {
        try {
            const storage = this.manager.getStorage();
            const currentSessionId = this.manager.getSessionId();
            const currentUserId = this.manager.getUserId();
            
            // Get raw telemetry data
            const rawTelemetryData = await storage.getTelemetryDataBySession(currentSessionId, 1000);
            
            // Apply smart data reduction
            const optimizedData = this.optimizeTelemetryData(rawTelemetryData);
            
            const exportData = {
                meta: {
                    exportTime: new Date().toISOString(),
                    sessionId: currentSessionId,
                    exportedBy: currentUserId,
                    totalOriginalRecords: rawTelemetryData.length,
                    optimizedRecords: optimizedData.events.length,
                    compressionRatio: `${Math.round((1 - optimizedData.events.length / rawTelemetryData.length) * 100)}% reduction`
                },
                summary: optimizedData.summary,
                events: optimizedData.events
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const document = await vscode.workspace.openTextDocument({
                content: dataStr,
                language: 'json'
            });
            await vscode.window.showTextDocument(document);
            
            vscode.window.showInformationMessage(
                `Optimized telemetry exported: ${optimizedData.events.length} events (${Math.round((1 - optimizedData.events.length / rawTelemetryData.length) * 100)}% smaller) from ${rawTelemetryData.length} original records`
            );
        } catch (error) {
            vscode.window.showErrorMessage('Failed to export data: ' + (error as Error).message);
        }
    }

    private optimizeTelemetryData(rawData: any[]): { summary: any, events: any[] } {
        if (!rawData || rawData.length === 0) {
            return { summary: {}, events: [] };
        }

        // Advanced optimization: Group and compress events
        const userActivity: { [userId: string]: any } = {};
        const compressedEvents: any[] = [];
        const eventSignatures = new Map<string, any>();
        
        // ULTRA-EFFICIENT: Only keep critical events for academic integrity
        const criticalEventTypes = new Set([
            'session_start', 'session_end', 'focus_violation', 'focus_restoration', 'window_focus',
            'paste_detected', 'editor_change', 'file_save', 'command'
        ]);

        // Advanced deduplication with time-based clustering
        const timeClusterSize = 30000; // 30-second clusters

        let sessionStart = 0;
        let sessionEnd = 0;

        rawData.forEach((item, index) => {
            const userId = item.userId || 'unknown';
            const eventType = item.type || 'unknown';
            const timestamp = item.timestamp || Date.now();

            // Initialize user tracking with enhanced metrics
            if (!userActivity[userId]) {
                userActivity[userId] = {
                    totalEvents: 0,
                    focusViolations: 0,
                    codeChanges: 0,
                    fileSaves: 0,
                    pasteEvents: 0,
                    commands: 0,
                    keystrokeEvents: 0,
                    cursorMoves: 0,
                    firstActivity: timestamp,
                    lastActivity: timestamp,
                    suspicionScore: 0 // AI analysis score
                };
            }

            // Update user stats
            const user = userActivity[userId];
            user.totalEvents++;
            user.lastActivity = Math.max(user.lastActivity, timestamp);
            user.firstActivity = Math.min(user.firstActivity, timestamp);

            // Track session bounds
            if (index === 0) {
                sessionStart = timestamp;
            }
            if (index === rawData.length - 1) {
                sessionEnd = timestamp;
            }

            // Enhanced event type tracking for AI analysis
            switch (eventType) {
                case 'focus_violation': 
                case 'focus_restoration':
                case 'window_focus': 
                    user.focusViolations++; 
                    break;
                case 'editor_change': user.codeChanges++; break;
                case 'file_save': user.fileSaves++; break;
                case 'paste_detected': user.pasteEvents++; break;
                case 'command': user.commands++; break;
                case 'keystroke': user.keystrokeEvents++; break;
                case 'cursor_move': user.cursorMoves++; break;
            }

            // ULTRA-EFFICIENT: Only keep critical events for academic integrity
            if (criticalEventTypes.has(eventType)) {
                // Advanced clustering: group similar events in time windows
                const timeCluster = Math.floor(timestamp / timeClusterSize) * timeClusterSize;
                const signature = `${userId}-${eventType}-${timeCluster}`;

                // Smart deduplication with event merging
                if (eventSignatures.has(signature)) {
                    // Merge with existing event (count occurrences)
                    const existingEvent = eventSignatures.get(signature);
                    existingEvent.count = (existingEvent.count || 1) + 1;
                    existingEvent.lastTs = timestamp;
                } else {
                    // Create new compressed event
                    const compressedEvent = {
                        ts: timestamp,
                        userId: userId,
                        type: eventType,
                        count: 1,
                        data: this.extractCriticalData(eventType, item.data)
                    };
                    
                    eventSignatures.set(signature, compressedEvent);
                    compressedEvents.push(compressedEvent);
                }
            }
        });

        // Enhanced summary with AI analysis preparation
        const summary = {
            session: {
                duration: Math.round((sessionEnd - sessionStart) / 1000 / 60), // minutes
                start: new Date(sessionStart).toISOString(),
                end: new Date(sessionEnd).toISOString(),
                compressionRatio: Math.round((1 - compressedEvents.length / rawData.length) * 100)
            },
            users: Object.keys(userActivity).map(userId => {
                const user = userActivity[userId];
                // Calculate AI suspicion score
                user.suspicionScore = this.calculateSuspicionScore(user);
                
                return {
                    id: userId,
                    stats: {
                        totalEvents: user.totalEvents,
                        focusViolations: user.focusViolations,
                        codeChanges: user.codeChanges,
                        fileSaves: user.fileSaves,
                        pasteEvents: user.pasteEvents,
                        commands: user.commands,
                        keystrokeEvents: user.keystrokeEvents,
                        cursorMoves: user.cursorMoves,
                        activeTime: Math.round((user.lastActivity - user.firstActivity) / 1000 / 60), // minutes
                        suspicionScore: user.suspicionScore,
                        riskLevel: user.suspicionScore >= 4 ? 'HIGH' : user.suspicionScore >= 2 ? 'MEDIUM' : 'LOW'
                    }
                };
            }),
            totals: {
                originalEvents: rawData.length,
                compressedEvents: compressedEvents.length,
                totalUsers: Object.keys(userActivity).length,
                compressionSaved: `${Math.round((1 - compressedEvents.length / rawData.length) * 100)}%`
            }
        };

        return { summary, events: compressedEvents };
    }

    // Enhanced AI suspicion scoring algorithm
    private calculateSuspicionScore(user: any): number {
        let score = 0;
        
        // Rule 1: Copy-paste without typing (CRITICAL)
        if (user.pasteEvents > 0 && user.keystrokeEvents === 0) {
            score += 4;
        }
        // Rule 2: Excessive pasting
        else if (user.pasteEvents > 3) {
            score += 3;
        }
        // Rule 3: Low typing to paste ratio
        else if (user.pasteEvents > 0 && user.keystrokeEvents / user.pasteEvents < 15) {
            score += 2;
        }
        
        // Rule 4: No typing in active session
        if (user.keystrokeEvents === 0 && user.totalEvents > 5) {
            score += 3;
        }
        
        // Rule 5: Excessive file switching
        if (user.codeChanges > 10) {
            score += 2;
        }
        
        // Rule 6: Too many focus changes
        if (user.focusViolations > 15) {
            score += 2;
        }
        // Rule 7: Focus changes without typing
        else if (user.focusViolations > 8 && user.keystrokeEvents === 0) {
            score += 2;
        }
        
        // Rule 8: Very low activity
        if (user.totalEvents < 10 && user.activeTime > 5) {
            score += 1;
        }
        
        // Rule 9: High activity but no productive work
        if (user.totalEvents > 20 && user.keystrokeEvents === 0 && user.pasteEvents === 0) {
            score += 3;
        }
        
        // Rule 10: Only cursor movements without typing
        if (user.cursorMoves > 10 && user.keystrokeEvents === 0) {
            score += 2;
        }
        
        return Math.min(score, 10); // Cap at 10
    }

    private extractCriticalData(eventType: string, data: any): any {
        // Extract only critical data to minimize JSON size
        if (!data) {
            return {};
        }
        
        switch (eventType) {
            case 'focus_violation':
                return { 
                    severity: data.severity, 
                    description: data.description, 
                    type: data.type 
                };
            case 'focus_restoration':
                return { 
                    type: data.type, 
                    timeAwayMs: data.timeAwayMs, 
                    timeAwaySeconds: data.timeAwaySeconds 
                };
            case 'window_focus':
                return { 
                    focused: data.focused, 
                    event: data.event 
                };
            case 'paste_detected':
                return { length: data.content?.length || 0, source: data.source };
            case 'editor_change':
                return { fileName: data.fileName, language: data.language };
            case 'file_save':
                return { fileName: data.fileName, size: data.size };
            case 'command':
                return { command: data.command };
            default:
                return {};
        }
    }

    private extractRelevantData(eventType: string, data: any): any {
        // Extract only relevant data based on event type to reduce size
        switch (eventType) {
            case 'focus_violation':
                return { app: data.applicationName, duration: data.duration };
            case 'editor_change':
                return { file: data.fileName, changes: data.changeCount };
            case 'paste_detected':
                return { size: data.pasteSize, source: data.source };
            case 'command':
                return { cmd: data.command };
            case 'file_save':
                return { file: data.fileName };
            default:
                return {}; // Don't include full data for other events
        }
    }

    private async handleMessage(message: any) {
        switch (message.command) {
            case 'connectToServer':
                try {
                    const config = this.manager.getConfig();
                    console.log('🔗 Manual connection attempt to:', config.serverUrl);
                    
                    // Try to connect to the configured server
                    let connected = false;
                    try {
                        connected = await this.manager.connect(config.serverUrl);
                    } catch (remoteError) {
                        console.log('❌ Remote server failed, trying local server...');
                        
                        // Try local server as fallback
                        try {
                            connected = await this.manager.connect('ws://localhost:3000');
                            if (connected) {
                                vscode.window.showInformationMessage('✅ Connected to local CONAINT server!');
                            }
                        } catch (localError) {
                            // Show instructions for starting the server
                            const choice = await vscode.window.showErrorMessage(
                                '❌ Cannot connect to server. Would you like to start the local server?',
                                'Start Local Server',
                                'Check Server Status',
                                'Cancel'
                            );
                            
                            if (choice === 'Start Local Server') {
                                vscode.window.showInformationMessage(
                                    '🚀 To start the local server:\n' +
                                    '1. Open terminal in VS Code\n' +
                                    '2. Navigate to the server folder: cd server\n' +
                                    '3. Run: npm install (if first time)\n' +
                                    '4. Run: node index.js\n' +
                                    '5. Try connecting again'
                                );
                            } else if (choice === 'Check Server Status') {
                                this._panel.webview.postMessage({
                                    command: 'serverStatus',
                                    local: 'Not running (port 3000 not active)',
                                    remote: `Failed: ${(remoteError as Error).message}`,
                                    instructions: 'Start local server with: cd server && node index.js'
                                });
                            }
                            
                            throw new Error(`Both remote and local servers failed. Remote: ${(remoteError as Error).message}, Local: ${(localError as Error).message}`);
                        }
                    }
                    
                    if (connected) {
                        vscode.window.showInformationMessage('✅ Successfully connected to CONAINT server!');
                        this._update(); // Refresh the UI
                    }
                } catch (error) {
                    console.error('❌ Manual connection failed:', error);
                    vscode.window.showErrorMessage(`❌ Connection failed: ${(error as Error).message}`);
                }
                break;
            case 'startInspector':
                try {
                    await this.manager.startInspectorMode();
                    this.sendSessionStateToWebview();
                } catch (error) {
                    vscode.window.showWarningMessage('Inspector mode start cancelled');
                }
                break;
            case 'stopInspector':
                await this.manager.leaveInspectorSession();
                this.sendSessionStateToWebview();
                break;
            case 'copySessionId':
                const currentSessionId = this.manager.getSessionId();
                if (currentSessionId) {
                    await vscode.env.clipboard.writeText(currentSessionId);
                    vscode.window.showInformationMessage('Session ID copied to clipboard!');
                }
                break;
            case 'exportData':
                await this.exportTelemetryData();
                break;
            case 'navigateToPanel':
                await this.navigateToPanel(message.panel);
                break;
            case 'refresh':
                this._update();
                break;
            case 'webviewReady':
                this.sendSessionStateToWebview();
                break;
            case 'changeUserId':
                const newUserId = await vscode.window.showInputBox({
                    prompt: 'Enter your User ID (e.g., matric number, student ID)',
                    placeHolder: 'Enter custom user ID',
                    value: this.manager.getUserId()
                });
                if (newUserId && newUserId.trim()) {
                    const trimmedUserId = newUserId.trim();
                    if (trimmedUserId.length >= 3) { // Minimum 3 characters for user ID
                        await this.manager.setUserId(trimmedUserId);
                        vscode.window.showInformationMessage(`User ID updated to: ${trimmedUserId}`);
                        this._update(); // Refresh the panel to show new user ID
                    } else {
                        vscode.window.showWarningMessage('User ID must be at least 3 characters long');
                    }
                } else if (newUserId === '') {
                    vscode.window.showWarningMessage('User ID cannot be empty');
                }
                break;
        }
    }

    private async navigateToPanel(panelName: string) {
        switch(panelName) {
            case 'dashboard':
                await vscode.commands.executeCommand('manager.openDashboard');
                break;
            case 'liveFeed':
                await vscode.commands.executeCommand('manager.openLiveFeed');
                break;
            case 'submitProblem':
                await vscode.commands.executeCommand('manager.submitProblem');
                break;
            case 'inspector':
                // Already on this panel
                break;
            case 'ai':
                await vscode.commands.executeCommand('manager.openAiAnalysis');
                break;
            default:
                vscode.window.showWarningMessage(`Unknown panel: ${panelName}`);
        }
    }

    private sendSessionStateToWebview(): void {
        const connectionStatus = this.manager.getConnectionStatus();
        const isActive = this.manager.isInspectorSessionActive();

        this._panel.webview.postMessage({
            command: 'sessionState',
            isActive,
            sessionId: isActive ? this.manager.getSessionId() : '',
            startTime: isActive ? this.manager.getSessionStartTime() : 0,
            connected: connectionStatus.connected
        });
    }

    private startAutoUpdate() {
        // Only update for live data - no polling of stored data
        this.updateInterval = setInterval(() => {
            // Only refresh connection status, not stored data
            this._updateConnectionStatus();
        }, 5000); // Check connection every 5 seconds
    }

    private stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    private _updateConnectionStatus() {
        const connectionStatus = this.manager.getConnectionStatus();
        this._panel.webview.postMessage({
            command: 'updateConnectionStatus',
            connected: connectionStatus.connected
        });
    }

    public dispose() {
        InspectorPanel.currentPanel = undefined;
        this.stopAutoUpdate();

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.title = 'CONAINT Inspector';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const connectionStatus = this.manager.getConnectionStatus();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CONAINT Inspector</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    height: 100vh;
                    overflow-y: auto;
                }
                
                .nav-bar {
                    background: #1e1e1e;
                    padding: 10px 20px;
                    border-bottom: 1px solid #333;
                    display: flex;
                    gap: 15px;
                    align-items: center;
                }
                
                .nav-btn {
                    background: transparent;
                    color: #ccc;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                
                .nav-btn:hover {
                    background: #333;
                    color: #fff;
                }
                
                .nav-btn.active {
                    background: #007acc;
                    color: #fff;
                }
                
                .main-content {
                    padding: 30px;
                }
                
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                }
                
                .header-left {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                
                .page-title {
                    color: #fff;
                    font-size: 28px;
                    font-weight: 300;
                    margin: 0;
                }
                
                .user-id-display {
                    color: var(--vscode-textLink-foreground);
                    font-size: 14px;
                    opacity: 0.8;
                }
                
                .connection-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    padding: 8px 12px;
                    background: var(--vscode-sideBar-background);
                    border-radius: 6px;
                }

                .session-status-banner {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }

                .status-pill {
                    padding: 6px 12px;
                    border-radius: 999px;
                    font-size: 12px;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }

                .status-active {
                    background: rgba(76, 175, 80, 0.2);
                    color: #4caf50;
                }

                .status-inactive {
                    background: rgba(158, 158, 158, 0.2);
                    color: #9e9e9e;
                }
                
                .controls {
                    display: flex;
                    gap: 15px;
                    margin-bottom: 30px;
                    flex-wrap: wrap;
                }
                
                .primary-btn {
                    background: #007acc;
                    color: #fff;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: background-color 0.2s;
                }
                
                .primary-btn:hover {
                    background: #005a9e;
                }
                
                .primary-btn:disabled {
                    background: #555;
                    cursor: not-allowed;
                }
                
                .secondary-btn {
                    background: #444;
                    color: #ccc;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                
                .secondary-btn:hover {
                    background: #555;
                    color: #fff;
                }
                
                .secondary-btn:disabled {
                    background: #333;
                    color: #666;
                    cursor: not-allowed;
                }
                
                .connection-btn {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s;
                    box-shadow: 0 2px 4px rgba(40, 167, 69, 0.3);
                }
                
                .connection-btn:hover {
                    background: #218838;
                    box-shadow: 0 4px 8px rgba(40, 167, 69, 0.4);
                    transform: translateY(-1px);
                }
                
                .live-status {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 15px;
                    background: var(--vscode-sideBar-background);
                    border-radius: 6px;
                    border: 1px solid #007acc;
                }
                
                .live-dot {
                    width: 12px;
                    height: 12px;
                    background: #ff4444;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }
                
                .session-monitor {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    overflow: hidden;
                }
                
                .session-header {
                    display: flex;
                    background: var(--vscode-sideBar-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding: 0;
                }
                
                .session-time, .user-count {
                    flex: 1;
                    padding: 20px;
                    text-align: center;
                }
                
                .session-time {
                    border-right: 1px solid var(--vscode-panel-border);
                }
                
                .time-label, .count-label {
                    font-size: 12px;
                    opacity: 0.7;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .time-display, .count-display {
                    font-size: 24px;
                    font-weight: bold;
                    font-family: 'Courier New', monospace;
                    color: var(--vscode-textLink-foreground);
                }
                
                .activity-feed {
                    min-height: 300px;
                    max-height: 400px;
                    overflow-y: auto;
                    padding: 20px;
                }
                
                .no-activity {
                    text-align: center;
                    padding: 60px 20px;
                    opacity: 0.6;
                }
                
                .activity-icon {
                    font-size: 48px;
                    margin-bottom: 16px;
                }
                
                .activity-item {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    margin-bottom: 8px;
                    background: var(--vscode-sideBar-background);
                    border-radius: 6px;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                }
                
                .activity-user {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: var(--vscode-textLink-foreground);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    font-weight: bold;
                    font-size: 14px;
                    margin-right: 12px;
                }
                
                .activity-details {
                    flex: 1;
                }
                
                .activity-action {
                    font-weight: 600;
                    margin-bottom: 2px;
                }
                
                .activity-time {
                    font-size: 11px;
                    opacity: 0.6;
                    font-family: 'Courier New', monospace;
                }
                
                .activity-meta {
                    font-size: 12px;
                    opacity: 0.8;
                    margin-top: 4px;
                }
                
                .key-press {
                    background: rgba(0, 122, 204, 0.1);
                    border-left-color: #007acc;
                }
                
                .mouse-click {
                    background: rgba(76, 175, 80, 0.1);
                    border-left-color: #4caf50;
                }
                
                .file-change {
                    background: rgba(255, 152, 0, 0.1);
                    border-left-color: #ff9800;
                }
                
                .focus-violation {
                    background: rgba(244, 67, 54, 0.15);
                    border-left-color: #f44336;
                    border-left-width: 4px;
                    animation: violationPulse 3s ease-in-out;
                }
                
                .focus-restoration {
                    background: rgba(76, 175, 80, 0.15);
                    border-left-color: #4caf50;
                    border-left-width: 3px;
                }
                
                .paste-activity {
                    background: rgba(156, 39, 176, 0.15);
                    border-left-color: #9c27b0;
                    border-left-width: 3px;
                }
                
                .suspicious-paste {
                    background: rgba(244, 67, 54, 0.2);
                    border-left-color: #f44336;
                    border-left-width: 4px;
                    animation: suspiciousPulse 2s ease-in-out infinite;
                }
                
                @keyframes violationPulse {
                    0% { border-left-color: #f44336; }
                    50% { border-left-color: #ff1744; box-shadow: 0 0 10px rgba(244, 67, 54, 0.3); }
                    100% { border-left-color: #f44336; }
                }
                
                @keyframes suspiciousPulse {
                    0% { border-left-color: #f44336; }
                    50% { border-left-color: #ff5722; }
                    100% { border-left-color: #f44336; }
                }
                
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.1); }
                    100% { opacity: 1; transform: scale(1); }
                }
                
                .session-info {
                    background: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                }
                
                .session-item {
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .session-id-display {
                    background: var(--vscode-editor-background);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    color: #007acc;
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .status-text {
                    color: #4caf50;
                    font-weight: 600;
                }
                
                .section {
                    margin-bottom: 30px;
                }
                
                .section h2 {
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                

                
                .empty-state {
                    text-align: center;
                    padding: 40px 20px;
                    opacity: 0.6;
                }
                
                .status-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    display: inline-block;
                    margin-right: 5px;
                }
                
                .connected {
                    background-color: #4caf50;
                }
                
                .disconnected {
                    background-color: #f44336;
                }
                
                .alert {
                    padding: 10px 15px;
                    border-radius: 4px;
                    margin: 10px 0;
                }
                
                .alert-info {
                    background-color: rgba(33, 150, 243, 0.1);
                    border: 1px solid rgba(33, 150, 243, 0.3);
                    color: var(--vscode-textLink-foreground);
                }
                
                .alert-warning {
                    background-color: rgba(255, 193, 7, 0.1);
                    border: 1px solid rgba(255, 193, 7, 0.3);
                    color: #ff9800;
                }
                
                .live-indicator {
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }

                .session-info-header {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 5px;
                }

                .session-timer {
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 4px 8px;
                    border-radius: 4px;
                }

                .session-management {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                    margin-bottom: 20px;
                }

                .session-details {
                    margin-top: 15px;
                }

                .session-card {
                    background-color: var(--vscode-sideBar-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 15px;
                }

                .session-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }

                .session-id {
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }

                .session-status {
                    padding: 2px 8px;
                    border-radius: 3px;
                    font-size: 11px;
                    font-weight: bold;
                }

                .status-active {
                    background-color: rgba(76, 175, 80, 0.2);
                    color: #4caf50;
                }

                .status-paused {
                    background-color: rgba(255, 152, 0, 0.2);
                    color: #ff9800;
                }

                .status-ended {
                    background-color: rgba(158, 158, 158, 0.2);
                    color: #9e9e9e;
                }

                .session-meta {
                    font-size: 12px;
                    opacity: 0.8;
                    margin-bottom: 10px;
                }

                .session-meta > div {
                    margin-bottom: 4px;
                }

                .session-actions {
                    display: flex;
                    gap: 8px;
                }

                .small-btn {
                    padding: 4px 8px;
                    font-size: 12px;
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }

                .small-btn:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }

                .no-session {
                    text-align: center;
                    padding: 20px;
                    opacity: 0.7;
                }
            </style>
        </head>
        <body>
            <div class="nav-bar">
                <button class="nav-btn" onclick="navigateToPanel('dashboard')">Dashboard</button>
                <button class="nav-btn" onclick="navigateToPanel('liveFeed')">Live Feed</button>
                <button class="nav-btn" onclick="navigateToPanel('submitProblem')">New Problem</button>
                <button class="nav-btn active" onclick="navigateToPanel('inspector')">Inspector</button>
                <button class="nav-btn" onclick="navigateToPanel('ai')">CONAINT AI</button>
            </div>

                <div class="main-content">
                <div class="header">
                    <div class="header-left">
                        <h1 class="page-title">Inspector Dashboard</h1>
                        <div class="user-id-display">User ID: <strong>${this.manager.getUserId()}</strong></div>
                    </div>
                    <div class="connection-status">
                        <span class="status-indicator ${connectionStatus.connected ? 'connected' : 'disconnected'}"></span>
                        <span class="connection-text">${connectionStatus.connected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                </div>

                <div class="controls">
                    ${!connectionStatus.connected ? 
                        '<button onclick="connectToServer()" class="connection-btn">🔗 Connect to Server</button>' : 
                        ''
                    }
                    <button onclick="startInspector()" id="startBtn" class="primary-btn">Start Inspector</button>
                    <button onclick="stopInspector()" id="stopBtn" class="secondary-btn">Stop Inspector</button>
                    <button onclick="copySessionId()" id="copyBtn" class="secondary-btn">Copy Session ID</button>
                    <button onclick="exportData()" class="secondary-btn">Export Data</button>
                    <button onclick="changeUserId()" class="secondary-btn">Change User ID</button>
                </div>

                <div class="session-status-banner">
                    <span id="sessionStatusBadge" class="status-pill status-inactive">Session Inactive</span>
                    <span id="sessionIdDisplay" class="session-id-display" style="display: none;"></span>
                </div>

            ${!connectionStatus.connected ? 
                `<div class="alert alert-warning">
                    ⚠️ Not connected to server. Showing local data only.<br>
                    <small>Trying to connect to: <code>${connectionStatus.url || 'wss://conaint-extension.onrender.com'}</code></small><br>
                    <small>Error: ${connectionStatus.error || 'No connection attempt yet'}</small>
                </div>` : 
                '<div class="alert alert-info">✅ Connected to server. Real-time monitoring active.</div>'}

            <div class="section">
                <h2>� Live Activity Monitor</h2>
                <div class="live-status">
                    <span class="live-dot"></span>
                    <span>Monitoring in real-time...</span>
                </div>
            </div>

                <div class="section">
                    <h2>💎 Live Stream</h2>
                    <div class="session-monitor">
                        <div class="session-header">
                            <div class="session-time">
                                <div class="time-label">Session Time</div>
                                <div class="time-display" id="sessionTime">00:00:00</div>
                            </div>
                            <div class="user-count">
                                <div class="count-label">Active Users</div>
                                <div class="count-display" id="userCount">0</div>
                            </div>
                        </div>
                        <div class="activity-feed" id="activityFeed">
                            <div class="no-activity">
                                <div class="activity-icon">👥</div>
                                <p>No user activity yet. Start monitoring to see live events.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                const NO_ACTIVITY_HTML = '<div class="no-activity"><div class="activity-icon">👥</div><p>No user activity yet. Start monitoring to see live events.</p></div>';

                let sessionStartTime = 0;
                let timerInterval = null;
                const activeUsers = new Set();
                let currentSessionId = '';
                let inspectorSessionActive = false;
                let pendingSessionState = null;
                let connectedMemberCount = 0;

                function navigateToPanel(panelName) {
                    vscode.postMessage({
                        command: 'navigateToPanel',
                        panel: panelName
                    });
                }

                function connectToServer() {
                    vscode.postMessage({ command: 'connectToServer' });

                    const btn = document.querySelector('.connection-btn');
                    if (btn) {
                        btn.textContent = '🔄 Connecting...';
                        btn.disabled = true;
                    }
                }

                function startInspector() {
                    const startBtn = document.getElementById('startBtn');
                    if (startBtn) {
                        startBtn.disabled = true;
                        startBtn.textContent = 'Starting…';
                    }
                    vscode.postMessage({ command: 'startInspector' });
                }

                function stopInspector() {
                    vscode.postMessage({ command: 'stopInspector' });
                }

                function copySessionId() {
                    if (!inspectorSessionActive || !currentSessionId) {
                        vscode.postMessage({ command: 'copySessionId' });
                        return;
                    }
                    vscode.postMessage({ command: 'copySessionId' });
                }

                function exportData() {
                    vscode.postMessage({ command: 'exportData' });
                }

                function changeUserId() {
                    vscode.postMessage({ command: 'changeUserId' });
                }

                function resetActivityFeed() {
                    const feed = document.getElementById('activityFeed');
                    if (feed) {
                        feed.innerHTML = NO_ACTIVITY_HTML;
                    }
                }

                function updateSessionTimerDisplay() {
                    const display = document.getElementById('sessionTime');
                    if (!display) {
                        return;
                    }

                    if (sessionStartTime === 0) {
                        display.textContent = '00:00:00';
                        return;
                    }

                    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
                    const hours = Math.floor(elapsed / 3600);
                    const minutes = Math.floor((elapsed % 3600) / 60);
                    const seconds = elapsed % 60;

                    display.textContent =
                        String(hours).padStart(2, '0') + ':' +
                        String(minutes).padStart(2, '0') + ':' +
                        String(seconds).padStart(2, '0');
                }

                function startTimerFrom(startTimestamp) {
                    sessionStartTime = startTimestamp && startTimestamp > 0 ? startTimestamp : Date.now();
                    if (timerInterval) {
                        clearInterval(timerInterval);
                    }
                    timerInterval = setInterval(updateSessionTimerDisplay, 1000);
                    updateSessionTimerDisplay();
                }

                function stopTimer() {
                    sessionStartTime = 0;
                    if (timerInterval) {
                        clearInterval(timerInterval);
                        timerInterval = null;
                    }
                    updateSessionTimerDisplay();
                }

                function updateUserCount() {
                    const countDisplay = document.getElementById('userCount');
                    if (countDisplay) {
                        const displayedCount = Math.max(activeUsers.size, connectedMemberCount);
                        countDisplay.textContent = displayedCount.toString();
                    }
                }

                function addActivityItem(user, action, details, type = 'key-press') {
                    const feed = document.getElementById('activityFeed');
                    if (!feed) {
                        return;
                    }

                    const noActivity = feed.querySelector('.no-activity');
                    if (noActivity) {
                        noActivity.remove();
                    }

                    const item = document.createElement('div');
                    item.className = 'activity-item ' + type;

                    const now = new Date();
                    const timeStr = now.toLocaleTimeString();

                    activeUsers.add(user);
                    updateUserCount();

                    item.innerHTML =
                        '<div class="activity-user">' + user.charAt(0).toUpperCase() + '</div>' +
                        '<div class="activity-details">' +
                        '<div class="activity-action">' + action + '</div>' +
                        '<div class="activity-time">' + timeStr + '</div>' +
                        (details ? '<div class="activity-meta">' + details + '</div>' : '') +
                        '</div>';

                    feed.insertBefore(item, feed.firstChild);

                    const items = feed.querySelectorAll('.activity-item');
                    if (items.length > 50) {
                        items[items.length - 1].remove();
                    }
                }

                function updateConnectionIndicator(isConnected) {
                    const indicator = document.querySelector('.connection-status .status-indicator');
                    const text = document.querySelector('.connection-status .connection-text');

                    if (indicator) {
                        indicator.classList.toggle('connected', isConnected);
                        indicator.classList.toggle('disconnected', !isConnected);
                    }

                    if (text) {
                        text.textContent = isConnected ? 'Connected' : 'Disconnected';
                    }
                }

                function applySessionState(state) {
                    inspectorSessionActive = !!state.isActive;
                    currentSessionId = inspectorSessionActive ? (state.sessionId || '') : '';
                    pendingSessionState = state;

                    const startBtn = document.getElementById('startBtn');
                    const stopBtn = document.getElementById('stopBtn');
                    const copyBtn = document.getElementById('copyBtn');
                    const badge = document.getElementById('sessionStatusBadge');
                    const sessionIdDisplay = document.getElementById('sessionIdDisplay');

                    if (!startBtn || !stopBtn || !copyBtn || !badge || !sessionIdDisplay) {
                        return;
                    }

                    pendingSessionState = null;
                    startBtn.textContent = 'Start Inspector';
                    stopBtn.textContent = 'Stop Inspector';

                    if (typeof state.memberCount === 'number') {
                        connectedMemberCount = Math.max(0, state.memberCount);
                        if (state.memberCount === 0) {
                            activeUsers.clear();
                        }
                        updateUserCount();
                    }

                    if (inspectorSessionActive) {
                        startBtn.disabled = true;
                        stopBtn.disabled = false;
                        copyBtn.disabled = false;
                        const studentLabel = connectedMemberCount > 0
                            ? 'Session Active · Students: ' + connectedMemberCount
                            : 'Session Active · Waiting for students';
                        badge.textContent = studentLabel;
                        badge.classList.remove('status-inactive');
                        badge.classList.add('status-active');
                        sessionIdDisplay.textContent = 'ID: ' + currentSessionId;
                        sessionIdDisplay.style.display = 'inline-block';
                        startTimerFrom(state.startTime);
                    } else {
                        startBtn.disabled = false;
                        stopBtn.disabled = true;
                        copyBtn.disabled = true;
                        badge.textContent = 'Session Inactive';
                        badge.classList.remove('status-active');
                        badge.classList.add('status-inactive');
                        sessionIdDisplay.textContent = '';
                        sessionIdDisplay.style.display = 'none';
                        stopTimer();
                        activeUsers.clear();
                        connectedMemberCount = 0;
                        updateUserCount();
                        resetActivityFeed();
                    }

                    if (typeof state.connected === 'boolean') {
                        updateConnectionIndicator(state.connected);
                    }
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'sessionState':
                            applySessionState(message);
                            break;
                        case 'updateConnectionStatus':
                            if (typeof message.connected === 'boolean') {
                                updateConnectionIndicator(message.connected);
                            }
                            break;
                        case 'userActivity':
                            addActivityItem(
                                message.user,
                                message.action,
                                message.details,
                                message.type
                            );
                            break;
                        case 'userJoined':
                            activeUsers.add(message.user);
                            connectedMemberCount = Math.max(connectedMemberCount, activeUsers.size);
                            updateUserCount();
                            addActivityItem(message.user, 'Joined session', '', 'file-change');
                            break;
                        case 'userLeft':
                            activeUsers.delete(message.user);
                            connectedMemberCount = Math.max(activeUsers.size, connectedMemberCount - 1);
                            updateUserCount();
                            addActivityItem(message.user, 'Left session', '', 'file-change');
                            break;
                    }
                });

                document.addEventListener('DOMContentLoaded', function() {
                    resetActivityFeed();
                    updateSessionTimerDisplay();
                    updateUserCount();

                    const startBtn = document.getElementById('startBtn');
                    const stopBtn = document.getElementById('stopBtn');
                    const copyBtn = document.getElementById('copyBtn');

                    if (startBtn) startBtn.disabled = false;
                    if (stopBtn) stopBtn.disabled = true;
                    if (copyBtn) copyBtn.disabled = true;

                    if (pendingSessionState) {
                        applySessionState(pendingSessionState);
                    }

                    vscode.postMessage({ command: 'webviewReady' });
                });

                console.log('Inspector panel loaded - ready to start monitoring');
            </script>
        </body>
        </html>`;
    }
}