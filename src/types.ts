export interface Problem {
    id: string;
    title: string;
    description: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    tags: string[];
    userId: string;
    timestamp: number;
    status: 'active' | 'resolved' | 'closed';
}

export interface Suggestion {
    id: string;
    problemId: string;
    content: string;
    userId: string;
    timestamp: number;
    votes: number;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface TelemetryData {
    id: string;
    userId: string;
    sessionId: string;
    timestamp: number;
    type: 'keystroke' | 'mouse' | 'clipboard' | 'file_change' | 'command' | 'selection' | 'keystroke_activity' | 'paste_detected' | 'window_focus' | 'editor_change' | 'file_save' | 'cursor_movement' | 'focus_violation' | 'focus_restoration' | 'telemetry.focus';
    data: {
        [key: string]: any;
    };
}

export interface User {
    id: string;
    name: string;
    matricNumber?: string;
    email?: string;
    role: 'student' | 'instructor' | 'admin';
    sessionId?: string;
    lastActivity: number;
    joinDate?: string;
    sessions?: string[];
    stats: {
        problemsSubmitted: number;
        suggestionsProvided: number;
        score: number;
    };
}

export interface InspectorSession {
    id: string;
    instructorId: string;
    students: string[];
    startTime: number;
    endTime?: number;
    status: 'active' | 'paused' | 'ended';
    config: {
        monitorKeystrokes: boolean;
        monitorMouse: boolean;
        monitorClipboard: boolean;
        monitorFiles: boolean;
    };
}

export interface WebSocketMessage {
    type: 'problem.created' | 'suggestion.created' | 'telemetry' | 'inspector.join' | 
          'inspector.leave' | 'heartbeat' | 'connection.status' | 'ai.analysis' | 'user.update';
    data: any;
    timestamp: number;
    userId: string;
    sessionId?: string;
}

export interface ConnectionStatus {
    connected: boolean;
    url: string;
    lastHeartbeat?: number;
    reconnectAttempts: number;
    error?: string;
}

export interface AIAnalysisResult {
    id: string;
    userId: string;
    sessionId: string;
    code: string;
    analysis: {
        complexity: number;
        quality: number;
        suggestions: string[];
        patterns: string[];
        issues: string[];
        suspiciousActivity: boolean;
        productivityScore: number;
        recommendations: string[];
    };
    timestamp: number;
    modelUsed: string;
}

export interface PanelState {
    [panelId: string]: {
        visible: boolean;
        position?: string;
        data?: any;
    };
}

export interface ExtensionConfig {
    serverUrl: string;
    huggingFaceToken: string;
    autoConnect: boolean;
    enableTelemetry: boolean;
    userId?: string;
    sessionId?: string;
}