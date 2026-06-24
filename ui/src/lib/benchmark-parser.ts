import { BenchmarkReport, TypedBenchmarkReport, ServerName, BenchmarkDataPoint } from '../types/benchmark.types';

/**
 * Parse a benchmark report from JSON string
 */
export function parseBenchmarkReport(jsonString: string): BenchmarkReport {
  try {
    const data = JSON.parse(jsonString);
    return validateBenchmarkReport(data);
  } catch (error) {
    throw new Error(`Failed to parse benchmark report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate and type-check a benchmark report object
 */
export function validateBenchmarkReport(data: any): BenchmarkReport {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid benchmark report: must be an object');
  }

  const requiredFields = ['runid', 'start_time', 'end_time', 'duration', 'suites'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`Invalid benchmark report: missing required field '${field}'`);
    }
  }

  if (typeof data.runid !== 'string') {
    throw new Error('Invalid benchmark report: runid must be a string');
  }

  if (typeof data.start_time !== 'string') {
    throw new Error('Invalid benchmark report: start_time must be a string');
  }

  if (typeof data.end_time !== 'string') {
    throw new Error('Invalid benchmark report: end_time must be a string');
  }

  if (typeof data.duration !== 'number') {
    throw new Error('Invalid benchmark report: duration must be a number');
  }

  if (!Array.isArray(data.suites)) {
    throw new Error('Invalid benchmark report: suites must be an array');
  }

  const validatedSuites = data.suites.map((suite: any, index: number) => {
    return validateBenchmarkSuite(suite, index);
  });

  return {
    runid: data.runid,
    start_time: data.start_time,
    end_time: data.end_time,
    duration: data.duration,
    suites: validatedSuites,
    grafanaSnapshot: data.grafanaSnapshot && typeof data.grafanaSnapshot.url === 'string'
      ? { url: data.grafanaSnapshot.url }
      : undefined,
  };
}

/**
 * Validate a benchmark suite
 */
function validateBenchmarkSuite(suite: any, index: number) {
  if (!suite || typeof suite !== 'object') {
    throw new Error(`Invalid suite at index ${index}: must be an object`);
  }

  const requiredFields = ['name', 'description', 'result', 'test_cases'];
  for (const field of requiredFields) {
    if (!(field in suite)) {
      throw new Error(`Invalid suite at index ${index}: missing required field '${field}'`);
    }
  }

  if (typeof suite.name !== 'string') {
    throw new Error(`Invalid suite at index ${index}: name must be a string`);
  }

  if (typeof suite.description !== 'string') {
    throw new Error(`Invalid suite at index ${index}: description must be a string`);
  }

  const validatedResult = validateBenchmarkResult(suite.result, index);
  const validatedTestCases = suite.test_cases.map((testCase: any, testIndex: number) => {
    return validateTestCase(testCase, index, testIndex);
  });

  return {
    name: suite.name,
    description: suite.description,
    result: validatedResult,
    test_cases: validatedTestCases,
  };
}

/**
 * Validate a benchmark result
 */
function validateBenchmarkResult(result: any, suiteIndex: number) {
  if (!result || typeof result !== 'object') {
    throw new Error(`Invalid result in suite ${suiteIndex}: must be an object`);
  }

  const requiredFields = ['label', 'description', 'unit', 'data'];
  for (const field of requiredFields) {
    if (!(field in result)) {
      throw new Error(`Invalid result in suite ${suiteIndex}: missing required field '${field}'`);
    }
  }

  if (typeof result.label !== 'string') {
    throw new Error(`Invalid result in suite ${suiteIndex}: label must be a string`);
  }

  if (typeof result.description !== 'string') {
    throw new Error(`Invalid result in suite ${suiteIndex}: description must be a string`);
  }

  if (typeof result.unit !== 'string') {
    throw new Error(`Invalid result in suite ${suiteIndex}: unit must be a string`);
  }

  if (!Array.isArray(result.data)) {
    throw new Error(`Invalid result in suite ${suiteIndex}: data must be an array`);
  }

  const validatedData = result.data.map((dataPoint: any, dataIndex: number) => {
    return validateBenchmarkDataPoint(dataPoint, suiteIndex, dataIndex);
  });

  return {
    label: result.label,
    description: result.description,
    unit: result.unit,
    data: validatedData,
  };
}

/**
 * Validate a benchmark data point
 */
function validateBenchmarkDataPoint(dataPoint: any, suiteIndex: number, dataIndex: number): BenchmarkDataPoint {
  if (!dataPoint || typeof dataPoint !== 'object') {
    throw new Error(`Invalid data point ${dataIndex} in suite ${suiteIndex}: must be an object`);
  }

  const requiredFields = ['category', 'aidbox', 'medplum', 'hapi'];
  for (const field of requiredFields) {
    if (!(field in dataPoint)) {
      throw new Error(`Invalid data point ${dataIndex} in suite ${suiteIndex}: missing required field '${field}'`);
    }
  }

  if (typeof dataPoint.category !== 'string') {
    throw new Error(`Invalid data point ${dataIndex} in suite ${suiteIndex}: category must be a string`);
  }

  if (typeof dataPoint.aidbox !== 'number') {
    throw new Error(`Invalid data point ${dataIndex} in suite ${suiteIndex}: aidbox must be a number`);
  }

  if (typeof dataPoint.medplum !== 'number') {
    throw new Error(`Invalid data point ${dataIndex} in suite ${suiteIndex}: medplum must be a number`);
  }

  if (typeof dataPoint.hapi !== 'number') {
    throw new Error(`Invalid data point ${dataIndex} in suite ${suiteIndex}: hapi must be a number`);
  }

  // microsoft was added after the first reports were snapshotted; treat it as
  // optional and default to 0 so historical SNAPSHOT_*.json (which predate it)
  // still parse. When present it must still be a number.
  if ('microsoft' in dataPoint && typeof dataPoint.microsoft !== 'number') {
    throw new Error(`Invalid data point ${dataIndex} in suite ${suiteIndex}: microsoft must be a number`);
  }

  return {
    category: dataPoint.category,
    aidbox: dataPoint.aidbox,
    medplum: dataPoint.medplum,
    hapi: dataPoint.hapi,
    microsoft: dataPoint.microsoft ?? 0,
  };
}

/**
 * Validate a test case
 */
function validateTestCase(testCase: any, suiteIndex: number, testIndex: number) {
  if (!testCase || typeof testCase !== 'object') {
    throw new Error(`Invalid test case ${testIndex} in suite ${suiteIndex}: must be an object`);
  }

  const requiredFields = ['label', 'description', 'unit', 'data'];
  for (const field of requiredFields) {
    if (!(field in testCase)) {
      throw new Error(`Invalid test case ${testIndex} in suite ${suiteIndex}: missing required field '${field}'`);
    }
  }

  if (typeof testCase.label !== 'string') {
    throw new Error(`Invalid test case ${testIndex} in suite ${suiteIndex}: label must be a string`);
  }

  if (typeof testCase.description !== 'string') {
    throw new Error(`Invalid test case ${testIndex} in suite ${suiteIndex}: description must be a string`);
  }

  if (typeof testCase.unit !== 'string') {
    throw new Error(`Invalid test case ${testIndex} in suite ${suiteIndex}: unit must be a string`);
  }

  if (!Array.isArray(testCase.data)) {
    throw new Error(`Invalid test case ${testIndex} in suite ${suiteIndex}: data must be an array`);
  }

  const validatedData = testCase.data.map((dataPoint: any, dataIndex: number) => {
    return validateBenchmarkDataPoint(dataPoint, suiteIndex, dataIndex);
  });

  return {
    label: testCase.label,
    description: testCase.description,
    unit: testCase.unit,
    data: validatedData,
  };
}

/**
 * Get all server names from a benchmark report
 */
export function getServerNames(report: BenchmarkReport): ServerName[] {
  return ['aidbox', 'medplum', 'hapi', 'microsoft'];
}

/**
 * Calculate the total duration of a benchmark run in seconds
 */
export function getBenchmarkDuration(report: BenchmarkReport): number {
  return report.duration / 1000; // Convert from milliseconds to seconds
}

/**
 * Get the start and end times as Date objects
 */
export function getBenchmarkTimeRange(report: BenchmarkReport): { start: Date; end: Date } {
  return {
    start: new Date(report.start_time),
    end: new Date(report.end_time),
  };
} 