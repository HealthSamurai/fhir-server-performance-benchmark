export interface BenchmarkDataPoint {
  category: string;
  aidbox: number;
  medplum: number;
  hapi: number;
  octofhir: number;
}

export interface BenchmarkResult {
  label: string;
  description: string;
  unit: string;
  data: BenchmarkDataPoint[];
}

export interface TestCase {
  label: string;
  description: string;
  unit: string;
  data: BenchmarkDataPoint[];
}

export interface BenchmarkSuite {
  name: string;
  description: string;
  result: BenchmarkResult;
  test_cases: TestCase[];
}

export interface BenchmarkReport {
  runid: string;
  start_time: string;
  end_time: string;
  duration: number;
  suites: BenchmarkSuite[];
  grafanaSnapshot?: { url: string };
}

// Specific types for common result types
export type ResultType = 'Requests per second' | 'P99' | 'P95' | 'P50' | 'Average';
export type UnitType = 'rps' | 'ms' | 's' | 'count' | 'RPS' | 'MS';

// Enhanced result interface with specific types
export interface TypedBenchmarkResult {
  label: string;
  description: string;
  unit: UnitType;
  data: BenchmarkDataPoint[];
}

// Enhanced interfaces using the typed result
export interface TypedTestCase {
  label: string;
  description: string;
  unit: UnitType;
  data: BenchmarkDataPoint[];
}

export interface TypedBenchmarkSuite {
  name: string;
  description: string;
  result: TypedBenchmarkResult;
  test_cases: TypedTestCase[];
}

export interface TypedBenchmarkReport {
  runid: string;
  start_time: string;
  end_time: string;
  duration: number;
  suites: TypedBenchmarkSuite[];
}

// Utility types for working with the data
export type ServerName = 'aidbox' | 'medplum' | 'hapi' | 'octofhir';

export interface ServerPerformance {
  [key: string]: number;
}

// Helper type for extracting server names from data
export type ExtractServerNames<T> = T extends { data: infer D } 
  ? D extends Record<string, number> 
    ? keyof D 
    : never 
  : never; 