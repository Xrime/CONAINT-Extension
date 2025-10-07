# CONAINT - Advanced Code Analysis and Academic Integrity Monitoring

![CONAINT Logo](https://img.shields.io/badge/CONAINT-Academic%20Integrity-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-1.0.1-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-yellow?style=for-the-badge)

**CONAINT** is a comprehensive VS Code extension designed for academic integrity monitoring and real-time code analysis. Perfect for educators, institutions, and development teams who need to monitor coding activities and detect potential academic misconduct.

## 🚀 Key Features

### 🔍 Inspector Mode - Academic Integrity Monitoring
- **Real-time Activity Tracking**: Monitor keystrokes, file operations, cursor movements, and application focus
- **Session Management**: Create secure inspector sessions with unique session IDs
- **Visual Dashboard**: Live dashboard showing each student's activity in real-time
- **Code Preview**: View current code being written by monitored users
- **Activity Timeline**: Chronological view of all user actions during sessions
- **Export & Analysis**: Download detailed session logs for further analysis
- **User Identification**: Students join sessions with custom display names for easy tracking

### 🤖 AI-Powered Analysis
- **CONAINT AI**: Advanced machine learning analysis powered by Hugging Face GPT-2
- **Intelligent Report Generation**: Automatically converts complex JSON session data into readable analysis reports
- **Enhanced Cheating Detection**: AI identifies suspicious patterns including copy-paste behavior, external resource usage, and non-productive activity
- **No Configuration Required**: AI analysis works immediately without any setup

### 🌐 Community Features
- **Problem Sharing**: Students can submit coding problems with descriptions and code snippets
- **Live Feed**: Real-time community feed showing all submitted problems (like a mini Stack Overflow)
- **Suggestion System**: Provide and receive coding suggestions from peers
- **Leaderboard**: Track contribution scores and community rankings
- **Global Community**: Connect with users worldwide for collaborative problem-solving

### ⚡ Real-time Collaboration
- **WebSocket Technology**: Instant real-time updates across all connected users
- **Multi-user Sessions**: Support for multiple students in the same inspector session
- **Live Notifications**: Instant alerts for new problems, suggestions, and activities
- **Session Timer**: Built-in timer showing inspection duration for both instructors and students

## 📦 Installation

1. Install from VS Code Marketplace (search for "CONAINT")
2. Or install manually: Download `conaint-1.0.1.vsix` and install via VS Code

## 🎯 Getting Started

### For Instructors (Inspector Mode):
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `CONAINT: Start Inspector Mode`
3. Share the generated session ID with students
4. Monitor student activities in real-time

### For Students:
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Manager: Join Inspector Session`
3. Enter the session ID provided by your instructor
4. Enter your display name (e.g., "student123")
5. Continue coding normally - your activity will be monitored

### For Community Features:
1. Run `CONAINT: Open Dashboard` to access all features
2. Submit problems, view live feed, and participate in the community

## 🔧 Commands

- `CONAINT: Open Dashboard` - Access main dashboard with all features
- `CONAINT: Start Inspector Mode` - Begin monitoring session (Instructor)
- `Manager: Join Inspector Session` - Join monitoring session (Student)
- `CONAINT: Open AI Analysis` - Access AI-powered session analysis
- `CONAINT: Submit Problem` - Share a coding problem with the community
- `CONAINT: Open Live Feed` - View real-time community problems
- `CONAINT: Test Inspector (Demo Mode)` - Try inspector features in demo mode

## 🌟 What Makes CONAINT Unique

CONAINT is the first VS Code extension to combine:
- **Academic integrity monitoring** with real-time session tracking
- **AI-powered analysis** that converts technical data into human-readable reports
- **Community-driven problem sharing** for collaborative learning
- **Zero-configuration setup** - everything works out of the box

## 🔒 Privacy & Security

- All monitoring only occurs during active inspector sessions
- Students are clearly notified when monitoring is active
- Session data is only shared with authorized instructors
- No personal data is collected outside of monitoring sessions

## 🆓 Free & Open Source

CONAINT is completely free to use with all features included. Built using free services to ensure accessibility for educational institutions worldwide.

## 📝 Release Notes

### 1.2.2
- Enhanced AI analysis with improved cheating detection algorithms
- Fixed user identification system for inspector mode
- Improved server connection stability
- Optimized package size and performance

### 1.0.0
- Initial release with full inspector mode functionality
- Community problem sharing and live feed
- AI-powered session analysis
- Real-time WebSocket collaboration

## 📝 License

MIT License - feel free to use, modify, and distribute.

## 👨‍💻 Created By

**Xrime** - Passionate about educational technology and academic integrity

---

*Making code monitoring and collaborative learning accessible to everyone.*
