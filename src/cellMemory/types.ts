/** Approximate kernel RSS sample for one cell execution (session memory only). */
export interface MemoryBreakdown {
	/** Cell document URI string. */
	cellUri: string;
	/** Notebook document URI string. */
	notebookUri: string;
	cellIndex: number;
	/** Monotonic session sequence for this feature (1-based). */
	executionOrder: number;
	/** Jupyter executionSummary.executionOrder when available. */
	jupyterExecutionOrder?: number;
	beforeBytes?: number;
	afterBytes?: number;
	/** Peak RSS observed at after-sample time (process max RSS, approximate). */
	peakBytes?: number;
	deltaBytes?: number;
	/** Wall-clock ms when the after sample completed. */
	finishedAt: number;
	/** True when the before sample was skipped (fallback path). */
	beforeSkipped?: boolean;
}

export interface RssSample {
	rssBytes: number;
	peakBytes: number;
}
