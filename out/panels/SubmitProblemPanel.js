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
exports.SubmitProblemPanel = void 0;
const vscode = __importStar(require("vscode"));
class SubmitProblemPanel {
    static currentPanel;
    static viewType = 'conaint.submitProblemPanel';
    _panel;
    _extensionUri;
    _disposables = [];
    manager;
    static createOrShow(extensionUri, manager) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (SubmitProblemPanel.currentPanel) {
            SubmitProblemPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(SubmitProblemPanel.viewType, 'Submit a Problem', column || vscode.ViewColumn.Two, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
        });
        SubmitProblemPanel.currentPanel = new SubmitProblemPanel(panel, extensionUri, manager);
    }
    constructor(panel, extensionUri, manager) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.manager = manager;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            this.handleMessage(message);
        }, null, this._disposables);
    }
    async handleMessage(message) {
        switch (message.command) {
            case 'submitProblem':
                await this.submitProblem(message.data);
                break;
            case 'navigateToPanel':
                await this.navigateToPanel(message.panel);
                break;
            case 'loadTemplate':
                this.loadTemplate(message.template);
                break;
            case 'clearForm':
                this._update();
                break;
            case 'refresh':
                this._update();
                break;
        }
    }
    async navigateToPanel(panelName) {
        switch (panelName) {
            case 'dashboard':
                await vscode.commands.executeCommand('manager.openDashboard');
                break;
            case 'liveFeed':
                await vscode.commands.executeCommand('manager.openLiveFeed');
                break;
            case 'submitProblem':
                // Already on this panel
                break;
            case 'inspector':
                await vscode.commands.executeCommand('manager.startInspector');
                break;
            case 'ai':
                await vscode.commands.executeCommand('manager.openAiAnalysis');
                break;
            default:
                vscode.window.showWarningMessage(`Unknown panel: ${panelName}`);
        }
    }
    async submitProblem(data) {
        try {
            if (!data.title || !data.description) {
                vscode.window.showErrorMessage('Please fill in all required fields');
                return;
            }
            const problem = await this.manager.submitProblem(data.title, data.description, data.difficulty || 'Medium', data.tags ? data.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag) : []);
            vscode.window.showInformationMessage(`Problem "${problem.title}" submitted successfully!`);
            // Clear form and refresh
            this._panel.webview.postMessage({
                command: 'problemSubmitted',
                problem: problem
            });
        }
        catch (error) {
            vscode.window.showErrorMessage('Failed to submit problem: ' + error.message);
        }
    }
    loadTemplate(template) {
        let templateData = {};
        switch (template) {
            case 'algorithm':
                templateData = {
                    title: 'Algorithm Problem Template',
                    description: `## Problem Description
Describe the algorithmic challenge here.

## Input Format
Specify the input format and constraints.

## Output Format
Specify the expected output format.

## Example
Input: 
Output: 

## Constraints
- Time Complexity: 
- Space Complexity: 
- Input Size: `,
                    difficulty: 'Medium',
                    tags: 'algorithm, problem-solving'
                };
                break;
            case 'debugging':
                templateData = {
                    title: 'Debugging Challenge Template',
                    description: `## Buggy Code
\`\`\`javascript
// Paste the buggy code here
\`\`\`

## Expected Behavior
Describe what the code should do.

## Current Issue
Describe what's wrong with the code.

## Test Cases
Provide test cases that fail.`,
                    difficulty: 'Easy',
                    tags: 'debugging, code-review'
                };
                break;
            case 'design':
                templateData = {
                    title: 'System Design Problem Template',
                    description: `## System Requirements
List the functional and non-functional requirements.

## Scale
- Users: 
- Data: 
- Requests per second: 

## Components to Design
- [ ] Component 1
- [ ] Component 2
- [ ] Component 3

## Constraints
List any technical constraints or assumptions.`,
                    difficulty: 'Hard',
                    tags: 'system-design, architecture'
                };
                break;
        }
        this._panel.webview.postMessage({
            command: 'loadTemplate',
            data: templateData
        });
    }
    dispose() {
        SubmitProblemPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    async _update() {
        const webview = this._panel.webview;
        this._panel.title = 'Submit Problem - CONAINT';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }
    async _getHtmlForWebview(webview) {
        const storage = this.manager.getStorage();
        const problems = await storage.getProblems();
        const userProblems = problems.filter(p => p.userId === this.manager.getUserId());
        const connectionStatus = this.manager.getConnectionStatus();
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Submit a Problem</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    height: 100vh;
                    overflow-y: auto;
                }
                
                .nav-bar {
                    background: #1e1e1e;
                    padding: 10px 20px;
                    border-bottom: 1px solid #333;
                    display: flex;
                    gap: 15px;
                    align-items: center;
                }
                
                .nav-btn {
                    background: transparent;
                    color: #ccc;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                
                .nav-btn:hover {
                    background: #333;
                    color: #fff;
                }
                
                .nav-btn.active {
                    background: #007acc;
                    color: #fff;
                }
                
                .main-content {
                    padding: 30px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                .page-title {
                    color: #fff;
                    margin-bottom: 30px;
                    font-size: 28px;
                    font-weight: 300;
                }
                
                .form-group {
                    margin-bottom: 25px;
                }
                
                .form-label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 500;
                    color: #fff;
                    font-size: 14px;
                }
                
                .form-input, .form-textarea, .form-select {
                    width: 100%;
                    padding: 12px 15px;
                    border: 1px solid #444;
                    background: #2d2d30;
                    color: #fff;
                    border-radius: 6px;
                    font-family: inherit;
                    font-size: 14px;
                    box-sizing: border-box;
                    transition: border-color 0.2s;
                }
                
                .form-input:focus, .form-textarea:focus, .form-select:focus {
                    outline: none;
                    border-color: #007acc;
                }
                
                .form-textarea {
                    resize: vertical;
                    min-height: 120px;
                }
                
                .code-textarea {
                    font-family: 'Courier New', Consolas, 'Lucida Console', monospace;
                    background: #1e1e1e;
                    border: 1px solid #444;
                    min-height: 150px;
                    line-height: 1.4;
                }
                
                .description-textarea {
                    min-height: 180px;
                }
                
                .tags-section {
                    margin-bottom: 25px;
                }
                
                .popular-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 10px;
                }
                
                .tag-chip {
                    background: #333;
                    color: #ccc;
                    padding: 6px 12px;
                    border-radius: 16px;
                    font-size: 12px;
                    cursor: pointer;
                    border: 1px solid #444;
                    transition: all 0.2s;
                }
                
                .tag-chip:hover {
                    background: #007acc;
                    border-color: #007acc;
                    color: #fff;
                }
                
                .submit-button {
                    background: #007acc;
                    color: #fff;
                    border: none;
                    padding: 15px 40px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    margin-top: 20px;
                    transition: background-color 0.2s;
                    width: 100%;
                }
                
                .submit-button:hover {
                    background: #005a9e;
                }
                
                .submit-button:disabled {
                    background: #555;
                    cursor: not-allowed;
                }
                
                .optional-label {
                    color: #888;
                    font-size: 12px;
                    font-weight: normal;
                }
                
                .required-asterisk {
                    color: #f48771;
                }
            </style>
        </head>
        <body>
            <div class="nav-bar">
                <button class="nav-btn" onclick="navigateToPanel('dashboard')">Dashboard</button>
                <button class="nav-btn" onclick="navigateToPanel('liveFeed')">Live Feed</button>
                <button class="nav-btn active" onclick="navigateToPanel('submitProblem')">New Problem</button>
                <button class="nav-btn" onclick="navigateToPanel('inspector')">Inspector</button>
                <button class="nav-btn" onclick="navigateToPanel('ai')">CONAINT AI</button>
            </div>
            
            <div class="main-content">
                <h1 class="page-title">Submit a Problem</h1>
                
                <form id="problemForm">
                    <div class="form-group">
                        <label class="form-label" for="title">
                            Problem Title <span class="required-asterisk">*</span>
                        </label>
                        <input 
                            type="text" 
                            id="title" 
                            name="title" 
                            class="form-input"
                            required 
                            placeholder="Enter a descriptive title for your problem"
                        />
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="code">
                            Code Snippet <span class="optional-label">(Optional)</span>
                        </label>
                        <textarea 
                            id="code" 
                            name="code" 
                            class="form-textarea code-textarea"
                            placeholder="Paste your code here if relevant..."
                        ></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="description">
                            Detailed Description <span class="required-asterisk">*</span>
                        </label>
                        <textarea 
                            id="description" 
                            name="description" 
                            class="form-textarea description-textarea"
                            required 
                            placeholder="Please provide a detailed description of your problem, what you've tried, and what you expect to happen."
                        ></textarea>
                    </div>
                    
                    <div class="tags-section">
                        <label class="form-label" for="tags">Tags</label>
                        <input 
                            type="text" 
                            id="tags" 
                            name="tags" 
                            class="form-input"
                            placeholder="Enter tags separated by commas (e.g., python, arrays, loops)"
                        />
                        <div class="popular-tags">
                            <span class="tag-chip" onclick="addTag('python')">python</span>
                            <span class="tag-chip" onclick="addTag('javascript')">javascript</span>
                            <span class="tag-chip" onclick="addTag('java')">java</span>
                            <span class="tag-chip" onclick="addTag('c++')">c++</span>
                            <span class="tag-chip" onclick="addTag('arrays')">arrays</span>
                            <span class="tag-chip" onclick="addTag('loops')">loops</span>
                            <span class="tag-chip" onclick="addTag('functions')">functions</span>
                            <span class="tag-chip" onclick="addTag('algorithms')">algorithms</span>
                            <span class="tag-chip" onclick="addTag('debugging')">debugging</span>
                            <span class="tag-chip" onclick="addTag('data-structures')">data-structures</span>
                        </div>
                    </div>
                    
                    <button type="submit" class="submit-button" id="submitBtn">
                        Post Question
                    </button>
                </form>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function navigateToPanel(panelName) {
                    vscode.postMessage({
                        command: 'navigateToPanel',
                        panel: panelName
                    });
                }
                
                function addTag(tag) {
                    const tagsInput = document.getElementById('tags');
                    const currentTags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
                    
                    if (!currentTags.includes(tag)) {
                        if (currentTags.length > 0) {
                            tagsInput.value = currentTags.join(', ') + ', ' + tag;
                        } else {
                            tagsInput.value = tag;
                        }
                    }
                }
                
                document.getElementById('problemForm').addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const submitBtn = document.getElementById('submitBtn');
                    const originalText = submitBtn.textContent;
                    
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Posting...';
                    
                    const formData = {
                        title: document.getElementById('title').value.trim(),
                        code: document.getElementById('code').value.trim(),
                        description: document.getElementById('description').value.trim(),
                        tags: document.getElementById('tags').value.trim()
                    };
                    
                    if (!formData.title || !formData.description) {
                        alert('Please fill in all required fields.');
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalText;
                        return;
                    }
                    
                    vscode.postMessage({
                        command: 'submitProblem',
                        data: formData
                    });
                    
                    // Reset form after submission
                    setTimeout(() => {
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalText;
                        document.getElementById('problemForm').reset();
                    }, 1500);
                });
                
                // Auto-resize textareas
                const textareas = document.querySelectorAll('.form-textarea');
                textareas.forEach(textarea => {
                    textarea.addEventListener('input', function() {
                        this.style.height = 'auto';
                        this.style.height = this.scrollHeight + 'px';
                    });
                });
            </script>
        </body>
        </html>`;
    }
}
exports.SubmitProblemPanel = SubmitProblemPanel;
//# sourceMappingURL=SubmitProblemPanel.js.map