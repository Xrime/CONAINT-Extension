const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Environment-aware configuration
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// WebSocket server initialization
const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`CONAINT WebSocket server running on ws://${HOST}:${PORT}`);
  console.log('🚀 CONAINT is ready for online academic integrity monitoring!');
});

// ⭐ CRITICAL: In-memory data structures
const sessions = {};      // Active inspector sessions
const problems = [];      // Community problems
const suggestions = [];   // Problem suggestions

// ⭐ CRITICAL: Safe message sending
function send(ws, obj) {
  try { 
    ws.send(JSON.stringify(obj)); 
  } catch (e) {
    // Connection might be closed - fail silently
  }
}

// ⭐ PERFORMANCE: Efficient broadcasting to inspector
function broadcastToInspector(sessionId, obj) {
  const session = sessions[sessionId];
  if (!session || !session.inspectorSocket) return;
  
  try {
    session.inspectorSocket.send(JSON.stringify(obj));
  } catch (e) {
    console.error("Failed to send to inspector:", e);
    // Could add reconnection logic here
  }
}

// ⭐ PERFORMANCE: Efficient broadcasting to all clients
function broadcast(obj) {
  const s = JSON.stringify(obj);  // Serialize once
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(s);  // Send to all
  });
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('[Server] New client connected');
  
  // Initialize connection metadata
  ws._meta = {
    userId: null,
    sessionId: null,
    role: null,
    displayName: null,
    connectedAt: Date.now()
  };

  // ⭐ MOST IMPORTANT: Message handler
  ws.on('message', (raw) => {
    let data;
    try { 
      data = JSON.parse(raw); 
    } catch (e) { 
      console.error('[Server] Invalid JSON received:', raw.toString());
      return; 
    }

    // ⭐ CRITICAL: Authentication handler
    if (data.type === 'auth') {
      console.log('[Server] AUTH message received:', data);
      ws._meta.role = data.role || 'client';
      ws._meta.userId = data.userId || ('u_' + Math.random().toString(36).slice(2,8));

      if (data.role === 'inspector') {
        // 🔥 CRITICAL: Create new monitoring session
        const sessionId = uuidv4();
        sessions[sessionId] = { 
          inspectorSocket: ws,    // Inspector's WebSocket connection
          members: new Set()      // Set of student connections
        };
        ws._meta.sessionId = sessionId;
        send(ws, { type: 'inspector.sessionStarted', sessionId });
        console.log('[Server] Inspector started session', sessionId);
        
      } else if (data.role === 'client' && data.sessionId) {
        // 🔥 CRITICAL: Student joining session
        const sid = data.sessionId;
        if (!sessions[sid]) {
          send(ws, { type: 'error', message: 'session not found' });
          console.log('[Server] Client tried to join missing session', sid);
        } else {
          sessions[sid].members.add(ws);
          ws._meta.sessionId = sid;
          ws._meta.displayName = data.displayName;  // ⭐ Store display name
          
          // Notify all parties
          send(ws, { type: 'joined', sessionId: sid });
          send(ws, { type: 'inspector.joined', message: 'You are now being monitored' });
          broadcastToInspector(sid, { 
            type: 'member.joined', 
            userId: ws._meta.userId, 
            displayName: data.displayName 
          });
          console.log(`[Server] client ${ws._meta.userId} (${data.displayName}) joined session ${sid}`);
        }
      }
      return;
    }

    // ⭐ PERFORMANCE CRITICAL: Telemetry routing
    if (data.type && data.type.startsWith('telemetry')) {
      const sid = data.sessionId || ws._meta.sessionId;
      if (!sid || !sessions[sid]) return;  // Fast rejection
      
      // Route telemetry to inspector with minimal latency
      broadcastToInspector(sid, {
        type: data.type,
        userId: data.userId || ws._meta.userId,
        payload: data.payload,
        ts: Date.now(),                    // Server timestamp for accuracy
        displayName: ws._meta.displayName  // Include display name
      });
      return;
    }

    // Community problem creation
    if (data.type === 'problem.create') {
      const problemData = data.problem || data;
      const problem = {
        problemId: problemData.problemId || 'p_' + Date.now(),
        ownerId: problemData.ownerId || ws._meta.userId,
        sessionId: ws._meta.sessionId,
        title: problemData.title,
        description: problemData.description || '',
        snippet: problemData.snippet || '',
        tags: problemData.tags || [],
        suggestions: problemData.suggestions || [],
        visibility: problemData.visibility || 'public',
        timestamp: problemData.timestamp || Date.now()
      };
      
      // ⭐ DEDUPLICATION: Prevent duplicate problems
      const existingProblem = problems.find(p => p.problemId === problem.problemId);
      if (!existingProblem) {
        problems.push(problem);
        broadcast({ type: 'problem.created', problem });  // Notify all users
        console.log(`[Server] Problem created: ${problem.title} by ${problem.ownerId}`);
      }
      return;
    }

    // Suggestion creation
    if (data.type === 'suggestion.create') {
      const suggestionData = data.suggestion || data;
      const suggestion = {
        suggestionId: suggestionData.suggestionId || 's_' + Date.now(),
        problemId: suggestionData.problemId,
        ownerId: suggestionData.ownerId || ws._meta.userId,
        content: suggestionData.content || '',
        timestamp: suggestionData.timestamp || Date.now()
      };
      
      // ⭐ DEDUPLICATION: Prevent duplicate suggestions
      const existingSuggestion = suggestions.find(s => s.suggestionId === suggestion.suggestionId);
      if (!existingSuggestion) {
        suggestions.push(suggestion);
        broadcast({ type: 'suggestion.created', suggestion });  // Notify all users
        console.log(`[Server] Suggestion created for problem: ${suggestion.problemId} by ${suggestion.ownerId}`);
      }
      return;
    }

    // Global problems request handler
    if (data.type === 'request.globalProblems') {
      console.log('[Server] Global problems requested by user:', ws._meta.userId);
      const days = data.days || 7;
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      // ⭐ FILTERING: Only send recent public problems
      const recentProblems = problems.filter(p => 
        p.timestamp > cutoffTime && 
        p.visibility === 'public'
      );
      const problemIds = recentProblems.map(p => p.problemId);
      const recentSuggestions = suggestions.filter(s => 
        problemIds.includes(s.problemId)
      );
      
      send(ws, {
        type: 'globalProblems.response',
        problems: recentProblems,
        suggestions: recentSuggestions,
        requestedDays: days,
        timestamp: Date.now()
      });
      
      console.log(`[Server] Sent ${recentProblems.length} problems and ${recentSuggestions.length} suggestions to ${ws._meta.userId}`);
      return;
    }

    // Default handler for unknown message types
    console.log(`[Server] Unknown message type: ${data.type}`);
  });

  // ⭐ CRITICAL: Connection cleanup and session management
  ws.on('close', () => {
    const meta = ws._meta || {};
    
    if (meta.role === 'inspector' && meta.sessionId && sessions[meta.sessionId]) {
      // Inspector disconnected - end session for all students
      sessions[meta.sessionId].members.forEach(m => {
        try { 
          send(m, { type: 'inspector.ended', message: 'Inspector session has ended' });
        } catch (e) {}
      });
      delete sessions[meta.sessionId];  // Clean up session
      console.log(`[Server] Inspector session ended: ${meta.sessionId}`);
      
    } else if (meta.sessionId && sessions[meta.sessionId]) {
      // Student disconnected - remove from session
      sessions[meta.sessionId].members.delete(ws);
      broadcastToInspector(meta.sessionId, { 
        type: 'member.left', 
        userId: meta.userId, 
        displayName: meta.displayName 
      });
      console.log(`[Server] Client left session: ${meta.userId}`);
    }
    console.log('[Server] Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('[Server] WebSocket error:', error);
  });

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  ws.on('pong', () => {
    // Client is alive
  });
});

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const sessionTimeout = 5 * 60 * 1000; // 5 minutes

  Object.keys(sessions).forEach(sessionId => {
    const session = sessions[sessionId];
    
    // Check if inspector is still connected
    if (!session.inspectorSocket || session.inspectorSocket.readyState !== WebSocket.OPEN) {
      console.log(`[Server] Cleaning up stale session: ${sessionId}`);
      
      // Notify students
      session.members.forEach(ws => {
        try {
          send(ws, { type: 'inspector.ended', message: 'Session ended due to inactivity' });
        } catch (e) {}
      });
      
      delete sessions[sessionId];
    }
  });
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Shutting down gracefully...');
  
  // Notify all clients
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      send(ws, { type: 'server.shutdown', message: 'Server is shutting down' });
    }
  });
  
  // Close server
  wss.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] Received SIGINT');
  process.emit('SIGTERM');
});

console.log('[Server] CONAINT Backend Logic initialized with:');
console.log('  ⭐ Real-time session management');
console.log('  ⭐ Efficient telemetry routing');  
console.log('  ⭐ Community problem sharing');
console.log('  ⭐ Robust connection handling');
console.log('  ⭐ Memory-efficient architecture');