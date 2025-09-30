// src/panels/LeaderboardPanel.ts
import * as vscode from 'vscode';

export class LeaderboardPanel {
  public static show(lines: string[]) {
    const panel = vscode.window.createWebviewPanel('leaderboard', 'Leaderboard', vscode.ViewColumn.Three, { enableScripts: false });
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
      ${lines.length ? (
        `<table><tr><th>Rank</th><th>User</th><th>Points</th></tr>` +
        lines.map(l => {
          const m = l.match(/^(\d+)\.\s+([^\s]+)\s+—\s+(\d+) pts/);
          if (m) return `<tr><td>${m[1]}</td><td>${m[2]}</td><td>${m[3]}</td></tr>`;
          return `<tr><td colspan="3">${l}</td></tr>`;
        }).join('') + '</table>'
      ) : '<div>No data yet</div>'}
    </body>
    </html>`;
  }
}
