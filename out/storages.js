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
exports.initStorage = initStorage;
exports.loadProblems = loadProblems;
exports.saveProblems = saveProblems;
exports.addProblem = addProblem;
exports.addSuggestion = addSuggestion;
// src/storage.ts
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let storagePath;
function initStorage(context) {
    storagePath = context.globalStorageUri.fsPath;
    if (!fs.existsSync(storagePath))
        fs.mkdirSync(storagePath, { recursive: true });
}
function filePath(name) {
    return path.join(storagePath || '.', name);
}
function loadProblems() {
    try {
        const p = filePath('problems.json');
        if (!fs.existsSync(p))
            return [];
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(raw);
    }
    catch (e) {
        console.error('loadProblems error', e);
        return [];
    }
}
function saveProblems(problems) {
    try {
        const p = filePath('problems.json');
        fs.writeFileSync(p, JSON.stringify(problems, null, 2), 'utf8');
    }
    catch (e) {
        console.error('saveProblems error', e);
    }
}
function addProblem(problem) {
    const arr = loadProblems();
    arr.unshift(problem);
    saveProblems(arr);
}
function addSuggestion(s) {
    const arr = loadProblems();
    const idx = arr.findIndex(p => p.problemId === s.problemId);
    if (idx >= 0) {
        arr[idx].suggestions = arr[idx].suggestions || [];
        arr[idx].suggestions.push(s);
        saveProblems(arr);
    }
}
//# sourceMappingURL=storages.js.map