import * as vscode from 'vscode';
import { activateJupyterEnhancements } from './extension';

export function activateJupyterEnhancementsModule(context: vscode.ExtensionContext) {
	activateJupyterEnhancements(context);
}
