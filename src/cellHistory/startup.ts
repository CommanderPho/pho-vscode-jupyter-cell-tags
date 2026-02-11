// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { trackCellHistory } from './cellHistoryTracking';

export function activateCellHistoryTracking(context: vscode.ExtensionContext) {
    trackCellHistory(context);
}
