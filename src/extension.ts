// src/extension.ts
import * as vscode from "vscode";
import WebSocket from "ws";
import * as crypto from "crypto";
import { Manager } from "./manager";
import { Problem, Suggestion } from "./protocol";
import { SubmitProblemPanel } from "./panels/SubmitProblemPanel";
import { LiveFeedPanel } from "./panels/LiveFeedPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { LeaderboardPanel } from "./panels/LeaderboardPanel";
import { MainDashboard } from "./panels/MainDashboard";
import { TestInspectorPanel } from "./panels/TestInspectorPanel";
import { AiAnalysisPanel } from "./panels/AiAnalysisPanel";

let ws: WebSocket | undefined;
let sessionId: string | undefined;
const userId = "u_" + Math.random().toString(36).slice(2, 8);
let wsConnected = false;
let pendingInspectorAuth = false;
let isInspectorMode = false; // Track if this instance is acting as inspector
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
const maxReconnectAttempts = 10; // Increased from 5
const heartbeatInterval = 30000; // Send ping every 30 seconds
const configUrl = vscode.workspace.getConfiguration('conaint').get('serverUrl');
const SERVER_URL = (typeof configUrl === 'string' && configUrl) ? configUrl : "wss://conaint-extension.onrender.com";

// telemetry throttling
let lastSendTs = 0;
const MIN_SEND_INTERVAL_MS = 80;

function shortHash(s: string) {
  return crypto.createHash("sha256").update(s || "").digest("hex").slice(0, 10);
}

function connectToServer() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return; // Already connected or connecting
  }

  try {
    console.log("[Manager] Connecting to server:", SERVER_URL);
    ws = new WebSocket(SERVER_URL);
    
    ws.on("open", () => {
      wsConnected = true;
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      console.log("[Manager] Connected to server: " + SERVER_URL);
      vscode.window.showInformationMessage("[Manager] Connected to server: " + SERVER_URL);
      
      // Update all panels about connection status
      if (MainDashboard.current) {
        MainDashboard.current.updateConnectionStatus(true);
      }
      
      // Handle pending inspector auth
      if (pendingInspectorAuth) {
        sendWs({ type: "auth", role: "inspector", userId });
        pendingInspectorAuth = false;
      }

      // Start heartbeat to keep connection alive
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
      if (MainDashboard.current) {
        MainDashboard.current.updateConnectionStatus(false);
      }
      
      // Reconnect for most close codes except normal closure
      if (code !== 1000 && code !== 1001) {
        console.log(`[Manager] Connection closed with code ${code}, attempting reconnect...`);
        attemptReconnect();
      }
    });

    ws.on("message", (m: WebSocket.RawData) => {
      try {
        const data = JSON.parse(m.toString());
        console.log("[Manager] WS message received:", data);

        if (data.type === "problem.created") {
          const p = data.problem as Problem;
          Manager.getInstance().addProblem(p);
          if (LiveFeedPanel.current) LiveFeedPanel.current.postNewProblem(p);

        } else if (data.type === "suggestion.created") {
          const s = data.suggestion as Suggestion;
          Manager.getInstance().addSuggestion(s);
          if (LiveFeedPanel.current) LiveFeedPanel.current.postNewSuggestion(s);

        } else if (data.type && data.type.startsWith("telemetry")) {
          // Route telemetry to the appropriate instance based on data
          const isDemoData = data.userId && data.userId.startsWith('DEMO_');
          const targetInstance = InspectorPanel.getInstanceForTelemetry(isDemoData);
          if (targetInstance) {
            targetInstance.receiveTelemetry(data.userId, data.type, data.payload, data.ts, data.displayName);
          }

        } else if (data.type === "inspector.joined") {
          // Show notification to student that they're being monitored
          console.log("[Manager] Inspector joined message received");
          showMonitoringNotification();

        } else if (data.type === "joined") {
          // Alternative message for when student joins session
          console.log("[Manager] Student joined inspector session");
          showMonitoringNotification();

        } else if (data.type === "inspector.ended") {
          // Hide monitoring notification
          hideMonitoringNotification();
          sessionId = undefined;
          isInspectorMode = false; // Reset inspector mode

        } else if (data.type === "inspector.sessionStarted") {
          sessionId = data.sessionId;
          vscode.env.clipboard.writeText(data.sessionId);
          vscode.window.showInformationMessage(
            `[Manager] Inspector session created: ${data.sessionId} (copied to clipboard)`
          );
          console.log("[Manager] Inspector session created:", data.sessionId);
          if (MainDashboard.current) {
            MainDashboard.current.updateConnectionStatus(true, data.sessionId);
          }
        }
      } catch (e) {
        console.error("[Manager] Failed to process WS message:", e);
        vscode.window.showErrorMessage("[Manager] Failed to process WS message: " + (e instanceof Error ? e.message : String(e)));
      }
    });

  } catch (e) {
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
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.ping(); // Send WebSocket ping
        console.log("[Manager] Heartbeat ping sent");
      } catch (e) {
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

function sendWs(obj: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn("[Manager] WebSocket not connected, attempting to reconnect...");
    connectToServer();
    return;
  }
  
  try {
    ws.send(JSON.stringify(obj));
  } catch (e) {
    console.error("WebSocket send failed:", e);
    wsConnected = false;
    attemptReconnect();
  }
}

let monitoringStatusBar: vscode.StatusBarItem | undefined;
let sessionTimer: NodeJS.Timeout | undefined;

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
  vscode.window.showWarningMessage(
    "🔍 Inspector Session Active: Your VS Code activity is being monitored. Session time will be displayed in the status bar.",
    "Understood"
  );

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
  vscode.window.showWarningMessage(
    "🧪 DEMO MODE: Simulating student monitoring experience. This is NOT a real session.",
    "Understood"
  );

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

export function activate(context: vscode.ExtensionContext) {
  const manager = Manager.getInstance();
  
  // Initialize persistence
  manager.initialize(context);
  
  // Also initialize the old storage system if still used elsewhere
  const { initStorage } = require('./storage');
  initStorage(context);
  
  // Initialize panels with context for persistence
  AiAnalysisPanel.setContext(context);
  
  // Also initialize SubmitProblemPanel for form data persistence
  const { SubmitProblemPanel } = require('./panels/SubmitProblemPanel');
  SubmitProblemPanel.setContext(context);

  // Connect to server with automatic reconnection
  connectToServer();

  // commands
  context.subscriptions.push(

    vscode.commands.registerCommand("manager.openDashboard", () => {
      MainDashboard.create();
    }),

    vscode.commands.registerCommand("manager.submitProblem", () => {
      SubmitProblemPanel.create(context.extensionUri);
    }),

    vscode.commands.registerCommand("manager.openLiveFeed", () => {
      const data = manager.getData();
      LiveFeedPanel.create(data.problems || []);
    }),

    vscode.commands.registerCommand("manager.startInspector", () => {
      if (!wsConnected) {
        vscode.window.showInformationMessage(
          "Connecting to CONAINT server..."
        );
        pendingInspectorAuth = true;
        connectToServer(); // Attempt to connect
      } else {
        sendWs({ type: "auth", role: "inspector", userId });
      }
      InspectorPanel.create();
      // Clear any existing student session when starting inspector mode
      sessionId = undefined;
      isInspectorMode = true; // Mark as inspector mode
      hideMonitoringNotification();
      console.log("[Manager] Inspector mode activated - telemetry disabled for this instance");
    }),

    vscode.commands.registerCommand("manager.testInspector", async () => {
      // Ask for confirmation
      const choice = await vscode.window.showWarningMessage(
        "This will start Demo Inspector Mode with fake data. This is separate from the real inspector and won't affect actual sessions.",
        { modal: true },
        "Start Demo",
        "Cancel"
      );
      
      if (choice !== "Start Demo") {
        return;
      }
      
      // Create inspector panel for testing (demo mode)
      InspectorPanel.create(true); // true = demo mode
      
      // Show demo info
      vscode.window.showInformationMessage("🧪 DEMO MODE: Generating fake student activity...", "Got it");
      
      // Simulate some test users and activity after a short delay
      setTimeout(() => {
        const demoInstance = InspectorPanel.demoInstance;
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
              demoInstance.receiveTelemetry(
                user.userId, 
                "telemetry.keystroke", 
                { file: "demo_main.py", sample: "print('Hello Demo')" }, 
                Date.now(), 
                user.displayName
              );
              
              // Add some random activity
              setTimeout(() => {
                demoInstance.receiveTelemetry(
                  user.userId, 
                  "telemetry.paste", 
                  { file: "demo_helper.py", sample: "# Demo pasted code\\nimport pandas as pd" }, 
                  Date.now()
                );
              }, 2000 + index * 1000);
              
              // Add more varied demo activity
              setTimeout(() => {
                demoInstance.receiveTelemetry(
                  user.userId, 
                  "telemetry.openfile", 
                  { file: "demo_config.json", preview: '{"demo": true, "test": "data"}' }, 
                  Date.now()
                );
              }, 4000 + index * 1500);
              
            }, index * 500);
          });
        }
      }, 1000);
    }),

    vscode.commands.registerCommand("manager.joinInspector", async () => {
      const sid = await vscode.window.showInputBox({ prompt: "Enter Inspector Session ID" });
      if (!sid) return;
      const displayName = await vscode.window.showInputBox({ prompt: "Enter your display name" });
      if (!displayName) return;
      sessionId = sid;
      isInspectorMode = false; // This is student mode, not inspector mode
      vscode.window.showInformationMessage("Joined inspector session: " + sid);
      if (ws) sendWs({ type: "auth", role: "client", userId, sessionId: sid, displayName });
    }),

    vscode.commands.registerCommand("manager._internal.joinInspector", (data: { sessionId: string, displayName: string }) => {
      sessionId = data.sessionId;
      isInspectorMode = false; // This is student mode, not inspector mode
      if (ws) sendWs({ type: "auth", role: "client", userId, sessionId: data.sessionId, displayName: data.displayName });
    }),

    vscode.commands.registerCommand("manager.testStudentView", async () => {
      // Ask for confirmation
      const choice = await vscode.window.showWarningMessage(
        "This will simulate the student monitoring view (demo only). This won't affect real sessions.",
        { modal: true },
        "Start Demo",
        "Cancel"
      );
      
      if (choice !== "Start Demo") {
        return;
      }
      
      // Simulate student being monitored (for testing on same PC)
      sessionId = "DEMO-session-" + Date.now();
      isInspectorMode = false; // This simulates being a student, not inspector
      showDemoMonitoringNotification();
      vscode.window.showInformationMessage("🧪 DEMO: Student monitoring view activated (fake session)");
    }),

    vscode.commands.registerCommand("manager.testSimpleInspector", () => {
      console.log("[Manager] Creating test inspector panel...");
      TestInspectorPanel.create();
      vscode.window.showInformationMessage("🧪 Test Inspector Panel Created - Check if timer works");
    }),

    vscode.commands.registerCommand("manager.openAiAnalysis", () => {
      AiAnalysisPanel.create();
    }),

    vscode.commands.registerCommand("manager.openLeaderboard", () => {
      const data = manager.getData();
      const counts: Record<string, number> = {};
      (data.problems || []).forEach((p: Problem) =>
        (p.suggestions || []).forEach((s: Suggestion) => {
          const author = (s as any).authorId || "anon";
          counts[author] = (counts[author] || 0) + 1;
        })
      );
      const lines = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([u, n], i) => `${i + 1}. ${u} — ${n} pts`);
      LeaderboardPanel.show(lines);
    }),

    vscode.commands.registerCommand("manager._internal.handleSubmit", (problem: Problem) => {
      // Set proper owner ID
      problem.ownerId = userId;
      manager.addProblem(problem);
      if (LiveFeedPanel.current) LiveFeedPanel.current.postNewProblem(problem);
      if (ws) sendWs({ type: "problem.create", problem });
    }),

    vscode.commands.registerCommand("manager._internal.handleSuggest", (s: Suggestion) => {
      Manager.getInstance().addSuggestion(s);
      if (LiveFeedPanel.current) LiveFeedPanel.current.postNewSuggestion(s);
      if (ws) sendWs({ type: "suggestion.create", suggestion: s });
    }),

    vscode.commands.registerCommand("manager._internal.checkConnection", () => {
      // Check WebSocket connection and update dashboard
      if (MainDashboard.current) {
        const connected = ws && ws.readyState === WebSocket.OPEN;
        if (!connected && wsConnected) {
          // Connection lost, update state and attempt reconnect
          wsConnected = false;
          console.log("[Manager] Connection health check failed, attempting reconnect...");
          connectToServer();
        }
        MainDashboard.current.updateConnectionStatus(!!(connected && wsConnected), sessionId);
      }
    })
  );

  // telemetry - only send when in an active session AND not in inspector mode
  vscode.workspace.onDidChangeTextDocument((event) => {
    try {
      // Don't send telemetry if we're the inspector or not in a student session
      if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session")) return;
      
      const now = Date.now();
      if (now - lastSendTs < MIN_SEND_INTERVAL_MS) return;
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
          if (sessionId) sendWs({ type: "telemetry.paste", userId, sessionId, payload });
          // Only send to inspector if there's an active session AND an inspector is running
          const inspectorInstance = InspectorPanel.getInstanceForTelemetry(false);
          if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
            inspectorInstance.receiveTelemetry(userId, "telemetry.paste", payload, now);
        } else {
          if (sessionId) sendWs({ type: "telemetry.keystroke", userId, sessionId, payload });
          // Only send to inspector if there's an active session AND an inspector is running  
          const inspectorInstance = InspectorPanel.getInstanceForTelemetry(false);
          if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
            inspectorInstance.receiveTelemetry(userId, "telemetry.keystroke", payload, now);
        }
      });
    } catch (e) {
      console.error("Telemetry error:", e);
    }
  });

  vscode.window.onDidChangeTextEditorSelection((event) => {
    try {
      // Don't send telemetry if we're the inspector or not in a student session
      if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session")) return;
      
      const sel = event.selections && event.selections[0];
      if (!sel) return;
      const doc = event.textEditor.document;
      const text = doc.getText();
      const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
      const payload = {
        file: doc.fileName,
        pos: { line: sel.active.line, character: sel.active.character },
        preview
      };
      const now = Date.now();
      if (now - lastSendTs < MIN_SEND_INTERVAL_MS) return;
      lastSendTs = now;

      if (sessionId) sendWs({ type: "telemetry.cursor", userId, sessionId, payload });
      // Only send to inspector if there's an active session AND an inspector is running
      const inspectorInstance = InspectorPanel.getInstanceForTelemetry(false);
      if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
        inspectorInstance.receiveTelemetry(userId, "telemetry.cursor", payload, now);
    } catch (e) {
      console.error("Cursor telemetry error:", e);
    }
  });

  vscode.workspace.onDidOpenTextDocument((doc) => {
    // Don't send telemetry if we're the inspector or not in a student session
    if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session")) return;
    
    const text = doc.getText();
    const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
    const payload = { file: doc.fileName, preview };
    const now = Date.now();
    if (sessionId) sendWs({ type: "telemetry.openfile", userId, sessionId, payload });
    // Only send to inspector if there's an active session AND an inspector is running
    const inspectorInstance = InspectorPanel.getInstanceForTelemetry(false);
    if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
      inspectorInstance.receiveTelemetry(userId, "telemetry.openfile", payload, now);
  });

  // Monitor window state changes
  vscode.window.onDidChangeWindowState((state) => {
    // Don't send telemetry if we're the inspector or not in a student session
    if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session")) return;
    
    const payload = { 
      focused: state.focused,
      timestamp: Date.now(),
      windowState: state.focused ? 'focused' : 'unfocused'
    };
    const now = Date.now();
    if (sessionId) sendWs({ type: "telemetry.focus", userId, sessionId, payload });
    // Only send to inspector if there's an active session AND an inspector is running
    const inspectorInstance = InspectorPanel.getInstanceForTelemetry(false);
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
    if (sessionId) sendWs({ type: "telemetry.extension", userId, sessionId, payload });
    // Only send to inspector if there's an active session AND an inspector is running
    const inspectorInstance = InspectorPanel.getInstanceForTelemetry(false);
    if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
      inspectorInstance.receiveTelemetry(userId, "telemetry.extension", payload, now);
  }

  // intercept paste
  context.subscriptions.push(
    vscode.commands.registerCommand("manager.interceptPaste", async () => {
      try {
        // Don't send telemetry if we're the inspector or not in a student session
        if (isInspectorMode || !sessionId || sessionId.startsWith("DEMO-session")) return;
        
        const clip = await vscode.env.clipboard.readText();
        const payload = {
          file: vscode.window.activeTextEditor?.document.fileName,
          length: clip.length,
          sample: clip.slice(0, 80),
        };
        const now = Date.now();
        if (sessionId) sendWs({ type: "telemetry.paste", userId, sessionId, payload });
        // Only send to inspector if there's an active session AND an inspector is running
        const inspectorInstance = InspectorPanel.getInstanceForTelemetry(false);
        if (inspectorInstance && sessionId && sessionId !== "DEMO-session")
          inspectorInstance.receiveTelemetry(userId, "telemetry.paste", payload, now);
        await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
      } catch (e) {
        console.error("Paste intercept error:", e);
      }
    })
  );
}

export function deactivate() {
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
    } catch (e) {
      console.error("WebSocket close failed:", e);
    }
  }
  
  wsConnected = false;
  reconnectAttempts = 0;
}
