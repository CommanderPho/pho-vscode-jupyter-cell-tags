# Outline Sync Tests

This directory contains tests for the Outline Selection Synchronization feature.

## Test Structure

- `*.test.ts` - Unit tests for individual components
- `*.property.test.ts` - Property-based tests using fast-check

## Running Tests

```bash
npm test
```

## Test Configuration

All property-based tests are configured to run a minimum of 100 iterations to ensure comprehensive coverage across randomly generated inputs.
