import * as vscode from 'vscode';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Storage } from './storage';
import { Protocol, MessageType } from './protocol';
import { 
    Problem, Suggestion, User, InspectorSession, TelemetryData, 
    WebSocketMessage, ConnectionStatus, ExtensionConfig, AIAnalysisResult 
} from './types';

export class Manager {
    private context: vscode.ExtensionContext;
    private storage: Storage;
    private ws: WebSocket | null = null;
    private connectionStatus: ConnectionStatus;
    private statusBarItem: vscode.StatusBarItem;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private telemetryCollectors: vscode.Disposable[] = [];
    private userId: string = '';
    private displayName: string = ''; // User's chosen display name for sessions
    private sessionId: string = '';
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private isInspectorMode: boolean = false;
    private isStudentMode: boolean = false;
    private monitoringStatusBar: vscode.StatusBarItem | null = null;
    private sessionTimer: NodeJS.Timeout | null = null;
    private sessionStartTime: number = 0;
    private lastTelemetryTime: number = 0;
    private lastFocusLostTime: number = 0;
    private focusTrackingListener: vscode.Disposable | null = null;
    private readonly MIN_TELEMETRY_INTERVAL = 100; // Max 10 events per second
    private pendingInspectorSessionResolver: ((sessionId: string) => void) | null = null;
    private pendingInspectorSessionRejecter: ((error: Error) => void) | null = null;
    private pendingInspectorSessionTimer: NodeJS.Timeout | null = null;
    private activeSessionMembers: Set<string> = new Set();

    // Privacy-preserving content hashing
    private createContentHash(content: string): string {
        if (!content) {
            return '';
        }
        // Simple hash for privacy - doesn't expose actual content
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36).slice(0, 8);
    }

    // Enhanced monitoring notification system
    public startStudentSession(sessionId: string, displayName?: string): void {
        this.isStudentMode = true;
        this.isInspectorMode = false;
        this.sessionId = sessionId;
        if (displayName) {
            this.displayName = displayName;
        }
        this.sessionStartTime = Date.now();

        this.showMonitoringNotification();
        this.setupTelemetryCollection();
        this.trackWindowFocus();

        void this.storage.setSessionId(sessionId);

        console.log(`Started student session: ${sessionId}`);
    }

    public startInspectorSession(): void {
        this.isInspectorMode = true;
        this.isStudentMode = false;
        
        this.hideMonitoringNotification(); // Inspectors are not monitored
        this.clearTelemetryCollection(); // Stop sending telemetry
        
        console.log('Started inspector session');
    }

    // Session joining logic (following your architecture)
    public joinSession(sessionId: string, displayName: string): void {
        if (!sessionId || !displayName) {
            vscode.window.showErrorMessage('Please provide both Session ID and Display Name');
            return;
        }
        
        this.sessionId = sessionId;
        this.displayName = displayName;
        this.isInspectorMode = false;
        this.isStudentMode = true;
        this.sessionStartTime = Date.now();

        void this.storage.setSessionId(sessionId);
        
        vscode.window.showInformationMessage(`Joined inspector session: ${sessionId} as ${displayName}`);
        
        // Send authentication to server (following your protocol)
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ 
                type: "auth", 
                role: "client", 
                userId: this.userId,
                sessionId,
                displayName 
            }));
        }
        
        // Start monitoring and telemetry collection
        this.showMonitoringNotification();
        this.setupTelemetryCollection();
        this.trackWindowFocus(); // Start focus tracking
        
        console.log(`Joined session ${sessionId} as ${displayName} in student mode`);
    }

    private showMonitoringNotification(): void {
        // Create persistent status bar indicator
        if (!this.monitoringStatusBar) {
            this.monitoringStatusBar = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Right, 
                1000  // High priority
            );
            this.monitoringStatusBar.text = "🔍 Being Monitored";
            this.monitoringStatusBar.tooltip = "Your VS Code activity is being monitored by an instructor";
            this.monitoringStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.monitoringStatusBar.show();
        }

        // Show clear warning modal that can't be easily dismissed
        vscode.window.showWarningMessage(
            "🔍 Inspector Session Active: Your VS Code activity is being monitored for academic integrity purposes.",
            { modal: true },  // Requires explicit acknowledgment
            "I Understand"
        ).then(selection => {
            if (selection === "I Understand") {
                console.log('Student acknowledged monitoring notification');
            }
        });

        // Live timer showing monitoring duration
        this.sessionTimer = setInterval(() => {
            if (this.monitoringStatusBar && this.sessionStartTime > 0) {
                const elapsed = Math.floor((Date.now() - this.sessionStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                this.monitoringStatusBar.text = `🔍 Monitored ${timeStr}`;
            }
        }, 1000);
    }

    private hideMonitoringNotification(): void {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }

        if (this.monitoringStatusBar) {
            this.monitoringStatusBar.hide();
            this.monitoringStatusBar.dispose();
            this.monitoringStatusBar = null;
        }

        this.sessionStartTime = 0;
    }

    public endSession(): void {
        this.isStudentMode = false;
        this.isInspectorMode = false;
        this.sessionId = '';
        this.activeSessionMembers.clear();
        
        this.hideMonitoringNotification();
        this.clearTelemetryCollection();
        
        vscode.window.showInformationMessage('Session ended. Monitoring stopped.');
        console.log('Session ended');

        void this.notifyInspectorPanelOfSessionState();
    }

    private clearTelemetryCollection(): void {
        this.telemetryCollectors.forEach(d => d.dispose());
        this.telemetryCollectors = [];
        
        if (this.focusTrackingListener) {
            this.focusTrackingListener.dispose();
            this.focusTrackingListener = null;
        }
    }

    // Enhanced focus and activity monitoring for academic integrity
    // Uses a more robust approach to detect true external application switches
    // Ignores internal VS Code navigation and focuses only on desktop-level app switches
    public trackWindowFocus(): void {
        console.log(`🔧 Setting up focus tracking - Inspector: ${this.isInspectorMode}, Student: ${this.isStudentMode}, SessionId: ${this.sessionId}, EffectiveUserId: ${this.getEffectiveUserId()}`);
        
        if (this.focusTrackingListener) {
            this.focusTrackingListener.dispose();
        }

        let isCurrentlyFocused = true;
        let lastFocusLostTime = 0;

        // Simplified tracking - focus handled by window state changes

        const handleFocusLost = () => {
            if (isCurrentlyFocused && (this.isStudentMode || this.isInspectorMode) && this.sessionId) {
                isCurrentlyFocused = false;
                lastFocusLostTime = Date.now();
                
                console.log('🚨 FOCUS LOST: Student switched to external application');
                
                // Create focus telemetry payload (following your architecture)
                const focusPayload = {
                    focused: false,
                    timestamp: lastFocusLostTime,
                    windowState: 'unfocused'
                };
                
                this.collectTelemetry('focus_violation', {
                    type: 'external_app_switch',
                    timestamp: lastFocusLostTime,
                    sessionDuration: lastFocusLostTime - this.sessionStartTime,
                    severity: 'medium',
                    description: 'User switched away from VS Code to external application'
                });

                // Send focus telemetry to server (following your protocol)
                if (this.sessionId && this.ws && this.ws.readyState === 1) { // WebSocket.OPEN = 1
                    this.ws.send(JSON.stringify({
                        type: "telemetry.focus",
                        userId: this.userId,
                        sessionId: this.sessionId,
                        payload: focusPayload
                    }));
                }

                // Notify inspector for live feed
                this.notifyActivityToInspector('focus_violation', {
                    focused: false,
                    timestamp: lastFocusLostTime
                });
            }
        };

        const handleFocusGained = () => {
            if (!isCurrentlyFocused && (this.isStudentMode || this.isInspectorMode) && this.sessionId) {
                const currentTime = Date.now();
                const timeAway = currentTime - lastFocusLostTime;
                isCurrentlyFocused = true;
                
                console.log(`✅ FOCUS RESTORED: Student returned to VS Code after ${Math.round(timeAway / 1000)}s`);
                
                // Create focus restoration payload
                const focusPayload = {
                    focused: true,
                    timestamp: currentTime,
                    windowState: 'focused',
                    timeAway: Math.round(timeAway / 1000)
                };
                
                this.collectTelemetry('focus_restoration', {
                    type: 'returned_to_vscode',
                    timestamp: currentTime,
                    timeAwayMs: timeAway,
                    timeAwaySeconds: Math.round(timeAway / 1000),
                    sessionDuration: currentTime - this.sessionStartTime,
                    description: 'Student returned to VS Code from external application'
                });

                // Send focus telemetry to server (following your protocol)
                if (this.sessionId && this.ws && this.ws.readyState === 1) { // WebSocket.OPEN = 1
                    this.ws.send(JSON.stringify({
                        type: "telemetry.focus",
                        userId: this.userId,
                        sessionId: this.sessionId,
                        payload: focusPayload
                    }));
                }

                // Notify inspector for live feed
                this.notifyActivityToInspector('focus_restoration', {
                    focused: true,
                    timestamp: currentTime,
                    timeAwaySeconds: Math.round(timeAway / 1000)
                });
            }
        };

        // Removed complex interaction tracking - using simple window state focus tracking

        // Simple VS Code window state monitoring (following your architecture)
        this.focusTrackingListener = vscode.window.onDidChangeWindowState(state => {
            // Don't send telemetry if we're the inspector or not in a student session
            if (this.isInspectorMode || !this.sessionId || this.sessionId.startsWith("DEMO-session")) {
                return;
            }
            
            console.log(`🔍 Window state change: focused=${state.focused}`);
            
            // Create payload with focus information (following your data structure)
            const focusPayload = {
                focused: state.focused,           // true/false if VS Code has focus
                timestamp: Date.now(),            // When the focus change occurred
                windowState: state.focused ? 'focused' : 'unfocused'  // Human-readable state
            };
            
            // Send to WebSocket server (following your protocol)
            if (this.sessionId && this.ws && this.ws.readyState === WebSocket.OPEN) {
                const displayName = this.displayName || this.userId;
                this.ws.send(JSON.stringify({ 
                    type: "telemetry.focus", 
                    userId: this.userId,
                    sessionId: this.sessionId, 
                    payload: focusPayload,
                    displayName
                }));
            }
            
            // Send to local inspector instance (if running) - following your architecture
            const InspectorPanel = require('./panels/InspectorPanel').InspectorPanel;
            const inspectorInstance = InspectorPanel.getInstanceForTelemetry ? InspectorPanel.getInstanceForTelemetry(false) : InspectorPanel.currentPanel;
            if (inspectorInstance && this.sessionId && this.sessionId !== "DEMO-session") {
                if (inspectorInstance.receiveTelemetry) {
                    const displayName = this.displayName || this.userId;
                    inspectorInstance.receiveTelemetry(this.userId, "telemetry.focus", focusPayload, Date.now(), displayName);
                }
            }
            
            if (state.focused) {
                handleFocusGained();
            } else {
                handleFocusLost();
            }
        });

        // Store listeners for cleanup - simplified focus tracking only

        // Monitor active text editor changes
        this.telemetryCollectors.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.collectTelemetry('editor_change', {
                        fileName: editor.document.fileName.split(/[\\\/]/).pop() || 'unknown',
                        language: editor.document.languageId,
                        lineCount: editor.document.lineCount,
                        timestamp: Date.now()
                    });
                }
            })
        );

        // Monitor when files are saved (completion indicator)
        this.telemetryCollectors.push(
            vscode.workspace.onDidSaveTextDocument(document => {
                this.collectTelemetry('file_save', {
                    fileName: document.fileName.split(/[\\\/]/).pop() || 'unknown',
                    language: document.languageId,
                    lineCount: document.lineCount,
                    size: document.getText().length,
                    timestamp: Date.now()
                });
            })
        );
    }

    // Performance metrics and analytics
    public async generateSessionAnalytics(): Promise<any> {
        if (!this.sessionId || this.sessionStartTime === 0) {
            return null;
        }

        const sessionDuration = Date.now() - this.sessionStartTime;
        const telemetryData = await this.storage.getTelemetryData();
        const sessionTelemetry = telemetryData.filter(t => t.sessionId === this.sessionId);

        // Calculate typing metrics
        const keystrokeEvents = sessionTelemetry.filter((t: any) => t.type === 'keystroke_activity');
        const pasteEvents = sessionTelemetry.filter((t: any) => t.type === 'paste_detected');
        const focusEvents = sessionTelemetry.filter((t: any) => t.type === 'window_focus');
        
        // Calculate focus time (time when VS Code was active)
        let totalFocusTime = 0;
        let lastFocusTime = this.sessionStartTime;
        
        focusEvents.forEach(event => {
            if (event.data.focused === false) {
                // Lost focus - add time since last focus
                totalFocusTime += event.timestamp - lastFocusTime;
            } else {
                // Gained focus - reset timer
                lastFocusTime = event.timestamp;
            }
        });
        
        // Add remaining focus time if session is still active
        if (this.isStudentMode) {
            totalFocusTime += Date.now() - lastFocusTime;
        }

        const analytics = {
            sessionId: this.sessionId,
            userId: this.userId,
            sessionDuration: sessionDuration,
            totalFocusTime: totalFocusTime,
            focusPercentage: Math.round((totalFocusTime / sessionDuration) * 100),
            keystrokeEvents: keystrokeEvents.length,
            pasteEvents: pasteEvents.length,
            pasteRatio: keystrokeEvents.length > 0 ? Math.round((pasteEvents.length / keystrokeEvents.length) * 100) : 0,
            suspiciousActivityCount: sessionTelemetry.filter((t: any) => t.data.suspiciousActivity).length,
            productivityScore: this.calculateProductivityScore({
                telemetryData: sessionTelemetry,
                sessionDuration: sessionDuration,
                focusTime: totalFocusTime
            }),
            timestamp: Date.now()
        };

        return analytics;
    }

    // Intelligent productivity scoring
    private calculateProductivityScore(sessionData: any): number {
        const { telemetryData, sessionDuration, focusTime } = sessionData;
        
        if (!telemetryData || telemetryData.length === 0) {
            return 0;
        }

        let score = 0;
        
        // Focus time score (0-40 points)
        const focusRatio = focusTime / sessionDuration;
        score += Math.min(focusRatio * 40, 40);
        
        // Activity consistency score (0-30 points)
        const keystrokeEvents = telemetryData.filter((t: any) => t.type === 'keystroke_activity');
        const avgTimeBetweenKeystrokes = sessionDuration / Math.max(keystrokeEvents.length, 1);
        const consistencyScore = Math.max(30 - (avgTimeBetweenKeystrokes / 10000), 0); // Penalize long gaps
        score += Math.min(consistencyScore, 30);
        
        // Code quality indicators (0-20 points)
        const codePatternEvents = telemetryData.filter((t: any) => t.data.hasCodePatterns);
        const codeQualityRatio = codePatternEvents.length / Math.max(telemetryData.length, 1);
        score += codeQualityRatio * 20;
        
        // Suspicious activity penalty (-10 to 0 points)
        const suspiciousEvents = telemetryData.filter((t: any) => t.data.suspiciousActivity);
        const suspiciousPenalty = Math.min(suspiciousEvents.length * 2, 10);
        score -= suspiciousPenalty;
        
        // Paste ratio penalty (0-10 points penalty)
        const pasteEvents = telemetryData.filter((t: any) => t.type === 'paste_detected');
        const pasteRatio = pasteEvents.length / Math.max(keystrokeEvents.length, 1);
        if (pasteRatio > 0.2) { // More than 20% paste events
            score -= Math.min((pasteRatio - 0.2) * 50, 10);
        }
        
        return Math.max(Math.min(Math.round(score), 100), 0); // Clamp between 0-100
    }

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.storage = new Storage(context);
        
        this.connectionStatus = {
            connected: false,
            url: '',
            reconnectAttempts: 0
        };

        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'manager.openDashboard';
        this.statusBarItem.show();
        this.updateStatusBar();

        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            this.userId = await this.storage.getUserId();
            // If no custom user ID is stored, generate a temporary one for system use
            if (!this.userId) {
                this.userId = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
                console.log(`🔥 Generated temporary user ID: ${this.userId}`);
            } else {
                console.log(`🔥 Loaded existing user ID from storage: ${this.userId}`);
            }
            this.sessionId = await this.storage.getSessionId();
            
            const config = this.getConfig();
            if (config.autoConnect) {
                await this.connect(config.serverUrl);
            }

            // Setup telemetry collection if enabled
            if (config.enableTelemetry) {
                this.setupTelemetryCollection();
            }
        } catch (error) {
            console.error('Failed to initialize manager:', error);
        }
    }

    public getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration('conaint');
        return {
            serverUrl: config.get('serverUrl', 'wss://conaint-extension.onrender.com'),
            huggingFaceToken: config.get('huggingFaceToken', ''),
            autoConnect: config.get('autoConnect', true),
            enableTelemetry: config.get('enableTelemetry', true),
            userId: this.userId,
            sessionId: this.sessionId
        };
    }

    // WebSocket Connection Management
    async connect(url: string): Promise<boolean> {
        console.log(`🔗 Attempting to connect to: ${url}`);
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('✅ Already connected to server');
            return true;
        }

        try {
            this.connectionStatus.url = url;
            this.connectionStatus.reconnectAttempts++;
            
            console.log(`🔄 Connection attempt #${this.connectionStatus.reconnectAttempts}`);
            vscode.window.showInformationMessage(`Connecting to CONAINT server... (Attempt ${this.connectionStatus.reconnectAttempts})`, { modal: false });
            
            // If it's a render.com URL, wake up the server first
            if (url.includes('onrender.com')) {
                const httpUrl = url.replace('wss://', 'https://').replace('ws://', 'http://');
                try {
                    console.log('🌐 Waking up render.com server...');
                    // Give server time to wake up
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (wakeError) {
                    console.log('⚠️ Wake-up request preparation failed, continuing with WebSocket connection');
                }
            }
            
            this.ws = new WebSocket(url);

            return new Promise((resolve, reject) => {
                if (!this.ws) {
                    reject(new Error('WebSocket not initialized'));
                    return;
                }

                this.ws.on('open', () => {
                    console.log('Connected to CONAINT server');
                    this.connectionStatus.connected = true;
                    this.connectionStatus.reconnectAttempts = 0;
                    this.connectionStatus.error = undefined;
                    
                    this.updateStatusBar();
                    this.startHeartbeat();
                    this.storage.saveConnectionState(url, true);
                    
                    // Show success message for render.com connections
                    if (url.includes('onrender.com')) {
                        vscode.window.showInformationMessage('✅ Successfully connected to CONAINT server!');
                    }
                    
                    // Send initial user registration
                    this.sendMessage(Protocol.createUserUpdateMessage({
                        id: this.userId,
                        name: `User_${this.userId.slice(-6)}`,
                        role: this.isInspectorMode ? 'instructor' : 'student',
                        sessionId: this.sessionId,
                        lastActivity: Date.now(),
                        stats: {
                            problemsSubmitted: 0,
                            suggestionsProvided: 0,
                            score: 0
                        }
                    }));

                    resolve(true);
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data.toString());
                });

                this.ws.on('error', (error) => {
                    console.error('❌ WebSocket connection error:', error);
                    console.error('🔍 Error details:', {
                        message: error.message,
                        code: (error as any).code,
                        url: url,
                        readyState: this.ws?.readyState
                    });
                    
                    this.connectionStatus.error = error.message;
                    this.updateStatusBar();
                    
                    // Show user-friendly error message
                    if (error.message.includes('ENOTFOUND')) {
                        vscode.window.showErrorMessage('❌ Cannot reach server - check your internet connection');
                    } else if (error.message.includes('ETIMEDOUT')) {
                        vscode.window.showErrorMessage('❌ Connection timed out - server may be starting up');
                    } else {
                        vscode.window.showErrorMessage(`❌ Connection failed: ${error.message}`);
                    }
                    
                    reject(error);
                });

                this.ws.on('close', (code, reason) => {
                    console.log(`🔌 Disconnected from CONAINT server - Code: ${code}, Reason: ${reason || 'No reason provided'}`);
                    this.connectionStatus.connected = false;
                    this.updateStatusBar();
                    this.stopHeartbeat();
                    this.storage.saveConnectionState(url, false);
                    
                    // Show disconnection message
                    if (code !== 1000 && code !== 1001) {
                        vscode.window.showWarningMessage(`⚠️ Server connection lost (Code: ${code})`);
                    }
                    
                    // Only auto-reconnect if not a normal closure and under retry limit
                    if (code !== 1000 && code !== 1001 && this.connectionStatus.reconnectAttempts < 5) {
                        console.log(`🔄 Auto-reconnecting in 5 seconds...`);
                        this.attemptReconnect(url);
                    } else if (this.connectionStatus.reconnectAttempts >= 5) {
                        vscode.window.showErrorMessage('❌ Max reconnection attempts reached. Please check server status.');
                    }
                });
            });
        } catch (error) {
            this.connectionStatus.error = (error as Error).message;
            this.updateStatusBar();
            throw error;
        }
    }

    private attemptReconnect(url: string): void {
        if (this.connectionStatus.reconnectAttempts >= 5) {
            console.log('Max reconnection attempts reached');
            return;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s)
        const delay = Math.min(1000 * Math.pow(2, this.connectionStatus.reconnectAttempts - 1), 30000);
        
        console.log(`Attempting to reconnect in ${delay / 1000}s (attempt ${this.connectionStatus.reconnectAttempts}/5)`);
        
        this.reconnectTimeout = setTimeout(() => {
            this.connect(url).catch(error => {
                console.error('Reconnection failed:', error);
            });
        }, delay);
    }

    disconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.stopHeartbeat();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.connectionStatus.connected = false;
        this.connectionStatus.reconnectAttempts = 0;
        this.updateStatusBar();
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendMessage(Protocol.createHeartbeatMessage(this.userId));
                this.connectionStatus.lastHeartbeat = Date.now();
            }
        }, 30000); // 30 seconds
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    public sendMessage(message: WebSocketMessage): boolean {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
                return true;
            } catch (error) {
                console.error('Failed to send message:', error);
                return false;
            }
        }
        return false;
    }

    private requestInspectorSession(): Promise<string> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('Not connected to CONAINT server'));
        }

        if (this.pendingInspectorSessionResolver) {
            return Promise.reject(new Error('Inspector session request already in progress'));
        }

        return new Promise((resolve, reject) => {
            this.pendingInspectorSessionResolver = resolve;
            this.pendingInspectorSessionRejecter = reject;

            try {
                this.ws!.send(JSON.stringify({
                    type: 'auth',
                    role: 'inspector',
                    userId: this.userId
                }));
            } catch (error) {
                this.pendingInspectorSessionResolver = null;
                this.pendingInspectorSessionRejecter = null;
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }

            this.pendingInspectorSessionTimer = setTimeout(() => {
                if (this.pendingInspectorSessionResolver) {
                    const timeoutError = new Error('Timed out waiting for inspector session ID from server');
                    this.pendingInspectorSessionRejecter?.(timeoutError);
                    this.pendingInspectorSessionResolver = null;
                    this.pendingInspectorSessionRejecter = null;
                }
                this.pendingInspectorSessionTimer = null;
            }, 10000);
        });
    }

    private handleMessage(data: string): void {
        try {
            const message = JSON.parse(data);
            console.log("[Manager] WS message received:", message);

            // ⭐ MESSAGE ROUTING: Type-based message processing following your backend logic
            // Route based on message type
            if (message.type === "problem.created") {
                const p = message.problem as Problem;
                this.storage.saveProblem(p);
                const LiveFeedPanel = require('./LiveFeedPanel').LiveFeedPanel;
                if (LiveFeedPanel.current) {
                    LiveFeedPanel.current.postNewProblem(p);
                }

            } else if (message.type === "suggestion.created") {
                const s = message.suggestion as Suggestion;
                this.storage.saveSuggestion(s);
                const LiveFeedPanel = require('./LiveFeedPanel').LiveFeedPanel;
                if (LiveFeedPanel.current) {
                    LiveFeedPanel.current.postNewSuggestion(s);
                }

            } else if (message.type && message.type.startsWith("telemetry")) {
                // ⭐ ROUTING: Send telemetry to correct inspector instance
                const isDemoData = message.userId && message.userId.startsWith('DEMO_');
                const InspectorPanel = require('./panels/InspectorPanel').InspectorPanel;
                const targetInstance = InspectorPanel.getInstanceForTelemetry ? InspectorPanel.getInstanceForTelemetry(isDemoData) : InspectorPanel.currentPanel;
                if (targetInstance) {
                    targetInstance.receiveTelemetry(message.userId, message.type, message.payload, message.ts, message.displayName);
                }

            } else if (message.type === "inspector.sessionStarted") {
                this.sessionId = message.sessionId;
                vscode.env.clipboard.writeText(message.sessionId);  // ⭐ UX: Auto-copy session ID
                vscode.window.showInformationMessage(
                    `[Manager] Inspector session created: ${message.sessionId} (copied to clipboard)`
                );
                
                const MainDashboard = require('./panels/MainDashboard').MainDashboard;
                if (MainDashboard.current) {
                    MainDashboard.current.updateConnectionStatus(true, message.sessionId);
                }
                if (this.pendingInspectorSessionTimer) {
                    clearTimeout(this.pendingInspectorSessionTimer);
                    this.pendingInspectorSessionTimer = null;
                }
                const resolver = this.pendingInspectorSessionResolver;
                this.pendingInspectorSessionResolver = null;
                this.pendingInspectorSessionRejecter = null;
                if (resolver) {
                    resolver(message.sessionId);
                }
                void this.storage.setSessionId(message.sessionId);
                void this.notifyInspectorPanelOfSessionState();
                
            } else if (message.type === "member.joined") {
                if (message.userId) {
                    this.activeSessionMembers.add(message.userId);
                }
                const InspectorPanel = require('./panels/InspectorPanel').InspectorPanel;
                if (InspectorPanel.currentPanel) {
                    InspectorPanel.currentPanel._panel.webview.postMessage({
                        command: 'userJoined',
                        user: message.displayName || message.userId || 'Unknown',
                        userId: message.userId || 'unknown'
                    });
                }
                void this.notifyInspectorPanelOfSessionState();
                
            } else if (message.type === "member.left") {
                if (message.userId) {
                    this.activeSessionMembers.delete(message.userId);
                }
                const InspectorPanel = require('./panels/InspectorPanel').InspectorPanel;
                if (InspectorPanel.currentPanel) {
                    InspectorPanel.currentPanel._panel.webview.postMessage({
                        command: 'userLeft',
                        user: message.displayName || message.userId || 'Unknown',
                        userId: message.userId || 'unknown'
                    });
                }
                void this.notifyInspectorPanelOfSessionState();
                
            } else if (message.type === "joined") {
                vscode.window.showInformationMessage(`✅ Successfully joined session: ${message.sessionId}`);
                
            } else if (message.type === "inspector.joined") {
                vscode.window.showInformationMessage(`🔍 ${message.message || 'You are now being monitored'}`);
                
            } else if (message.type === "inspector.ended") {
                vscode.window.showWarningMessage(`⚠️ ${message.message || 'Inspector session has ended'}`);
                this.activeSessionMembers.clear();
                this.endSession();
                
            } else if (message.type === "error") {
                if (this.pendingInspectorSessionRejecter) {
                    this.pendingInspectorSessionRejecter(new Error(message.message || 'Server error'));
                    this.pendingInspectorSessionResolver = null;
                    this.pendingInspectorSessionRejecter = null;
                    if (this.pendingInspectorSessionTimer) {
                        clearTimeout(this.pendingInspectorSessionTimer);
                        this.pendingInspectorSessionTimer = null;
                    }
                }
                vscode.window.showErrorMessage(`❌ Server error: ${message.message}`);
                
            } else if (message.type === "globalProblems.response") {
                // Handle global problems response
                const problems = message.problems || [];
                const suggestions = message.suggestions || [];
                problems.forEach((p: Problem) => this.storage.saveProblem(p));
                suggestions.forEach((s: Suggestion) => this.storage.saveSuggestion(s));
                console.log(`[Manager] Synced ${problems.length} problems and ${suggestions.length} suggestions from global community`);
                
            } else {
                console.log('Unhandled message type:', message.type, 'Data:', message);
            }
        } catch (error) {
            console.error("[Manager] Failed to process WS message:", error);
            vscode.window.showErrorMessage("[Manager] Failed to process WS message: " + (error instanceof Error ? error.message : String(error)));
        }
    }



    // Message Handlers
    private async handleProblemCreated(problem: Problem): Promise<void> {
        await this.storage.saveProblem(problem);
        vscode.window.showInformationMessage(`New problem created: ${problem.title}`);
    }

    private async handleSuggestionCreated(suggestion: Suggestion): Promise<void> {
        await this.storage.saveSuggestion(suggestion);
        vscode.window.showInformationMessage(`New suggestion received for problem`);
    }

    private async handleTelemetryReceived(telemetry: TelemetryData): Promise<void> {
        // Only store telemetry if in inspector mode
        if (this.isInspectorMode) {
            await this.storage.saveTelemetryData(telemetry);
        }
    }

    private handleInspectorJoin(message: WebSocketMessage): void {
        console.log('User joined inspector session:', message.userId);
        
        // Notify InspectorPanel of user joining
        const InspectorPanel = require('./panels/InspectorPanel').InspectorPanel;
        if (InspectorPanel.currentPanel) {
            InspectorPanel.currentPanel._panel.webview.postMessage({
                command: 'userJoined',
                user: message.userId || 'Unknown'
            });
        }
    }

    private handleInspectorLeave(message: WebSocketMessage): void {
        console.log('User left inspector session:', message.userId);
        if (message.userId) {
            this.activeSessionMembers.delete(message.userId);
        }
        
        // Notify InspectorPanel of user leaving
        const InspectorPanel = require('./panels/InspectorPanel').InspectorPanel;
        if (InspectorPanel.currentPanel) {
            InspectorPanel.currentPanel._panel.webview.postMessage({
                command: 'userLeft',
                user: message.userId || 'Unknown'
            });
        }

        void this.notifyInspectorPanelOfSessionState();
    }

    private async handleUserUpdate(user: User): Promise<void> {
        await this.storage.saveUser(user);
    }

    private async handleAIAnalysis(data: any): Promise<void> {
        if (data.result) {
            const result: AIAnalysisResult = data.result;
            await this.storage.saveAIAnalysisResult(result);
            vscode.window.showInformationMessage('AI Analysis completed');
        }
    }

    // Telemetry Collection
    private setupTelemetryCollection(): void {
        // Clear existing collectors
        this.telemetryCollectors.forEach(d => d.dispose());
        this.telemetryCollectors = [];

        // Enhanced keystroke and paste detection monitoring with rate limiting
        this.telemetryCollectors.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (!this.getConfig().enableTelemetry || !this.sessionId) {
                    return; // Privacy by design: don't monitor inactive sessions
                }
                
                // Monitor both instructor and student activities during active sessions
                console.log(`📝 Text change detected - Inspector: ${this.isInspectorMode}, Student: ${this.isStudentMode}`);

                const now = Date.now();
                if (now - this.lastTelemetryTime < this.MIN_TELEMETRY_INTERVAL) {
                    return; // Rate limiting: prevent network flooding
                }
                this.lastTelemetryTime = now;

                event.contentChanges.forEach(change => {
                    const text = change.text;
                    const isPotentialPaste = text.length > 10 && text.includes('\n');
                    const hasCodePatterns = /[{}();=><]/.test(text);
                    const isLargeInsert = text.length > 50;
                    
                    // Privacy-preserving hash for content analysis
                    const contentHash = this.createContentHash(text);
                    
                    // Intelligent classification
                    const eventType = isPotentialPaste ? 'paste_detected' : 'keystroke_activity';
                    
                    const telemetryData = {
                        fileName: event.document.fileName.split(/[\\\/]/).pop() || 'unknown',
                        language: event.document.languageId,
                        textLength: text.length,
                        isPotentialPaste: isPotentialPaste,
                        hasCodePatterns: hasCodePatterns,
                        contentHash: contentHash,
                        // Privacy: Only send sample, not full content
                        sample: text.length > 100 ? text.substring(0, 50) + '...' : text,
                        suspiciousActivity: isPotentialPaste && isLargeInsert,
                        linesAdded: text.split('\n').length - 1,
                        timestamp: now
                    };

                    this.collectTelemetry(eventType, telemetryData);
                });
            })
        );

        // Cursor movement and text selection tracking
        this.telemetryCollectors.push(
            vscode.window.onDidChangeTextEditorSelection(event => {
                if (this.getConfig().enableTelemetry) {
                    this.collectTelemetry('cursor_movement', {
                        document: event.textEditor.document.uri.toString(),
                        fileName: event.textEditor.document.fileName.split(/[\\\/]/).pop() || 'unknown',
                        selections: event.selections.map(sel => ({
                            start: { line: sel.start.line, character: sel.start.character },
                            end: { line: sel.end.line, character: sel.end.character },
                            isEmpty: sel.isEmpty,
                            selectedText: sel.isEmpty ? '' : event.textEditor.document.getText(sel).substring(0, 50)
                        })),
                        kind: event.kind,
                        timestamp: Date.now()
                    });
                }
            })
        );

        // File activity tracking
        this.telemetryCollectors.push(
            vscode.workspace.onDidOpenTextDocument(document => {
                if (this.getConfig().enableTelemetry) {
                    this.collectTelemetry('file_activity', {
                        action: 'open',
                        file: document.uri.toString(),
                        fileName: document.fileName.split(/[\\\/]/).pop() || 'unknown',
                        language: document.languageId,
                        lineCount: document.lineCount,
                        timestamp: Date.now()
                    });
                }
            })
        );

        // File close tracking
        this.telemetryCollectors.push(
            vscode.workspace.onDidCloseTextDocument(document => {
                if (this.getConfig().enableTelemetry) {
                    this.collectTelemetry('file_activity', {
                        action: 'close',
                        file: document.uri.toString(),
                        fileName: document.fileName.split(/[\\\/]/).pop() || 'unknown',
                        language: document.languageId,
                        timestamp: Date.now()
                    });
                }
            })
        );

        // Command execution
        this.telemetryCollectors.push(
            vscode.commands.registerCommand('conaint.telemetry.command', (commandId: string) => {
                if (this.getConfig().enableTelemetry) {
                    this.collectTelemetry('command', {
                        commandId
                    });
                }
            })
        );

        // Selection changes
        this.telemetryCollectors.push(
            vscode.window.onDidChangeTextEditorSelection(event => {
                if (this.getConfig().enableTelemetry) {
                    this.collectTelemetry('selection', {
                        document: event.textEditor.document.uri.toString(),
                        selections: event.selections.map(sel => ({
                            start: sel.start,
                            end: sel.end,
                            text: event.textEditor.document.getText(sel)
                        }))
                    });
                }
            })
        );
    }

    private collectTelemetry(type: string, data: any): void {
        if (!this.getConfig().enableTelemetry) {
            return;
        }

        // Only collect telemetry when in a session (student or inspector mode)
        if (!this.sessionId) {
            return;
        }

        console.log(`📊 Collecting telemetry: ${type} - UserId: ${this.getEffectiveUserId()} - SessionId: ${this.sessionId}`);
        
        // Special logging for focus events
        if (type.includes('focus') || type === 'window_focus') {
            console.log(`🔍 FOCUS EVENT CAPTURED: ${type}`, data);
        }

        const telemetry: TelemetryData = {
            id: uuidv4(),
            userId: this.getEffectiveUserId(),
            sessionId: this.sessionId,
            timestamp: Date.now(),
            type: type as any,
            data
        };

        // Store locally
        this.storage.saveTelemetryData(telemetry);

        // Send to server if connected and in student mode
        if (this.isStudentMode && this.connectionStatus.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const telemetryType = type.startsWith('telemetry.') ? type : `telemetry.${type}`;
            const displayName = this.displayName || this.userId;
            const message = {
                type: telemetryType,
                userId: this.userId,
                sessionId: this.sessionId,
                payload: data,
                displayName
            };
            try {
                this.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error('Failed to send telemetry to server:', error);
            }
        }

        // Notify InspectorPanel of user activity for live feed
        this.notifyActivityToInspector(type, data);
    }

    private notifyActivityToInspector(type: string, data: any): void {
        // Import the InspectorPanel to send activity updates
        const InspectorPanel = require('./panels/InspectorPanel').InspectorPanel;
        if (InspectorPanel.currentPanel) {
            let action = '';
            let details = '';
            let activityType = 'key-press';

            switch (type) {
                case 'editor_change':
                    action = 'Typing in editor';
                    details = `File: ${data.fileName || 'Unknown'}`;
                    activityType = 'key-press';
                    break;
                case 'file_save':
                    action = 'Saved file';
                    details = `File: ${data.fileName || 'Unknown'}`;
                    activityType = 'file-change';
                    break;
                case 'window_focus':
                    if (data.focused) {
                        action = '✅ VS Code focused';
                        details = `Window activated - User is back in VS Code`;
                        activityType = 'focus-restoration';
                    } else {
                        action = '⚠️ VS Code lost focus';
                        details = `User switched to another application`;
                        activityType = 'focus-violation';
                    }
                    break;
                case 'cursor_movement':
                    action = 'Cursor moved';
                    details = `Line ${data.line}, Column ${data.character}`;
                    activityType = 'mouse-click';
                    break;
                case 'command':
                    action = 'Executed command';
                    details = `Command: ${data.command}`;
                    activityType = 'key-press';
                    break;
                case 'selection':
                    action = 'Text selected';
                    details = `${data.length} characters selected`;
                    activityType = 'mouse-click';
                    break;
                case 'focus_violation':
                    action = '⚠️ Switched to another app';
                    details = `Left VS Code - Potential academic integrity concern`;
                    activityType = 'focus-violation'; // Use red color with animation for violations
                    break;
                case 'focus_restoration':
                    action = '✅ Returned to VS Code';
                    details = `Away for ${data.timeAwaySeconds} seconds`;
                    activityType = 'focus-restoration'; // Use green color for restoration
                    break;
                case 'paste_detected':
                    action = '📋 Pasted content';
                    details = `${data.textLength} characters pasted in ${data.fileName || 'file'}${data.suspiciousActivity ? ' - Suspicious large paste!' : ''}`;
                    activityType = data.suspiciousActivity ? 'suspicious-paste' : 'paste-activity';
                    break;
                case 'keystroke_activity':
                    action = '⌨️ Typing';
                    details = `${data.textLength} characters in ${data.fileName || 'file'}`;
                    activityType = 'key-press';
                    break;
                case 'session_started':
                    action = '🚀 Monitoring started';
                    details = `${data.sessionType} session initiated - Activity tracking active`;
                    activityType = 'focus-restoration';
                    break;
                default:
                    action = type.replace('_', ' ');
                    details = JSON.stringify(data).substring(0, 50);
                    break;
            }

            InspectorPanel.currentPanel._panel.webview.postMessage({
                command: 'userActivity',
                user: this.getEffectiveUserId(), // Show user's display name when in session
                action: action,
                details: details,
                type: activityType
            });
        }
    }

    // Public API Methods
    async submitProblem(title: string, description: string, difficulty: 'Easy' | 'Medium' | 'Hard', tags: string[]): Promise<Problem> {
        const problem: Problem = {
            id: uuidv4(),
            title,
            description,
            difficulty,
            tags,
            userId: this.userId,
            timestamp: Date.now(),
            status: 'active'
        };

        await this.storage.saveProblem(problem);

        if (this.connectionStatus.connected) {
            this.sendMessage(Protocol.createProblemMessage(problem, this.userId));
        }

        return problem;
    }

    async submitSuggestion(problemId: string, content: string): Promise<Suggestion> {
        const suggestion: Suggestion = {
            id: uuidv4(),
            problemId,
            content,
            userId: this.userId,
            timestamp: Date.now(),
            votes: 0,
            status: 'pending'
        };

        await this.storage.saveSuggestion(suggestion);

        if (this.connectionStatus.connected) {
            this.sendMessage(Protocol.createSuggestionMessage(suggestion, this.userId));
        }

        return suggestion;
    }

    async startInspectorMode(): Promise<string> {
        const currentUserId = this.getUserId();
        const customUserId = await vscode.window.showInputBox({
            prompt: 'Enter your Instructor ID (optional - press Enter to use default)',
            placeHolder: 'Leave empty for default instructor ID',
            value: currentUserId.startsWith('user_') ? '' : currentUserId
        });

        if (customUserId && customUserId.trim()) {
            const trimmedUserId = customUserId.trim();
            await this.setUserId(trimmedUserId);
            console.log(`🎯 Inspector mode: User ID set to "${trimmedUserId}"`);
        } else {
            const defaultInstructorId = `instructor_${Date.now().toString(36)}`;
            await this.setUserId(defaultInstructorId);
            console.log(`🎯 Inspector mode: Using default instructor ID "${defaultInstructorId}"`);
        }

        this.isInspectorMode = true;
        this.isStudentMode = false;
        this.activeSessionMembers.clear();

        let sessionId: string;
        try {
            sessionId = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Starting inspector session...',
                cancellable: false
            }, async () => {
                return this.requestInspectorSession();
            });
        } catch (error) {
            this.isInspectorMode = false;
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to start inspector session: ${message}`);
            void this.notifyInspectorPanelOfSessionState();
            throw error;
        }

        this.sessionId = sessionId;
        await this.storage.setSessionId(sessionId);

        this.lastFocusLostTime = 0;
        this.sessionStartTime = Date.now();

        this.setupTelemetryCollection();
        this.trackWindowFocus();

        setTimeout(() => {
            this.collectTelemetry('session_started', {
                sessionType: 'inspector',
                timestamp: Date.now(),
                userId: this.userId
            });
        }, 1000);

    const sessionStartTime = this.sessionStartTime;
        const session = {
            id: sessionId,
            instructorId: this.userId,
            students: [],
            startTime: sessionStartTime,
            status: 'active' as const,
            config: {
                monitorKeystrokes: true,
                monitorMouse: true,
                monitorClipboard: true,
                monitorFiles: true
            }
        };

        await this.storage.saveInspectorSession(session);

        void this.notifyInspectorPanelOfSessionState();

        vscode.window.showInformationMessage(
            `Inspector mode started!\nSession ID: ${sessionId}\nShare this ID with students to join.`,
            'Copy Session ID'
        ).then(selection => {
            if (selection === 'Copy Session ID') {
                vscode.env.clipboard.writeText(sessionId);
                vscode.window.showInformationMessage('Session ID copied to clipboard!');
            }
        });

        return sessionId;
    }

    // Quick start inspector mode without user input dialog
    async startInspectorModeQuick(): Promise<string> {
        // Use default instructor ID
        const defaultInstructorId = `instructor_${Date.now().toString(36)}`;
        await this.setUserId(defaultInstructorId);
        console.log(`🎯 Quick inspector mode: Using instructor ID "${defaultInstructorId}"`);
        
        this.isInspectorMode = true;
        this.isStudentMode = false;
        this.activeSessionMembers.clear();
        
        let sessionId: string;
        try {
            sessionId = await this.requestInspectorSession();
        } catch (error) {
            this.isInspectorMode = false;
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to start inspector session: ${message}`);
            void this.notifyInspectorPanelOfSessionState();
            throw error;
        }

        this.sessionId = sessionId;
        await this.storage.setSessionId(sessionId);

        this.lastFocusLostTime = 0;
        this.sessionStartTime = Date.now();

        this.setupTelemetryCollection();
        this.trackWindowFocus();

        const session = {
            id: sessionId,
            instructorId: this.userId,
            students: [],
            startTime: this.sessionStartTime,
            status: 'active' as const,
            config: {
                monitorKeystrokes: true,
                monitorMouse: true,
                monitorClipboard: true,
                monitorFiles: true
            }
        };

        await this.storage.saveInspectorSession(session);

        void this.notifyInspectorPanelOfSessionState();

        vscode.env.clipboard.writeText(sessionId).then(() => {
            vscode.window.showInformationMessage(`Inspector session ready (quick start). ID copied to clipboard: ${sessionId}`);
        });

        return sessionId;
    }

    async joinInspectorSession(sessionId: string, userMatricNo?: string): Promise<void> {
        console.log(`🔥 joinInspectorSession called - sessionId: ${sessionId}, userMatricNo: ${userMatricNo}`);
        console.log(`🔥 Current this.userId before: ${this.userId}`);
        let studentId: string;
        
        if (userMatricNo) {
            // User provided a matric number, use it and update the userId
            studentId = userMatricNo;
            console.log(`🔥 Using provided matric number: ${studentId}`);
            await this.setUserId(studentId);
            console.log(`🔥 After setUserId, this.userId is: ${this.userId}`);
        } else if (this.userId && !this.userId.startsWith('user_')) {
            // Already have a custom user ID (not auto-generated), use it
            studentId = this.userId;
        } else {
            // No matric number provided and no custom user ID, ask for it
            const inputId = await vscode.window.showInputBox({
                prompt: 'Enter your Student ID/Matric Number',
                placeHolder: 'e.g., STU001, 2021/CS/001',
                validateInput: (value) => {
                    if (!value || value.trim().length < 3) {
                        return 'Please enter a valid Student ID (minimum 3 characters)';
                    }
                    return null;
                }
            });
            
            if (inputId) {
                studentId = inputId;
                await this.setUserId(studentId);
            } else {
                vscode.window.showWarningMessage('Student ID is required to join inspection session');
                return;
            }
        }

        if (!studentId) {
            vscode.window.showWarningMessage('Student ID is required to join inspection session');
            return;
        }
        
    await this.setUserId(studentId);

    console.log(`Joining session ${sessionId} as student: ${studentId}`);

    this.isStudentMode = true;
    this.isInspectorMode = false;
    this.sessionId = sessionId;
    this.displayName = studentId;
    this.sessionStartTime = Date.now();
    void this.storage.setSessionId(sessionId);

        // Update user info with student ID
        const user = await this.storage.getUser(studentId);
        const updatedUser = {
            id: studentId,
            name: studentId, // Use matric number as name
            role: 'student' as const,
            sessionId: sessionId,
            lastActivity: Date.now(),
            stats: user ? user.stats : {
                problemsSubmitted: 0,
                suggestionsProvided: 0,
                score: 0
            }
        };
        
        await this.storage.saveUser(updatedUser);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'auth',
                role: 'client',
                userId: studentId,
                sessionId,
                displayName: studentId
            }));
            console.log(`Student ${studentId} joined session ${sessionId}`);
        }

        // Enable telemetry collection for monitoring
        if (this.getConfig().enableTelemetry) {
            this.setupTelemetryCollection();
            
            // Log initial state - user is currently in VS Code since they just joined
            this.collectTelemetry('session_start', {
                timestamp: Date.now(),
                initialFocusState: 'focused',
                studentId: studentId,
                sessionId: sessionId
            });
        }

        // Show success notification with timer
        vscode.window.showInformationMessage(
            `✅ Successfully joined inspection session!\n` +
            `Session ID: ${sessionId}\n` +
            `Student ID: ${studentId}\n` +
            `⚠️ Your activity is now being monitored.`,
            'Understood'
        );

        // Update status bar to show monitoring status
        this.updateStatusBarForStudent(sessionId, studentId);
    }

    async leaveInspectorSession(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.sessionId) {
            this.ws.send(JSON.stringify({
                type: 'session.leave',
                sessionId: this.sessionId,
                userId: this.userId,
                displayName: this.displayName
            }));
        }

        // Clear all session state
        this.isInspectorMode = false;
        this.isStudentMode = false;
        this.sessionId = '';
        this.displayName = '';
    this.activeSessionMembers.clear();
        
        // Reset focus tracking variables
        this.lastFocusLostTime = 0;
        this.sessionStartTime = 0;
        
        // Disable telemetry collection
        this.telemetryCollectors.forEach(d => d.dispose());
        this.telemetryCollectors = [];

        // Hide monitoring notification
        this.hideMonitoringNotification();

        void this.notifyInspectorPanelOfSessionState();

        vscode.window.showInformationMessage('Left inspector session');
    }

    async requestAIAnalysis(code: string): Promise<void> {
        if (this.connectionStatus.connected) {
            this.sendMessage(Protocol.createAIAnalysisMessage(code, this.userId));
        } else {
            vscode.window.showErrorMessage('Not connected to server for AI analysis');
        }
    }

    // Status and Information
    getConnectionStatus(): ConnectionStatus {
        return { ...this.connectionStatus };
    }

    getUserId(): string {
        console.log(`🔥 getUserId() called - returning: ${this.userId}`);
        return this.userId;
    }

    // Get the effective user identifier for telemetry and inspector communication
    private getEffectiveUserId(): string {
        return (this.isStudentMode && this.displayName) ? this.displayName : this.userId;
    }

    // Get the current display name (useful for UI)
    public getDisplayName(): string {
        return this.displayName || this.userId;
    }

    public isInspectorSessionActive(): boolean {
        return this.isInspectorMode && !!this.sessionId;
    }

    public getSessionStartTime(): number {
        return this.sessionStartTime;
    }

    // Check if currently in student mode
    public isInStudentMode(): boolean {
        return this.isStudentMode;
    }

    // Clear current session state (for debugging)
    public clearCurrentSession(): void {
        this.isInspectorMode = false;
        this.isStudentMode = false;
        this.sessionId = '';
        this.displayName = '';
        this.lastFocusLostTime = 0;
        this.sessionStartTime = 0;
        
        // Disable telemetry collection
        this.telemetryCollectors.forEach(d => d.dispose());
        this.telemetryCollectors = [];

        // Hide monitoring notification
        this.hideMonitoringNotification();

        console.log('🧹 Session state cleared');
    }

    async clearUserId(): Promise<void> {
        console.log(`🔥 Clearing user ID - was: ${this.userId}`);
        this.userId = '';
        await this.storage.clearUserId();
        console.log(`🔥 User ID cleared`);
    }

    getSessionId(): string {
        return this.sessionId;
    }

    isConnected(): boolean {
        return this.connectionStatus.connected;
    }

    getStorage(): Storage {
        return this.storage;
    }

    private async notifyInspectorPanelOfSessionState(): Promise<void> {
        const isActive = this.isInspectorMode && !!this.sessionId;

        try {
            const { InspectorPanel } = await import('./panels/InspectorPanel.js');
            if (InspectorPanel.currentPanel && InspectorPanel.currentPanel['_panel']) {
                InspectorPanel.currentPanel['_panel'].webview.postMessage({
                    command: 'sessionState',
                    isActive,
                    sessionId: isActive ? this.sessionId : '',
                    startTime: isActive ? this.sessionStartTime : 0,
                    connected: this.connectionStatus.connected,
                    memberCount: isActive ? this.activeSessionMembers.size : 0
                });
            }
        } catch (error) {
            console.error('Failed to notify inspector panel of session state:', error);
        }
    }

    private updateStatusBar(): void {
        if (this.isStudentMode && this.sessionId) {
            this.statusBarItem.text = `$(eye) MONITORED - Session: ${this.sessionId.slice(-6)}`;
            this.statusBarItem.tooltip = `Under inspection in session: ${this.sessionId}`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else if (this.isInspectorMode && this.sessionId) {
            this.statusBarItem.text = `$(telescope) INSPECTING - Session: ${this.sessionId.slice(-6)}`;
            this.statusBarItem.tooltip = `Inspector mode active - Session: ${this.sessionId}`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else if (this.connectionStatus.connected) {
            this.statusBarItem.text = `$(pulse) CONAINT Connected`;
            this.statusBarItem.tooltip = `Connected to: ${this.connectionStatus.url}`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = `$(error) CONAINT Disconnected`;
            this.statusBarItem.tooltip = this.connectionStatus.error || 'Not connected to server';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }

        void this.notifyInspectorPanelOfSessionState();
    }

    private updateStatusBarForStudent(sessionId: string, studentId: string): void {
        this.statusBarItem.text = `$(eye) MONITORED - ${studentId}`;
        this.statusBarItem.tooltip = `Being monitored in session: ${sessionId} as ${studentId}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    async setUserId(userId: string): Promise<void> {
        console.log(`🔥 setUserId called with: ${userId}`);
        console.log(`🔥 Old this.userId was: ${this.userId}`);
        
        // Clear any existing auto-generated ID from storage first
        if (this.userId && this.userId.startsWith('user_')) {
            console.log(`🔥 Clearing old auto-generated ID: ${this.userId}`);
        }
        
        this.userId = userId;
        console.log(`🔥 New this.userId is: ${this.userId}`);
        
        // Update storage with the custom user ID
        await this.storage.setUserId(userId);
        console.log(`🔥 Storage updated with custom userId: ${userId}`);
        
        // Create or update user record
        const user: User = {
            id: userId,
            matricNumber: userId,
            name: `Student ${userId}`,
            email: `${userId}@student.edu`,
            role: 'student',
            lastActivity: Date.now(),
            joinDate: new Date().toISOString(),
            sessions: [],
            stats: {
                problemsSubmitted: 0,
                suggestionsProvided: 0,
                score: 0
            }
        };
        
        await this.storage.saveUser(user);
        await this.context.globalState.update('conaint.userId', userId);
        
        // Send user update to server if connected
        if (this.connectionStatus.connected && this.ws) {
            this.sendMessage(Protocol.createUserUpdateMessage({
                id: userId,
                name: userId, // Use matric number as display name
                role: 'student',
                sessionId: this.sessionId,
                lastActivity: Date.now(),
                stats: {
                    problemsSubmitted: 0,
                    suggestionsProvided: 0,
                    score: 0
                }
            }));
            console.log(`User registered with server: ${userId}`);
        }
        
        this.updateStatusBar();
    }

    sendTelemetryEvent(event: {
        type: string;
        userId: string;
        timestamp: number;
        data: any;
    }): void {
        if (this.connectionStatus.connected && this.ws) {
            this.ws.send(JSON.stringify({
                type: 'telemetry',
                sessionId: this.sessionId,
                userId: event.userId,
                timestamp: event.timestamp,
                eventType: event.type,
                data: event.data
            }));
        }
    }

    sendFocusChange(focusData: {
        userId: string;
        hasFocus: boolean;
        sessionId: string | null;
        timestamp?: number;
        timeAway?: number;
        isHeartbeat?: boolean;
    }): void {
        if (this.connectionStatus.connected && this.ws) {
            this.ws.send(JSON.stringify({
                type: 'focus.change',
                userId: focusData.userId,
                sessionId: focusData.sessionId,
                data: {
                    hasFocus: focusData.hasFocus,
                    timestamp: focusData.timestamp || Date.now(),
                    timeAway: focusData.timeAway || 0,
                    isHeartbeat: focusData.isHeartbeat || false
                }
            }));
        }
    }

    async analyzeWithAI(sessionData: any, code: string = ''): Promise<AIAnalysisResult> {
        try {
            const config = this.getConfig();
            const token = config.huggingFaceToken || 'hf_your_token_here'; // Default shared token
            
            const analysisInput = code || `Analyze this coding session data for academic integrity: ${JSON.stringify(sessionData).substring(0, 500)}...`;
            
            const response = await fetch('https://api-inference.huggingface.co/models/gpt2', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: analysisInput,
                    parameters: {
                        max_length: 150,
                        temperature: 0.7,
                        return_full_text: false
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`AI Analysis failed: ${response.statusText}`);
            }

            const result: any = await response.json();
            
            // Process AI response and create analysis report
            const suspiciousPatterns = this.detectSuspiciousPatterns(sessionData);
            const pasteAnalysis = this.analyzePastePatterns(sessionData);
            const focusAnalysis = this.analyzeFocusPatterns(sessionData);
            const productivityScore = this.calculateProductivityScore(sessionData);
            const recommendations = this.generateRecommendations(sessionData);

            const analysis: AIAnalysisResult = {
                id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                userId: sessionData.userId,
                sessionId: sessionData.sessionId,
                code: code,
                modelUsed: 'gpt2',
                timestamp: Date.now(),
                analysis: {
                    complexity: result[0]?.generated_text?.length || 0,
                    quality: productivityScore,
                    suggestions: result[0]?.generated_text ? [result[0].generated_text] : [],
                    patterns: suspiciousPatterns,
                    issues: pasteAnalysis.concat(focusAnalysis),
                    suspiciousActivity: suspiciousPatterns.length > 0,
                    productivityScore: productivityScore,
                    recommendations: recommendations
                }
            };

            // Store analysis result
            await this.storage.saveAIAnalysis(analysis);
            
            return analysis;
        } catch (error) {
            console.error('AI Analysis error:', error);
            throw error;
        }
    }

    private detectSuspiciousPatterns(sessionData: any): any {
        // Analyze for suspicious patterns
        const events = sessionData.events || [];
        const pasteEvents = events.filter((e: any) => e.type === 'keystroke_activity' && 
            e.data.suspiciousActivity);
        
        return {
            suspiciousPastes: pasteEvents.length,
            rapidTyping: events.filter((e: any) => e.type === 'keystroke_activity' && 
                e.data.totalChanges > 5).length,
            focusLoss: events.filter((e: any) => e.type === 'focus_change' && 
                !e.data.hasFocus).length
        };
    }

    private analyzePastePatterns(sessionData: any): any {
        const events = sessionData.events || [];
        const pasteEvents = events.filter((e: any) => 
            e.type === 'keystroke_activity' && e.data.suspiciousActivity);
        
        return {
            totalPastes: pasteEvents.length,
            averagePasteLength: pasteEvents.length > 0 ? 
                pasteEvents.reduce((sum: number, e: any) => sum + (e.data.changes[0]?.textLength || 0), 0) / pasteEvents.length : 0,
            codePatternPastes: pasteEvents.filter((e: any) => e.data.codePatterns).length
        };
    }

    private analyzeFocusPatterns(sessionData: any): any {
        const events = sessionData.events || [];
        const focusEvents = events.filter((e: any) => e.type === 'focus_change');
        
        return {
            totalFocusChanges: focusEvents.length,
            focusLossCount: focusEvents.filter((e: any) => !e.data.hasFocus).length,
            avgTimeAway: focusEvents.length > 0 ? 
                focusEvents.reduce((sum: number, e: any) => sum + (e.data.timeAway || 0), 0) / focusEvents.length : 0
        };
    }



    private generateRecommendations(sessionData: any): string[] {
        const recommendations = [];
        const suspicious = this.detectSuspiciousPatterns(sessionData);
        
        if (suspicious.suspiciousPastes > 3) {
            recommendations.push("High paste activity detected - review for potential copy-paste violations");
        }
        
        if (suspicious.focusLoss > 5) {
            recommendations.push("Frequent focus loss detected - student may be using external resources");
        }
        
        if (suspicious.rapidTyping > 10) {
            recommendations.push("Rapid typing patterns detected - may indicate non-original code");
        }
        
        if (recommendations.length === 0) {
            recommendations.push("No suspicious patterns detected - normal coding behavior");
        }
        
        return recommendations;
    }

    dispose(): void {
        this.disconnect();
        this.statusBarItem.dispose();
        this.telemetryCollectors.forEach(d => d.dispose());
        
        if (this.focusTrackingListener) {
            this.focusTrackingListener.dispose();
        }
        
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
    }
}