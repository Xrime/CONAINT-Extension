const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`CONAINT WebSocket server running on ws://${HOST}:${PORT}`);
  console.log('🚀 CONAINT is ready for online academic integrity monitoring!');
});
const sessions = {};
const problems = [];
const suggestions = [];

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}

function broadcast(obj) {
  const s = JSON.stringify(obj);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(s);
  });
}

function broadcastToInspector(sessionId, obj) {
  const s = sessions[sessionId];
  if (!s || !s.inspectorSocket) return;
  send(s.inspectorSocket, obj);
}

wss.on('connection', (ws) => {
  ws._meta = { role: 'client', sessionId: null, userId: null };
  console.log('client connected');

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch (e) { return; }

    if (data.type === 'auth') {
      console.log('[Server] AUTH message received:', data);
      ws._meta.role = data.role || 'client';
      ws._meta.userId = data.userId || ('u_' + Math.random().toString(36).slice(2,8));

      if (data.role === 'inspector') {
        const sessionId = uuidv4();
        sessions[sessionId] = { inspectorSocket: ws, members: new Set() };
        ws._meta.sessionId = sessionId;
        send(ws, { type: 'inspector.sessionStarted', sessionId });
        console.log('[Server] Inspector started session', sessionId);
      } else if (data.role === 'client' && data.sessionId) {
        const sid = data.sessionId;
        if (!sessions[sid]) {
          send(ws, { type: 'error', message: 'session not found' });
          console.log('[Server] Client tried to join missing session', sid);
        } else {
          sessions[sid].members.add(ws);
          ws._meta.sessionId = sid;
          ws._meta.displayName = data.displayName;
          send(ws, { type: 'joined', sessionId: sid });
          send(ws, { type: 'inspector.joined', message: 'You are now being monitored' });
          broadcastToInspector(sid, { type: 'member.joined', userId: ws._meta.userId, displayName: data.displayName });
          console.log(`[Server] client ${ws._meta.userId} (${data.displayName}) joined session ${sid}`);
        }
      } else {
        send(ws, { type: 'ok', userId: ws._meta.userId });
        console.log('[Server] Sent ok to user', ws._meta.userId);
      }
      return;
    }

    if (data.type && data.type.startsWith('telemetry')) {
      const sid = data.sessionId || ws._meta.sessionId;
      if (!sid || !sessions[sid]) return;
      broadcastToInspector(sid, {
        type: data.type,
        userId: data.userId || ws._meta.userId,
        payload: data.payload,
        ts: Date.now()
      });
      return;
    }


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
      const existingProblem = problems.find(p => p.problemId === problem.problemId);
      if (!existingProblem) {
        problems.push(problem);
        broadcast({ type: 'problem.created', problem });
        console.log(`[Server] Problem created: ${problem.title} by ${problem.ownerId}`);
      }
      return;
    }
    if (data.type === 'suggestion.create') {
      const suggestion = {
        suggestionId: 's_' + Date.now(),
        problemId: data.suggestion?.problemId || data.problemId,
        authorId: ws._meta.userId,
        content: data.suggestion?.content || data.content,
        upvotes: 0,
        accepted: false,
        timestamp: Date.now()
      };
      suggestions.push(suggestion);
      const prob = problems.find(p => p.problemId === suggestion.problemId);
      if (prob) prob.suggestions.push(suggestion);
      broadcast({ type: 'suggestion.created', suggestion });
      return;
    }

    if (data.type === 'inspector.snapshot' && ws._meta.role === 'inspector') {
      const sid = ws._meta.sessionId;
      if (!sid) return;
      sessions[sid].members.forEach(m => {
        try { send(m, { type: 'inspector.requestSnapshot' }); } catch (e) {}
      });
    }

    if (data.type === 'request.globalProblems') {
      console.log('[Server] Global problems requested by user:', ws._meta.userId);
      const days = data.days || 7;
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      
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
    }
  });

  ws.on('close', () => {
    const meta = ws._meta || {};
    if (meta.role === 'inspector' && meta.sessionId && sessions[meta.sessionId]) {
      sessions[meta.sessionId].members.forEach(m => {
        try { 
          send(m, { type: 'inspector.ended', message: 'Inspector session has ended' });
        } catch (e) {}
      });
      delete sessions[meta.sessionId];
      console.log(`[Server] Inspector session ended: ${meta.sessionId}`);
    } else if (meta.sessionId && sessions[meta.sessionId]) {
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
});
