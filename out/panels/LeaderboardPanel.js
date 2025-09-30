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
exports.LeaderboardPanel = void 0;
// src/panels/LeaderboardPanel.ts
const vscode = __importStar(require("vscode"));
class LeaderboardPanel {
    static show(lines) {
        const panel = vscode.window.createWebviewPanel('leaderboard', 'Leaderboard', vscode.ViewColumn.Three, {
            enableScripts: false,
            retainContextWhenHidden: true,
            enableFindWidget: true
        });
        panel.webview.html = `<!doctype html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; }
        h2 { margin-top: 0; }
        table { border-collapse: collapse; width: 100%; margin-top: 12px; }
        th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
        th { background: #f4f4f4; }
        tr:nth-child(even) { background: #fafafa; }
      </style>
    </head>
    <body>
      <h2>Leaderboard</h2>
      ${lines.length ? (`<table><tr><th>Rank</th><th>User</th><th>Points</th></tr>` +
            lines.map(l => {
                const m = l.match(/^(\d+)\.\s+([^\s]+)\s+—\s+(\d+) pts/);
                if (m)
                    return `<tr><td>${m[1]}</td><td>${m[2]}</td><td>${m[3]}</td></tr>`;
                return `<tr><td colspan="3">${l}</td></tr>`;
            }).join('') + '</table>') : '<div>No data yet</div>'}
    </body>
    </html>`;
    }
}
exports.LeaderboardPanel = LeaderboardPanel;
//# sourceMappingURL=LeaderboardPanel.js.map