import { WebSocketMessage, TelemetryData, Problem, Suggestion, User, InspectorSession } from './types';

export enum MessageType {
    PROBLEM_CREATED = 'problem.created',
    SUGGESTION_CREATED = 'suggestion.created',
    TELEMETRY = 'telemetry',
    INSPECTOR_JOIN = 'inspector.join',
    INSPECTOR_LEAVE = 'inspector.leave',
    HEARTBEAT = 'heartbeat',
    CONNECTION_STATUS = 'connection.status',
    AI_ANALYSIS = 'ai.analysis',
    USER_UPDATE = 'user.update',
    SESSION_START = 'session.start',
    SESSION_END = 'session.end',
    ERROR = 'error'
}

export class Protocol {
    static createMessage(type: MessageType, data: any, userId: string, sessionId?: string): WebSocketMessage {
        return {
            type: type as any,
            data,
            timestamp: Date.now(),
            userId,
            sessionId
        };
    }

    static createProblemMessage(problem: Problem, userId: string): WebSocketMessage {
        return this.createMessage(MessageType.PROBLEM_CREATED, problem, userId);
    }

    static createSuggestionMessage(suggestion: Suggestion, userId: string): WebSocketMessage {
        return this.createMessage(MessageType.SUGGESTION_CREATED, suggestion, userId);
    }

    static createTelemetryMessage(telemetry: TelemetryData, userId: string, sessionId: string): WebSocketMessage {
        return this.createMessage(MessageType.TELEMETRY, telemetry, userId, sessionId);
    }

    static createHeartbeatMessage(userId: string): WebSocketMessage {
        return this.createMessage(MessageType.HEARTBEAT, { timestamp: Date.now() }, userId);
    }

    static createInspectorJoinMessage(sessionId: string, userId: string, role: 'instructor' | 'student'): WebSocketMessage {
        return this.createMessage(MessageType.INSPECTOR_JOIN, { sessionId, role }, userId);
    }

    static createInspectorLeaveMessage(sessionId: string, userId: string): WebSocketMessage {
        return this.createMessage(MessageType.INSPECTOR_LEAVE, { sessionId }, userId);
    }

    static createUserUpdateMessage(user: User): WebSocketMessage {
        return this.createMessage(MessageType.USER_UPDATE, user, user.id);
    }

    static createAIAnalysisMessage(code: string, userId: string): WebSocketMessage {
        return this.createMessage(MessageType.AI_ANALYSIS, { code, requestId: Date.now().toString() }, userId);
    }

    static createErrorMessage(error: string, userId: string): WebSocketMessage {
        return this.createMessage(MessageType.ERROR, { error }, userId);
    }

    static parseMessage(data: string): WebSocketMessage | null {
        try {
            const message = JSON.parse(data) as WebSocketMessage;
            if (message.type && message.data && message.timestamp && message.userId) {
                return message;
            }
            return null;
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
            return null;
        }
    }

    static validateMessage(message: WebSocketMessage): boolean {
        return !!(
            message.type &&
            message.data &&
            message.timestamp &&
            message.userId &&
            typeof message.timestamp === 'number'
        );
    }
}