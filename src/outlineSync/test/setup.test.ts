/**
 * Setup verification test
 * 
 * This test file verifies that the testing infrastructure is properly configured
 * and that fast-check is working correctly with the specified configuration.
 */

import * as assert from 'assert';
import * as fc from 'fast-check';
import { propertyTestConfig } from './testConfig';

suite('Test Infrastructure Setup', () => {
    test('fast-check is properly installed and configured', () => {
        // Verify fast-check can generate basic values
        const result = fc.sample(fc.integer(), 10);
        assert.strictEqual(result.length, 10, 'Should generate 10 samples');
    });

    test('property test configuration has correct settings', () => {
        assert.strictEqual(
            propertyTestConfig.numRuns,
            100,
            'Property tests should run 100 iterations by default'
        );
    });

    test('simple property test runs successfully', () => {
        // A trivial property: adding zero to any number returns the same number
        fc.assert(
            fc.property(
                fc.integer(),
                (n) => {
                    return n + 0 === n;
                }
            ),
            propertyTestConfig
        );
    });

    test('property test can detect failures', () => {
        // This test verifies that property tests can actually fail
        // We expect this to throw because the property is false
        assert.throws(() => {
            fc.assert(
                fc.property(
                    fc.integer(),
                    (n) => {
                        // This property is intentionally false for most values
                        return n === 0;
                    }
                ),
                { numRuns: 10 } // Use fewer runs for this failure test
            );
        }, 'Property test should detect when property is violated');
    });
});
