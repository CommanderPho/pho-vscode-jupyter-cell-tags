export const KERNEL_TEST_ENV = 'JUPYTER_CELL_TAGS_KERNEL_TESTS';

export function kernelTestsEnabled(): boolean {
	return process.env[KERNEL_TEST_ENV] === '1';
}

export function skipWithoutKernel(testContext: { skip(): void }): void {
	if (!kernelTestsEnabled()) {
		testContext.skip();
	}
}
