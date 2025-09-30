# 🧪 Testing the Inspector Features (Same PC)

## The Issue
You're right! When testing on the same PC, the inspector and student are the same user, so the timer and monitoring features don't work as expected. I've added special testing modes to help you see how it works.

## 🎯 How to Test the Features

### **Method 1: Test Inspector Mode (Demo Data)**
1. **Press F5** to launch extension
2. **Open Dashboard**: `Ctrl+Shift+P` → "Manager: Open Dashboard"
3. **Click "Test Inspector"** - This creates fake students with activity
4. **Watch**: Timer counts up, fake users appear, statistics update

### **Method 2: Test Student Monitoring View**
1. **Press F5** to launch extension  
2. **Run Command**: `Ctrl+Shift+P` → "Manager: Test Student View (Demo)"
3. **See**: Warning popup + status bar timer "🔍 Monitored 00:05"
4. **Watch**: Timer counts up in status bar

### **Method 3: Test Export Functionality**
1. **Use Test Inspector mode** (Method 1)
2. **Wait for some fake activity** to generate
3. **Click "📊 Export Complete Report"**
4. **Choose save location** in dialog
5. **Check files**: You'll get both .txt and .json reports

## 🔍 What You Should See

### **Inspector Dashboard:**
```
🔍 Inspector — Live Telemetry Dashboard

Stats Bar:
Active Users: 3    Total Events: 27    Flags: 0    Session Time: 01:45

User Tiles:
┌─────────────────────────────┐
│ Alice Johnson (student_001) │ [Flag]
│ Last seen: typing text      │
│ Timeline: 14:30 keystroke   │
│          14:31 paste        │
│ Code Preview: print('Hello')│
└─────────────────────────────┘
```

### **Student View (Status Bar):**
```
Bottom status bar shows:
🔍 Monitored 02:34
```

### **Export Files Created:**
- `inspector-session-report-2025-09-29.txt` (Human readable)
- `inspector-session-complete-2025-09-29.json` (Technical data)

## 🐛 Debugging the Timer

If timer still doesn't work:

1. **Open Developer Tools**: `Ctrl+Shift+I` in the inspector panel
2. **Check Console**: Look for these messages:
   ```
   [Inspector] Panel initialized, session start time: ...
   [Inspector] Starting timer...
   [Inspector] Timer updated: 00:05 Elapsed: 5000 ms
   ```

3. **If no messages**: The HTML might not be loading properly
4. **If timer element not found**: Check the HTML structure

## 🌐 Testing with Real Multiple Users

For real multi-user testing:
1. **Start server**: `npm start`
2. **Get session ID** from inspector
3. **Use different computers** or **different VS Code instances**
4. **Each student joins** with same session ID

## 🚀 Quick Test Commands

```bash
# Test Inspector with fake data
Ctrl+Shift+P → "Manager: Test Inspector (Demo Mode)"

# Test Student monitoring view  
Ctrl+Shift+P → "Manager: Test Student View (Demo)"

# Regular inspector (needs server)
Ctrl+Shift+P → "Manager: Start Inspector Mode"
```

## ✅ Expected Results

**Timer Should Show:** 
- Inspector: "Session Time: 01:23" (updates every second)
- Student: "🔍 Monitored 01:23" (in status bar)

**Export Should Create:**
- Save dialog opens
- Two files created (.txt and .json)
- Human-readable report in English

Try the **"Test Inspector (Demo Mode)"** first - this will show you exactly how it should look with fake users and activity! 🎉