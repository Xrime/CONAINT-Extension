"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Protocol = exports.MessageType = void 0;
var MessageType;
(function (MessageType) {
    MessageType["PROBLEM_CREATED"] = "problem.created";
    MessageType["SUGGESTION_CREATED"] = "suggestion.created";
    MessageType["TELEMETRY"] = "telemetry";
    MessageType["INSPECTOR_JOIN"] = "inspector.join";
    MessageType["INSPECTOR_LEAVE"] = "inspector.leave";
    MessageType["HEARTBEAT"] = "heartbeat";
    MessageType["CONNECTION_STATUS"] = "connection.status";
    MessageType["AI_ANALYSIS"] = "ai.analysis";
    MessageType["USER_UPDATE"] = "user.update";
    MessageType["SESSION_START"] = "session.start";
    MessageType["SESSION_END"] = "session.end";
    MessageType["ERROR"] = "error";
})(MessageType || (exports.MessageType = MessageType = {}));
class Protocol {
    static createMessage(type, data, userId, sessionId) {
        return {
            type: type,
            data,
            timestamp: Date.now(),
            userId,
            sessionId
        };
    }
    static createProblemMessage(problem, userId) {
        return this.createMessage(MessageType.PROBLEM_CREATED, problem, userId);
    }
    static createSuggestionMessage(suggestion, userId) {
        return this.createMessage(MessageType.SUGGESTION_CREATED, suggestion, userId);
    }
    static createTelemetryMessage(telemetry, userId, sessionId) {
        return this.createMessage(MessageType.TELEMETRY, telemetry, userId, sessionId);
    }
    static createHeartbeatMessage(userId) {
        return this.createMessage(MessageType.HEARTBEAT, { timestamp: Date.now() }, userId);
    }
    static createInspectorJoinMessage(sessionId, userId, role) {
        return this.createMessage(MessageType.INSPECTOR_JOIN, { sessionId, role }, userId);
    }
    static createInspectorLeaveMessage(sessionId, userId) {
        return this.createMessage(MessageType.INSPECTOR_LEAVE, { sessionId }, userId);
    }
    static createUserUpdateMessage(user) {
        return this.createMessage(MessageType.USER_UPDATE, user, user.id);
    }
    static createAIAnalysisMessage(code, userId) {
        return this.createMessage(MessageType.AI_ANALYSIS, { code, requestId: Date.now().toString() }, userId);
    }
    static createErrorMessage(error, userId) {
        return this.createMessage(MessageType.ERROR, { error }, userId);
    }
    static parseMessage(data) {
        try {
            const message = JSON.parse(data);
            if (message.type && message.data && message.timestamp && message.userId) {
                return message;
            }
            return null;
        }
        catch (error) {
            console.error('Failed to parse WebSocket message:', error);
            return null;
        }
    }
    static validateMessage(message) {
        return !!(message.type &&
            message.data &&
            message.timestamp &&
            message.userId &&
            typeof message.timestamp === 'number');
    }
}
exports.Protocol = Protocol;
//# sourceMappingURL=protocol.js.map