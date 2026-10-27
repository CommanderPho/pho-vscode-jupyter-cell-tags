export async function waitFor<T>(
	fn: () => T | Promise<T>,
	timeoutMs = 8000,
	intervalMs = 50
): Promise<T> {
	const start = Date.now();
	let lastError: unknown;
	while (Date.now() - start < timeoutMs) {
		try {
			const value = await fn();
			if (value) {
				return value;
			}
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw lastError instanceof Error
		? lastError
		: new Error(`waitFor timed out after ${timeoutMs}ms`);
}
