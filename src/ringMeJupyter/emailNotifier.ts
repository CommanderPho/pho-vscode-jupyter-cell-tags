import * as vscode from 'vscode';

export async function sendEmail(cellIndex: number, cellOutput: string) {
	const config = vscode.workspace.getConfiguration('jupyter-cell-tags.ringMeJupyter');
	const recipientEmail = config.get<string>('recipientEmail', ''); //email from settings

	if (!recipientEmail) {
		vscode.window.showErrorMessage("Please set your email in VS Code settings (Ring Me Jupyter: Recipient Email).");
		console.error("Recipient email not set.");
		return;
	}

	const subject = `Jupyter Cell ${cellIndex} Execution Complete`;
	const emailBody = `
🔔 Jupyter Cell Execution Completed

The following cell has finished executing:
Cell Index: ${cellIndex}

📤 Output:
${cellOutput || "No output available"}

This message was sent automatically by Ring-Me-Jupyter.
	`.trim();

	// Stub: Log what would be emailed instead of actually sending
	console.log('='.repeat(60));
	console.log('📧 EMAIL NOTIFICATION (STUB)');
	console.log('='.repeat(60));
	console.log(`To: ${recipientEmail}`);
	console.log(`Subject: ${subject}`);
	console.log('---');
	console.log(emailBody);
	console.log('='.repeat(60));
	console.log('(Email functionality is stubbed - no actual email sent)');
}
