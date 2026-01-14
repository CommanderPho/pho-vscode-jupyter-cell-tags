/**
 * Test configuration for outline synchronization tests
 * 
 * This module provides shared configuration for property-based tests
 * using fast-check, ensuring consistent test behavior across all test files.
 */

import * as fc from 'fast-check';

/**
 * Standard configuration for property-based tests
 * 
 * All property tests should use this configuration to ensure:
 * - Minimum of 100 iterations per test
 * - Consistent random seed behavior
 * - Reproducible test failures
 */
export const propertyTestConfig: fc.Parameters<unknown> = {
    numRuns: 100,
    verbose: false,
    // Enable to see all generated values during test runs
    // verbose: true,
};

/**
 * Extended configuration for more thorough property testing
 * Use this for critical properties that need extra validation
 */
export const thoroughPropertyTestConfig: fc.Parameters<unknown> = {
    numRuns: 500,
    verbose: false,
};

/**
 * Configuration for quick smoke tests during development
 * Use sparingly - production tests should use propertyTestConfig
 */
export const quickPropertyTestConfig: fc.Parameters<unknown> = {
    numRuns: 10,
    verbose: false,
};
