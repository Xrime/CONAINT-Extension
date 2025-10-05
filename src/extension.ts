import * as vscode from 'vscode';
import { Manager } from './manager';
import { MainDashboard } from './panels/MainDashboard';
import { InspectorPanel } from './panels/InspectorPanel';
import { JoinInspectorPanel } from './panels/JoinInspectorPanel';
import { AiAnalysisPanel } from './panels/AiAnalysisPanel';
import { SubmitProblemPanel } from './panels/SubmitProblemPanel';
import { LiveFeedPanel } from './LiveFeedPanel';
import { LeaderboardPanel } from './LeaderboardPanel';
import { TestInspectorPanel } from './panels/TestInspectorPanel';

let manager: Manager;

export function activate(context: vscode.ExtensionContext) {
    console.log('CONAINT extension is now active!');

    // Initialize the manager
    manager = new Manager(context);
    
    // Set context for panels that need it
    AiAnalysisPanel.setContext(context);

    // Auto-start disabled - let users manually join sessions through the JoinInspectorPanel
    // setTimeout(async () => {
    //     try {
    //         await manager.startInspectorMode();
    //         console.log('Inspector mode auto-started');
    //     } catch (error) {
    //         console.log('Failed to auto-start inspector:', error);
    //     }
    // }, 1000);

    // Register all commands
    const commands = [
        // Main Dashboard
        vscode.commands.registerCommand('manager.openDashboard', () => {
            MainDashboard.createOrShow(context.extensionUri, manager);
        }),

        // Submit Problem Panel
        vscode.commands.registerCommand('manager.submitProblem', () => {
            SubmitProblemPanel.createOrShow(context.extensionUri, manager);
        }),

        // Live Feed Panel
        vscode.commands.registerCommand('manager.openLiveFeed', () => {
            LiveFeedPanel.createOrShow(context.extensionUri, manager, manager.getStorage());
        }),

        // Inspector Panel
        vscode.commands.registerCommand('manager.startInspector', () => {
            InspectorPanel.createOrShow(context.extensionUri, manager);
        }),

        // Test Inspector Panel
        vscode.commands.registerCommand('manager.testInspector', () => {
            TestInspectorPanel.createOrShow(context.extensionUri, manager);
        }),

        // Test Student View (alias for test inspector)
        vscode.commands.registerCommand('manager.testStudentView', () => {
            TestInspectorPanel.createOrShow(context.extensionUri, manager);
        }),

        // Join Inspector Session
        vscode.commands.registerCommand('manager.joinInspector', async () => {
            const sid = await vscode.window.showInputBox({ prompt: 'Enter Inspector Session ID' });
            if (!sid) {
                return;
            }
            const displayName = await vscode.window.showInputBox({ prompt: 'Enter your display name' });
            if (!displayName) {
                return;
            }

            manager.joinSession(sid.trim(), displayName.trim());
        }),

        // Internal command for dashboard integration
        vscode.commands.registerCommand('manager._internal.joinInspector', (data: { sessionId: string; displayName: string }) => {
            manager.joinSession(data.sessionId, data.displayName);
        }),

        // Leaderboard Panel
        vscode.commands.registerCommand('manager.openLeaderboard', () => {
            LeaderboardPanel.createOrShow(context.extensionUri, manager, manager.getStorage());
        }),

        // AI Analysis Panel
        vscode.commands.registerCommand('manager.openAiAnalysis', () => {
            AiAnalysisPanel.createOrShow(context.extensionUri, manager);
        }),

        // Additional utility commands
        vscode.commands.registerCommand('manager.connect', async () => {
            const config = vscode.workspace.getConfiguration('conaint');
            const serverUrl = config.get('serverUrl') as string;
            
            try {
                await manager.connect(serverUrl);
                vscode.window.showInformationMessage('Connected to CONAINT server');
            } catch (error) {
                vscode.window.showErrorMessage('Failed to connect: ' + (error as Error).message);
            }
        }),

        vscode.commands.registerCommand('manager.disconnect', () => {
            manager.disconnect();
            vscode.window.showInformationMessage('Disconnected from CONAINT server');
        }),

        vscode.commands.registerCommand('manager.toggleTelemetry', () => {
            const config = vscode.workspace.getConfiguration('conaint');
            const enabled = config.get('enableTelemetry') as boolean;
            config.update('enableTelemetry', !enabled, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Telemetry ${!enabled ? 'enabled' : 'disabled'}`);
        }),

        vscode.commands.registerCommand('manager.setApiKey', async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Hugging Face API Key',
                placeHolder: 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                password: true,
                validateInput: (value) => {
                    if (!value || !value.startsWith('hf_')) {
                        return 'Please enter a valid Hugging Face API key (starts with hf_)';
                    }
                    return null;
                }
            });
            
            if (apiKey) {
                const config = vscode.workspace.getConfiguration('conaint');
                await config.update('huggingFaceToken', apiKey, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('✅ Hugging Face API key configured successfully!');
            }
        }),

        vscode.commands.registerCommand('manager.showStatus', () => {
            const status = manager.getConnectionStatus();
            const message = status.connected 
                ? `Connected to ${status.url}` 
                : `Disconnected${status.error ? ': ' + status.error : ''}`;
            vscode.window.showInformationMessage(message);
        }),

        vscode.commands.registerCommand('manager.exportData', async () => {
            try {
                const data = await manager.getStorage().exportData();
                const document = await vscode.workspace.openTextDocument({
                    content: data,
                    language: 'json'
                });
                await vscode.window.showTextDocument(document);
                vscode.window.showInformationMessage('Data exported to new document');
            } catch (error) {
                vscode.window.showErrorMessage('Failed to export data: ' + (error as Error).message);
            }
        }),

        vscode.commands.registerCommand('manager.testAIAnalysis', async () => {
            const { AIAnalysisTestRunner } = await import('./AIAnalysisTestRunner.js');
            const testRunner = new AIAnalysisTestRunner(manager, manager.getStorage());
            await testRunner.runComprehensiveTest();
        }),

        vscode.commands.registerCommand('manager.generateAnalytics', async () => {
            try {
                const analytics = await manager.generateSessionAnalytics();
                if (analytics) {
                    const document = await vscode.workspace.openTextDocument({
                        content: JSON.stringify(analytics, null, 2),
                        language: 'json'
                    });
                    await vscode.window.showTextDocument(document);
                    vscode.window.showInformationMessage('Session analytics generated successfully!');
                } else {
                    vscode.window.showWarningMessage('No active session to analyze');
                }
            } catch (error) {
                vscode.window.showErrorMessage('Failed to generate analytics: ' + (error as Error).message);
            }
        }),

        vscode.commands.registerCommand('manager.importData', async () => {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Import',
                filters: {
                    'JSON files': ['json'],
                    'All files': ['*']
                }
            };

            const fileUri = await vscode.window.showOpenDialog(options);
            if (fileUri && fileUri[0]) {
                try {
                    const document = await vscode.workspace.openTextDocument(fileUri[0]);
                    const content = document.getText();
                    await manager.getStorage().importData(content);
                    vscode.window.showInformationMessage('Data imported successfully');
                } catch (error) {
                    vscode.window.showErrorMessage('Failed to import data: ' + (error as Error).message);
                }
            }
        }),

        vscode.commands.registerCommand('manager.startServer', async () => {
            try {
                // Try to start the server using VS Code tasks
                await vscode.commands.executeCommand('workbench.action.tasks.runTask', 'Start CONAINT Server');
                
                // Give server time to start
                setTimeout(async () => {
                    try {
                        const connected = await manager.connect('ws://localhost:3000');
                        if (connected) {
                            vscode.window.showInformationMessage('✅ CONAINT server started and connected!');
                        }
                    } catch (error) {
                        vscode.window.showWarningMessage('Server started but connection failed. Try connecting manually.');
                    }
                }, 3000);
                
                vscode.window.showInformationMessage('🚀 Starting CONAINT server...');
            } catch (error) {
                vscode.window.showErrorMessage('Failed to start server: ' + (error as Error).message);
                vscode.window.showInformationMessage(
                    '💡 To start manually:\n1. Open terminal\n2. cd server\n3. node index.js'
                );
            }
        }),

        // Export session data command (useful for users)
        vscode.commands.registerCommand('manager.exportSessionData', async () => {
            try {
                const data = await manager.getStorage().exportData();
                const document = await vscode.workspace.openTextDocument({
                    content: data,
                    language: 'json'
                });
                await vscode.window.showTextDocument(document);
                vscode.window.showInformationMessage('📊 Session data exported successfully');
            } catch (error) {
                vscode.window.showErrorMessage('Failed to export session data: ' + (error as Error).message);
            }
        }),

        // Debug command to check user ID status
        vscode.commands.registerCommand('manager.checkUserIdStatus', () => {
            const userId = manager.getUserId();
            const displayName = manager.getDisplayName();
            const sessionId = manager.getSessionId();
            const isStudentMode = manager.isInStudentMode();
            
            vscode.window.showInformationMessage(
                `User ID Status:\n` +
                `• User ID: ${userId}\n` +
                `• Display Name: ${displayName}\n` +
                `• Session ID: ${sessionId || 'None'}\n` +
                `• Student Mode: ${isStudentMode}`
            );
        }),

        // Debug command to clear session state
        vscode.commands.registerCommand('manager.clearSession', () => {
            manager.clearCurrentSession();
            vscode.window.showInformationMessage('🧹 Session state cleared');
        }),

        // Quick start inspector mode without dialog
        vscode.commands.registerCommand('manager.quickStartInspector', async () => {
            try {
                const sessionId = await manager.startInspectorModeQuick();
                vscode.window.showInformationMessage(`🎯 Inspector mode started! Session ID: ${sessionId}`);
            } catch (error) {
                vscode.window.showErrorMessage('Failed to start inspector mode: ' + (error as Error).message);
            }
        })
    ];

    // Register all commands with the context
    commands.forEach(command => context.subscriptions.push(command));

    // Show welcome message
    vscode.window.showInformationMessage(
        'CONAINT is ready! Use "CONAINT: Open Dashboard" to get started.',
        'Open Dashboard'
    ).then(selection => {
        if (selection === 'Open Dashboard') {
            vscode.commands.executeCommand('manager.openDashboard');
        }
    });

    // Auto-connect if configured
    const config = vscode.workspace.getConfiguration('conaint');
    if (config.get('autoConnect')) {
        const serverUrl = config.get('serverUrl') as string;
        if (serverUrl) {
            manager.connect(serverUrl).catch(error => {
                console.error('Auto-connect failed:', error);
            });
        }
    }
}

export function deactivate() {
    if (manager) {
        manager.dispose();
    }
}
