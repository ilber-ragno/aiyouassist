import pino from 'pino';

const logger = pino({ name: 'session-manager' });

class SessionManager {
  constructor() {
    this.sessionToSockets = new Map(); // sessionId -> Set<socket>
    this.socketToSession = new Map();  // socketId -> sessionId
  }

  addSocket(sessionId, socket) {
    if (!this.sessionToSockets.has(sessionId)) {
      this.sessionToSockets.set(sessionId, new Set());
    }
    this.sessionToSockets.get(sessionId).add(socket);
    this.socketToSession.set(socket.id, sessionId);
    logger.debug({ sessionId, socketId: socket.id }, 'Socket registered');
  }

  removeSocket(socketId) {
    const sessionId = this.socketToSession.get(socketId);
    if (sessionId) {
      const sockets = this.sessionToSockets.get(sessionId);
      if (sockets) {
        for (const s of sockets) {
          if (s.id === socketId) {
            sockets.delete(s);
            break;
          }
        }
        if (sockets.size === 0) {
          this.sessionToSockets.delete(sessionId);
        }
      }
      this.socketToSession.delete(socketId);
      logger.debug({ sessionId, socketId }, 'Socket removed');
    }
  }

  sendToSession(sessionId, data) {
    const sockets = this.sessionToSockets.get(sessionId);
    if (!sockets || sockets.size === 0) {
      logger.debug({ sessionId }, 'No active sockets for session');
      return false;
    }
    for (const socket of sockets) {
      socket.emit('message', data);
    }
    logger.debug({ sessionId, socketCount: sockets.size }, 'Message sent to session');
    return true;
  }

  sendTyping(sessionId, isTyping = true) {
    const sockets = this.sessionToSockets.get(sessionId);
    if (!sockets) return;
    for (const socket of sockets) {
      socket.emit('typing', { isTyping });
    }
  }

  getActiveSessions() {
    return this.sessionToSockets.size;
  }

  hasSession(sessionId) {
    const sockets = this.sessionToSockets.get(sessionId);
    return sockets && sockets.size > 0;
  }
}

export default new SessionManager();
