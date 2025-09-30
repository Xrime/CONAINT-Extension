export type UserRole = 'student' | 'helper' | 'inspector' | 'admin';

export interface User {
  id: string;
  displayName: string;
  role: UserRole;
  score: number;
}

export interface Session {
  id: string;
  inspectorId: string;
  startTime: number;
  mode: 'LAN' | 'cloud';
}

export interface Problem {
  problemId: string;
  ownerId: string;
  sessionId?: string;
  title: string;
  description: string;
  snippet: string;
  tags: string[];
  suggestions: Suggestion[];
  visibility: 'public' | 'session';
  timestamp: number;
}

export interface Suggestion {
  suggestionId: string;
  problemId: string;
  authorId: string;
  content: string;
  upvotes?: number;
  accepted?: boolean;
  timestamp: number;
}

export interface TelemetryLog {
  id?: string;
  userId: string;
  sessionId?: string;
  eventType: string;
  metaJSON: any;
  createdAt: number;
}

// WebSocket message types
export type WSMessage =
  | { type: 'auth'; token?: string; role: UserRole; sessionId?: string }
  | { type: 'problem.create'; ownerId: string; title: string; description: string; snippet: string; tags: string[]; visibility: 'public' | 'session' }
  | { type: 'problem.created'; problem: Problem }
  | { type: 'suggestion.create'; suggestion: Omit<Suggestion, 'suggestionId' | 'timestamp'> }
  | { type: 'suggestion.created'; suggestion: Suggestion }
  | { type: 'telemetry.keystroke' | 'telemetry.paste' | 'telemetry.cursor' | 'telemetry.openfile'; userId: string; sessionId?: string; payload: any; ts: number }
  | { type: 'inspector.sessionStarted'; sessionId: string }
  | { type: string; [key: string]: any }; // fallback for extensibility
