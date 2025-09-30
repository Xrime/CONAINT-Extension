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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ws_1 = __importDefault(require("ws"));
const crypto = __importStar(require("crypto"));
const manager_1 = require("./manager");
const LiveFeedPanel_1 = require("./panels/LiveFeedPanel");
const InspectorPanel_1 = require("./panels/InspectorPanel");
const LeaderboardPanel_1 = require("./panels/LeaderboardPanel");
const MainDashboard_1 = require("./panels/MainDashboard");
const TestInspectorPanel_1 = require("./panels/TestInspectorPanel");
const AiAnalysisPanel_1 = require("./panels/AiAnalysisPanel");
let ws;
let sessionId;
const userId = "u_" + Math.random().toString(36).slice(2, 8);
let wsConnected = false;
let pendingInspectorAuth = false;
let isInspectorMode = false;
let reconnectAttempts = 0;
let reconnectTimer;
let heartbeatTimer;
const maxReconnectAttempts = 10;
const heartbeatInterval = 30000;
const configUrl = vscode.workspace.getConfiguration('conaint').get('serverUrl');
const SERVER_URL = (typeof configUrl === 'string' && configUrl) ? configUrl : "wss://conaint-extension.onrender.com";
let lastSendTs = 0;
const MIN_SEND_INTERVAL_MS = 80;
function shortHash(s) {
    return crypto.createHash("sha256").update(s || "").digest("hex").slice(0, 10);
}
function connectToServer() {
    if (ws && (ws.readyState === ws_1.default.CONNECTING || ws.readyState === ws_1.default.OPEN)) {
        return;
    }
    try {
        console.log("[Manager] Connecting to server:", SERVER_URL);
        ws = new ws_1.default(SERVER_URL);
        ws.on("open", () => {
            wsConnected = true;
            reconnectAttempts = 0;
            console.log("[Manager] Connected to server: " + SERVER_URL);
            vscode.window.showInformationMessage("[Manager] Connected to server: " + SERVER_URL);
            if (MainDashboard_1.MainDashboard.current) {
                MainDashboard_1.MainDashboard.current.updateConnectionStatus(true);
            }
            if (pendingInspectorAuth) {
                sendWs({ type: "auth", role: "inspector", userId });
                pendingInspectorAuth = false;
            }
            startHeartbeat();
        });
        ws.on("error", (err) => {
            console.error("[Manager] WebSocket error:", err);
            wsConnected = false;
            attemptReconnect();
        });
        ws.on("close", (code, reason) => {
            wsConnected = false;
            stopHeartbeat(); // Stop heartbeat when connection closes
            console.warn("[Manager] WebSocket connection closed:", code, reason.toString());
            // Update all panels about connection status
            if (MainDashboard_1.MainDashboard.current) {
                MainDashboard_1.MainDashboard.current.updateConnectionStatus(false);
            }
            // Reconnect for most close codes except normal closure
            if (code !== 1000 && code !== 1001) {
                console.log(`[Manager] Connection closed with code ${code}, attempting reconnect...`);
                attemptReconnect();
            }
        });
        ws.on("message", (m) => {
            try {
                const data = JSON.parse(m.toString());
                console.log("[Manager] WS message received:", data);
                if (data.type === "problem.created") {
                    const p = data.problem;
                    manager_1.Manager.getInstance().addProblem(p);
                    if (LiveFeedPanel_1.LiveFeedPanel.current)
                        LiveFeedPanel_1.LiveFeedPanel.current.postNewProblem(p);
                }
                else if (data.type === "suggestion.created") {
                    const s = data.suggestion;
                    manager_1.Manager.getInstance().addSuggestion(s);
                    if (LiveFeedPanel_1.LiveFeedPanel.current)
                        LiveFeedPanel_1.LiveFeedPanel.current.postNewSuggestion(s);
                }
                else if (data.type && data.type.startsWith("telemetry")) {
                    // Route telemetry to the appropriate instance based on data
                    const isDemoData = data.userId && data.userId.startsWith('DEMO_');
                    const targetInstance = InspectorPanel_1.InspectorPanel.getInstanceForTelemetry(isDemoData);
                    if (targetInstance) {
                        targetInstance.receiveTelemetry(data.userId, data.type, data.payload, data.ts, data.displayName);
                    }
                }
                else if (data.type === "inspector.joined") {
                    // Show notification to student that they're being monitored
                    console.log("[Manager] Inspector joined message received");
                    showMonitoringNotification();
                }
                else if (data.type === "joined") {
                    // Alternative message for when student joins session
                    console.log("[Manager] Student joined inspector session");
                    showMonitoringNotification();
                }
                else if (data.type === "inspector.ended") {
                    // Hide monitoring notification
                    hideMonitoringNotification();
                    sessionId = undefined;
                    isInspectorMode = false; // Reset inspector mode
                }
                else if (data.type === "inspector.sessionStarted") {
                    sessionId = data.sessionId;
                    vscode.env.clipboard.writeText(data.sessionId);
                    vscode.window.showInformationMessage(`[Manager] Inspector session created: ${data.sessionId} (copied to clipboard)`);
                    console.log("[Manager] Inspector session created:", data.sessionId);
                    if (MainDashboard_1.MainDashboard.current) {
                        MainDashboard_1.MainDashboard.current.updateConnectionStatus(true, data.sessionId);
                    }
                }
                else if (data.type === "globalProblems.response") {
                    // Handle global problems response
                    console.log("[Manager] Received global problems:", data.problems?.length || 0, "problems");
                    if (data.problems && data.suggestions) {
                        manager_1.Manager.getInstance().syncGlobalProblems(data.problems, data.suggestions);
                        // Update Live Feed with global problems
                        if (LiveFeedPanel_1.LiveFeedPanel.current) {
                            data.problems.forEach((problem) => {
                                LiveFeedPanel_1.LiveFeedPanel.current.postNewProblem(problem);
                            });
                            data.suggestions.forEach((suggestion) => {
                                LiveFeedPanel_1.LiveFeedPanel.current.postNewSuggestion(suggestion);
                            });
                        }
                        vscode.window.showInformationMessage(`[CONAINT] Loaded ${data.problems.length} recent problems from the community!`);
                    }
                }
            }
            catch (e) {
                console.error("[Manager] Failed to process WS message:", e);
                vscode.window.showErrorMessage("[Manager] Failed to process WS message: " + (e instanceof Error ? e.message : String(e)));
            }
        });
    }
    catch (e) {
        console.error("[Manager] WebSocket connection failed:", e);
        wsConnected = false;
        attemptReconnect();
    }
}
function startHeartbeat() {
    // Clear any existing heartbeat
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
    }
    heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === ws_1.default.OPEN) {
            try {
                ws.ping(); // Send WebSocket ping
                console.log("[Manager] Heartbeat ping sent");
            }
            catch (e) {
                console.warn("[Manager] Heartbeat ping failed:", e);
                wsConnected = false;
                attemptReconnect();
            }
        }
    }, heartbeatInterval);
}
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
    }
}
function attemptReconnect() {
    // Stop heartbeat during reconnection
    stopHeartbeat();
    if (reconnectAttempts >= maxReconnectAttempts) {
        vscode.window.showErrorMessage("[Manager] Failed to connect to server after multiple attempts. Please check your connection.");
        return;
    }
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000); // Exponential backoff, max 30s
    console.log(`[Manager] Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts}) in ${delay}ms...`);
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
    reconnectTimer = setTimeout(() => {
        connectToServer();
    }, delay);
}
function sendWs(obj) {
    if (!ws || ws.readyState !== ws_1.default.OPEN) {
        console.warn("[Manager] WebSocket not connected, attempting to reconnect...");
        connectToServer();
        return;
    }
    try {
        ws.send(JSON.stringify(obj));
    }
    catch (e) {
        console.error("WebSocket send failed:", e);
        wsConnected = false;
        attemptReconnect();
    }
}
let monitoringStatusBar;
let sessionTimer;
function showMonitoringNotification() {
    // Create status bar item for monitoring indicator
    if (!monitoringStatusBar) {
        monitoringStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        monitoringStatusBar.text = "🔍 Being Monitored";
        monitoringStatusBar.tooltip = "Your VS Code activity is being monitored by an inspector";
        monitoringStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        monitoringStatusBar.show();
    }
    // Show initial notification
    vscode.window.showWarningMessage("🔍 Inspector Session Active: Your VS Code activity is being monitored. Session time will be displayed in the status bar.", "Understood");
    // Start session timer for student
    let sessionStart = Date.now();
    sessionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (monitoringStatusBar) {
            monitoringStatusBar.text = `🔍 Monitored ${timeStr}`;
        }
    }, 1000);
}
function hideMonitoringNotification() {
    if (monitoringStatusBar) {
        monitoringStatusBar.hide();
        monitoringStatusBar.dispose();
        monitoringStatusBar = undefined;
    }
    if (sessionTimer) {
        clearInterval(sessionTimer);
        sessionTimer = undefined;
    }
    vscode.window.showInformationMessage("Inspector session ended. Monitoring has stopped.");
}
function showDemoMonitoringNotification() {
    // Create status bar item for DEMO monitoring indicator
    if (!monitoringStatusBar) {
        monitoringStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        monitoringStatusBar.text = "🧪 DEMO Monitored";
        monitoringStatusBar.tooltip = "DEMO MODE: Simulating student monitoring experience";
        monitoringStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        monitoringStatusBar.show();
    }
    // Show initial demo notification
    vscode.window.showWarningMessage("🧪 DEMO MODE: Simulating student monitoring experience. This is NOT a real session.", "Understood");
    // Start demo session timer
    let sessionStart = Date.now();
    sessionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (monitoringStatusBar) {
            monitoringStatusBar.text = `🧪 DEMO ${timeStr}`;
        }
    }, 1000);
}
function activate(context) {
    const manager = manager_1.Manager.getInstance();
    // Initialize persistence
    manager.initialize(context);
    // Also initialize the old storage system if still used elsewhere
    const { initStorage } = require('./storage');
    initStorage(context);
    // Initialize panels with context for persistence
    AiAnalysisPanel_1.AiAnalysisPanel.setContext(context);
    // Also initialize SubmitProblemPanel for form data persistence
    const { SubmitProblemPanel } = require('./panels/SubmitProblemPanel');
    SubmitProblemPanel.setContext(context);
    // Connect to server with automatic reconnection
    connectToServer();
    // commands
    context.subscriptions.push(vscode.commands.registerCommand("manager.openDashboard", () => {
        MainDashboard_1.MainDashboard.create();
    }), vscode.commands.registerCommand("manager.submitProblem", () => {
        SubmitProblemPanel.create(context.extensionUri);
    }), vscode.commands.registerCommand("manager.openLiveFeed", () => {
        const data = manager.getData();
        LiveFeedPanel_1.LiveFeedPanel.create(data.problems || []);
    }), vscode.commands.registerCommand("manager.startInspector", () => {
        if (!wsConnected) {
            vscode.window.showInformationMessage("Connecting to CONAINT server...");
            pendingInspectorAuth = true;
            connectToServer(); // Attempt to connect
        }
        else {
            sendWs({ type: "auth", role: "inspector", userId });
        }
        InspectorPanel_1.InspectorPanel.create();
        // Clear any existing student session when starting inspector mode
        sessionId = undefined;
        isInspectorMode = true; // Mark as inspector mode
        hideMonitoringNotification();
        console.log("[Manager] Inspector mode activated - telemetry disabled for this instance");
    }), vscode.commands.registerCommand("manager.testInspector", async () => {
        // Ask for confirmation
        const choice = await vscode.window.showWarningMessage("This will start Demo Inspector Mode with fake data. This is separate from the real inspector and won't affect actual sessions.", { modal: true }, "Start Demo", "Cancel");
        if (choice !== "Start Demo") {
            return;
        }
        // Create inspector panel for testing (demo mode)
        InspectorPanel_1.InspectorPanel.create(true); // true = demo mode
        // Show demo info
        vscode.window.showInformationMessage("🧪 DEMO MODE: Generating fake student activity...", "Got it");
        // Simulate some test users and activity after a short delay
        setTimeout(() => {
            const demoInstance = InspectorPanel_1.InspectorPanel.demoInstance;
            if (demoInstance) {
                console.log("[Manager] DEMO MODE: Generating test data for inspector...");
                // Simulate test users with DEMO prefix
                const testUsers = [
                    { userId: "DEMO_student_001", displayName: "Demo: Alice Johnson" },
                    { userId: "DEMO_student_002", displayName: "Demo: Bob Smith" },
                    { userId: "DEMO_student_003", displayName: "Demo: Carol Davis" }
                ];
                testUsers.forEach((user, index) => {
                    setTimeout(() => {
                        // Simulate user joining
                        demoInstance.receiveTelemetry(user.userId, "telemetry.keystroke", { file: "demo_main.py", sample: "print('Hello Demo')" }, Date.now(), user.displayName);
                        // Add some random activity
                        setTimeout(() => {
                            demoInstance.receiveTelemetry(user.userId, "telemetry.paste", { file: "demo_helper.py", sample: "# Demo pasted code\\nimport pandas as pd" }, Date.now());
                        }, 2000 + index * 1000);
                        // Add more varied demo activity
                        setTimeout(() => {
                            demoInstance.receiveTelemetry(user.userId, "telemetry.openfile", { file: "demo_config.json", preview: '{"demo": true, "test": "data"}' }, Date.now());
                        }, 4000 + index * 1500);
                    }, index * 500);
                });
            }
        }, 1000);
    }), vscode.commands.registerCommand("manager.joinInspector", async () => {
        const sid = await vscode.window.showInputBox({ prompt: "Enter Inspector Session ID" });
        if (!sid)
            return;
        const displayName = await vscode.window.showInputBox({ prompt: "Enter your display name" });
        if (!displayName)
            return;
        sessionId = sid;
        isInspectorMode = false; // This is student mode, not inspector mode
        vscode.window.showInformationMessage("Joined inspector session: " + sid);
        if (ws)
            sendWs({ type: "auth", role: "client", userId, sessionId: sid, displayName });
    }), vscode.commands.registerCommand("manager._internal.joinInspector", (data) => {
        sessionId = data.sessionId;
        isInspectorMode = false; // This is student mode, not inspector mode
        if (ws)
            sendWs({ type: "auth", role: "client", userId, sessionId: data.sessionId, displayName: data.displayName });
    }), vscode.commands.registerCommand("manager.testStudentView", async () => {
        // Ask for confirmation
        const choice = await vscode.window.showWarningMessage("This will simulate the student monitoring view (demo only). This won't affect real sessions.", { modal: true }, "Start Demo", "Cancel");
        if (choice !== "Start Demo") {
            return;
        }
        // Simulate student being monitored (for testing on same PC)
        sessionId = "DEMO-session-" + Date.now();
        isInspectorMode = false; // This simulates being a student, not inspector
        showDemoMonitoringNotification();
        vscode.window.showInformationMessage("🧪 DEMO: Student monitoring view activated (fake session)");
    }), vscode.commands.registerCommand("manager.testSimpleInspector", () => {
        console.log("[Manager] Creating test inspector panel...");
        TestInspectorPanel_1.TestInspectorPanel.create();
        vscode.window.showInformationMessage("🧪 Test Inspector Panel Created - Check if timer works");
    }), vscode.commands.registerCommand("manager.openAiAnalysis", () => {
        AiAnalysisPanel_1.AiAnalysisPanel.create();
    }), vscode.commands.registerCommand("manager.openLeaderboard", () => {
        const data = manager.getData();
        const counts = {};
        (data.problems || []).forEach((p) => (p.suggestions || []).forEach((s) => {
            const author = s.authorId || "anon";
            counts[author] = (counts[author] || 0) + 1;
        }));
        const lines = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([u, n], i) => `${i + 1}. ${u} — ${n} pts`);
        LeaderboardPanel_1.LeaderboardPanel.show(lines);
    }), vscode.commands.registerCommand("manager._internal.handleSubmit", (problem) => {
        // Set proper owner ID
        problem.ownerId = userId;
        manager.addProblem(problem);
        if (LiveFeedPanel_1.LiveFeedPanel.current)
            LiveFeedPanel_1.LiveFeedPanel.current.postNewProblem(problem);
        if (ws)
            sendWs({ type: "problem.create", problem });
    }), vscode.commands.registerCommand("manager._internal.handleSuggest", (s) => {
        manager_1.Manager.getInstance().addSuggestion(s);
        if (LiveFeedPanel_1.LiveFeedPanel.current)
            LiveFeedPanel_1.LiveFeedPanel.current.postNewSuggestion(s);
        if (ws)
            sendWs({ type: "suggestion.create", suggestion: s });
    }), vscode.commands.registerCommand("manager._internal.checkConnection", () => {
        // Check WebSocket connection and update dashboard
        if (MainDashboard_1.MainDashboard.current) {
            const connected = ws && ws.readyState === ws_1.default.OPEN;
            if (!connected && wsConnected) {
                // Connection lost, update state and attempt reconnect
                wsConnected = false;
                console.log("[Manager] Connection health check failed, attempting reconnect...");
                connectToServer();
            }
            MainDashboard_1.MainDashboard.current.updateConnectionStatus(!!(connected && wsConnected), sessionId);
        }
    }), vscode.commands.registerCommand("manager._internal.requestGlobalProblems", () => {
        // Request global problems from server for new users
        console.log("[Manager] Requesting global problems from server...");
        if (ws && ws.readyState === ws_1.default.OPEN) {
            sendWs({
                type: "request.globalProblems",
                userId,
                requestRecent: true,
                days: 7 // Get problems from last 7 days
            });
        }
        else {
            console.log("[Manager] Cannot request global problems - not connected to server");
        }
    }));
    // telemetry - only send when in an active session AND not in inspector mode
    vscode.workspace.onDidChangeTextDocument((event) => {
        try {
            // Don't send telemetry if we're the inspector or not in a student session
            if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session"))
                return;
            const now = Date.now();
            if (now - lastSendTs < MIN_SEND_INTERVAL_MS)
                return;
            lastSendTs = now;
            event.contentChanges.forEach((change) => {
                const inserted = change.text || "";
                const payload = {
                    file: event.document.fileName,
                    len: inserted.length,
                    snippetHash: shortHash(inserted),
                    sample: inserted.length > 200 ? inserted.slice(0, 40) + "…" : inserted,
                };
                if (inserted.length > 30) {
                    if (sessionId)
                        sendWs({ type: "telemetry.paste", userId, sessionId, payload });
                    // Only send to inspector if there's an active session AND an inspector is running
                    const inspectorInstance = InspectorPanel_1.InspectorPanel.getInstanceForTelemetry(false);
                    if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
                        inspectorInstance.receiveTelemetry(userId, "telemetry.paste", payload, now);
                }
                else {
                    if (sessionId)
                        sendWs({ type: "telemetry.keystroke", userId, sessionId, payload });
                    // Only send to inspector if there's an active session AND an inspector is running  
                    const inspectorInstance = InspectorPanel_1.InspectorPanel.getInstanceForTelemetry(false);
                    if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
                        inspectorInstance.receiveTelemetry(userId, "telemetry.keystroke", payload, now);
                }
            });
        }
        catch (e) {
            console.error("Telemetry error:", e);
        }
    });
    vscode.window.onDidChangeTextEditorSelection((event) => {
        try {
            // Don't send telemetry if we're the inspector or not in a student session
            if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session"))
                return;
            const sel = event.selections && event.selections[0];
            if (!sel)
                return;
            const doc = event.textEditor.document;
            const text = doc.getText();
            const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
            const payload = {
                file: doc.fileName,
                pos: { line: sel.active.line, character: sel.active.character },
                preview
            };
            const now = Date.now();
            if (now - lastSendTs < MIN_SEND_INTERVAL_MS)
                return;
            lastSendTs = now;
            if (sessionId)
                sendWs({ type: "telemetry.cursor", userId, sessionId, payload });
            // Only send to inspector if there's an active session AND an inspector is running
            const inspectorInstance = InspectorPanel_1.InspectorPanel.getInstanceForTelemetry(false);
            if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
                inspectorInstance.receiveTelemetry(userId, "telemetry.cursor", payload, now);
        }
        catch (e) {
            console.error("Cursor telemetry error:", e);
        }
    });
    vscode.workspace.onDidOpenTextDocument((doc) => {
        // Don't send telemetry if we're the inspector or not in a student session
        if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session"))
            return;
        const text = doc.getText();
        const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
        const payload = { file: doc.fileName, preview };
        const now = Date.now();
        if (sessionId)
            sendWs({ type: "telemetry.openfile", userId, sessionId, payload });
        // Only send to inspector if there's an active session AND an inspector is running
        const inspectorInstance = InspectorPanel_1.InspectorPanel.getInstanceForTelemetry(false);
        if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
            inspectorInstance.receiveTelemetry(userId, "telemetry.openfile", payload, now);
    });
    // Monitor window state changes
    vscode.window.onDidChangeWindowState((state) => {
        // Don't send telemetry if we're the inspector or not in a student session
        if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session"))
            return;
        const payload = {
            focused: state.focused,
            timestamp: Date.now(),
            windowState: state.focused ? 'focused' : 'unfocused'
        };
        const now = Date.now();
        if (sessionId)
            sendWs({ type: "telemetry.focus", userId, sessionId, payload });
        // Only send to inspector if there's an active session AND an inspector is running
        const inspectorInstance = InspectorPanel_1.InspectorPanel.getInstanceForTelemetry(false);
        if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
            inspectorInstance.receiveTelemetry(userId, "telemetry.focus", payload, now);
    });
    // Monitor active extensions (basic detection)
    const activeExtensions = vscode.extensions.all
        .filter(ext => ext.isActive)
        .map(ext => ({ id: ext.id, displayName: ext.packageJSON.displayName }));
    // Don't send telemetry if we're the inspector or not in a student session
    if (!isInspectorMode && sessionId && !sessionId.startsWith("DEMO-session") && activeExtensions.length > 0) {
        const payload = {
            extensions: activeExtensions,
            count: activeExtensions.length
        };
        const now = Date.now();
        if (sessionId)
            sendWs({ type: "telemetry.extension", userId, sessionId, payload });
        // Only send to inspector if there's an active session AND an inspector is running
        const inspectorInstance = InspectorPanel_1.InspectorPanel.getInstanceForTelemetry(false);
        if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
            inspectorInstance.receiveTelemetry(userId, "telemetry.extension", payload, now);
    }
    // intercept paste
    context.subscriptions.push(vscode.commands.registerCommand("manager.interceptPaste", async () => {
        try {
            // Don't send telemetry if we're the inspector or not in a student session
            if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session"))
                return;
            const clip = await vscode.env.clipboard.readText();
            const payload = {
                file: vscode.window.activeTextEditor?.document.fileName,
                length: clip.length,
                sample: clip.slice(0, 80),
            };
            const now = Date.now();
            if (sessionId)
                sendWs({ type: "telemetry.paste", userId, sessionId, payload });
            // Only send to inspector if there's an active session AND an inspector is running
            const inspectorInstance = InspectorPanel_1.InspectorPanel.getInstanceForTelemetry(false);
            if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
                inspectorInstance.receiveTelemetry(userId, "telemetry.paste", payload, now);
            await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
        }
        catch (e) {
            console.error("Paste intercept error:", e);
        }
    }));
}
function deactivate() {
    // Clean up monitoring UI
    hideMonitoringNotification();
    // Clear timers
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
    }
    stopHeartbeat();
    // Close WebSocket connection gracefully
    if (ws) {
        try {
            ws.close(1000, "Extension deactivated"); // Normal closure
            ws = undefined;
        }
        catch (e) {
            console.error("WebSocket close failed:", e);
        }
    }
    wsConnected = false;
    reconnectAttempts = 0;
}
//# sourceMappingURL=extension.js.map