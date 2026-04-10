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
Object.defineProperty(exports, "__esModule", { value: true });
exports.readSessions = readSessions;
exports.writeSessions = writeSessions;
exports.pruneStaleSessions = pruneStaleSessions;
exports.upsertSession = upsertSession;
const fs = __importStar(require("fs"));
function readSessions(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
function writeSessions(filePath, sessions) {
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
}
function pruneStaleSessions(sessions, staleMinutes) {
    const cutoff = Date.now() - staleMinutes * 60 * 1000;
    return sessions.filter((s) => s.lastActivity > cutoff);
}
function upsertSession(sessions, updated) {
    const idx = sessions.findIndex((s) => s.sessionId === updated.sessionId);
    if (idx === -1)
        return [...sessions, updated];
    const next = [...sessions];
    next[idx] = updated;
    return next;
}
