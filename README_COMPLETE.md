# Manager - VS Code Extension for Real-Time Problem Sharing and Inspector Mode

A powerful VS Code extension for collaborative coding environments that enables real-time problem sharing, suggestion system, and comprehensive activity monitoring through an inspector dashboard.

## 🚀 Features

### Core Functionality
- **Problem Submission**: Share coding problems with descriptions, code snippets, and tags
- **Live Feed**: View and respond to problems from all users in real-time
- **Suggestion System**: Provide and receive coding suggestions
- **Real-time Updates**: WebSocket-powered live collaboration

### Inspector Mode
- **Activity Monitoring**: Track user keystrokes, file operations, and cursor movements
- **Session Management**: Create inspector sessions with unique session IDs
- **User Tiles**: Visual dashboard showing each user's activity
- **Code Preview**: Live preview of user's current code
- **Suspicious Activity Detection**: Automatic flagging of unusual patterns
- **Activity Timeline**: Chronological view of user actions
- **Export Logs**: Download session logs for analysis
- **User Flagging**: Manual flagging system with notes

### Additional Features
- **Leaderboard**: Track contribution scores and rankings
- **Multi-user Support**: Connect multiple users to the same session
- **Configurable Server**: Support for local and remote WebSocket servers
- **Display Names**: Customizable user identification

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd Manager
   ```

2. **Install main dependencies**:
   ```bash
   npm install
   ```

3. **Install server dependencies**:
   ```bash
   cd server
   npm install
   cd ..
   ```

4. **Compile the extension**:
   ```bash
   npm run compile
   ```

5. **Run in VS Code**:
   - Press `F5` to launch the Extension Development Host
   - Or package the extension with `vsce package` for installation

## 🖥️ Usage

### Starting the Server
Before using multi-user features, start the WebSocket server:

```bash
npm start
# or
cd server && node index.js
```

The server runs on `ws://localhost:3000` by default.

### Extension Commands

1. **Manager: Submit Problem**
   - Share coding problems with title, description, code snippets, and tags
   - Automatically broadcasts to all connected users

2. **Manager: Open Live Feed**
   - View real-time stream of problems from all users
   - Provide suggestions and interact with problems

3. **Manager: Start Inspector Mode**
   - Launch inspector dashboard to monitor user activity
   - Generates unique session ID for others to join
   - Session ID is automatically copied to clipboard

4. **Manager: Join Inspector Session**
   - Join an existing inspector session using session ID
   - Set your display name for identification
   - Start sending telemetry data to the inspector

5. **Manager: Open Leaderboard**
   - View contribution Rankings based on suggestions provided
   - Track community engagement

### Inspector Dashboard Features

- **User Tiles**: Each connected user gets a tile showing:
  - Display name and user ID
  - Last activity timestamp
  - Recent activity timeline
  - Live code preview
  - Flag button for suspicious activity

- **Activity Monitoring**:
  - Keystroke tracking
  - Large paste detection
  - File switching monitoring
  - Cursor position tracking

- **Suspicious Activity Detection**:
  - Automatic highlighting of users with unusual patterns
  - Manual flagging system with notes
  - Visual indicators for flagged users

- **Export Functionality**:
  - Download complete session logs as JSON
  - Includes all events, flags, and timestamps

## ⚙️ Configuration

### Server URL
Configure the WebSocket server URL in VS Code settings:

```json
{
  "manager.serverUrl": "ws://localhost:3000"
}
```

For remote deployment, update to your server's URL:
```json
{
  "manager.serverUrl": "wss://your-server.com"
}
```

## 🏗️ Development

### Available Scripts
- `npm run compile` - Compile TypeScript code
- `npm run watch` - Watch mode for development
- `npm start` - Start the WebSocket server

### Project Structure
```
├── src/
│   ├── extension.ts          # Main extension logic
│   ├── manager.ts           # Problem/suggestion management
│   ├── protocol.ts          # Shared types and protocols
│   └── panels/
│       ├── InspectorPanel.ts     # Inspector dashboard
│       ├── LiveFeedPanel.ts      # Problem feed
│       ├── SubmitProblemPanel.ts # Problem submission
│       └── LeaderboardPanel.ts   # Rankings display
├── server/
│   └── index.js             # WebSocket server
├── package.json             # Extension configuration
└── tsconfig.json           # TypeScript configuration
```

### WebSocket Protocol
The extension uses a custom WebSocket protocol for real-time communication:

- **Authentication**: `{ type: 'auth', role: 'inspector'|'client', userId, sessionId?, displayName? }`
- **Problems**: `{ type: 'problem.create', problem: {...} }`
- **Suggestions**: `{ type: 'suggestion.create', suggestion: {...} }`
- **Telemetry**: `{ type: 'telemetry.*', userId, sessionId, payload, ts }`

## 🎯 Use Cases

### Educational Environments
- Monitor student coding sessions
- Identify students who need help
- Track engagement and participation
- Detect potential academic dishonesty

### Team Collaboration
- Share problems and solutions in real-time
- Monitor team member activity
- Track contribution metrics
- Facilitate code reviews

### Code Review Sessions
- Live monitoring of code changes
- Real-time feedback and suggestions
- Session recording for later analysis

## 🔒 Privacy & Security

- All telemetry is session-based and temporary
- No persistent storage of user code
- Session IDs are randomly generated UUIDs
- Data is only transmitted when users explicitly join sessions

## 🚀 Deployment

### Local Network
The default configuration works for local network deployment. Ensure all users can access the server machine on port 3000.

### Internet Deployment
For internet access, deploy the server to a cloud platform and update the `manager.serverUrl` setting. Consider using:
- Azure App Service
- AWS Lambda with API Gateway
- DigitalOcean Droplets
- Heroku
- Or use tunneling services like Ngrok for testing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

[Add your license here]

## 🆘 Support

[Add support information here]

---

**Note**: This extension is designed for educational and collaborative environments. Ensure all users consent to activity monitoring when using inspector mode.