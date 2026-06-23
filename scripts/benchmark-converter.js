// Helper function to extract resource type from group string
function extractResourceType(group) {
    const parts = group.split('::');
    if (parts.length >= 3) {
        return parts[2]; // e.g., "::create::Patient" -> "Patient"
    }
    return group;
}

// Helper function to extract operation type from group string
function extractOperationType(group) {
    const parts = group.split('::');
    if (parts.length >= 2) {
        return parts[1]; // e.g., "::create::Patient" -> "create"
    }
    return group;
}

// Helper function to group metrics by operation and resource type
function groupMetricsByOperationAndResource(results) {
    const grouped = new Map();

    for (const result of results) {
        if (!result.metric.group) continue;

        const operation = extractOperationType(result.metric.group);
        const resourceType = extractResourceType(result.metric.group);
        const server = result.metric.fhirimpl;
        const value = parseInt(result.value[1]);

        if (!grouped.has(operation)) {
            grouped.set(operation, new Map());
        }

        const operationGroup = grouped.get(operation);
        if (!operationGroup.has(resourceType)) {
            operationGroup.set(resourceType, new Map());
        }

        const resourceGroup = operationGroup.get(resourceType);
        resourceGroup.set(server, value);
    }

    return grouped;
}

// Helper function to create benchmark data points from grouped metrics
function createBenchmarkDataPoints(groupedMetrics) {
    const dataPoints = [];

    for (const [resourceType, serverMetrics] of groupedMetrics) {
        const dataPoint = {
            category: resourceType,
            aidbox: 0,
            medplum: 0,
            hapi: 0,
            microsoft: 0
        };

        for (const [server, value] of serverMetrics) {
            if (server in dataPoint) {
                dataPoint[server] = Math.round(value);
            }
        }

        dataPoints.push(dataPoint);
    }

    return dataPoints;
}

// Helper function to get total RPS for each server
function getTotalRPS(results, precision = 0) {
    const serverTotals = new Map();

    for (const result of results) {
        const server = result.metric.fhirimpl;
        const value = parseFloat(result.value[1]);

        if (!serverTotals.has(server)) {
            serverTotals.set(server, 0);
        }

        serverTotals.set(server, serverTotals.get(server) + value);
    }

    const dataPoint = {
        category: 'Total',
        aidbox: precision == 0 ? Math.round(serverTotals.get('aidbox') || 0) : parseFloat((serverTotals.get('aidbox') || 0).toFixed(precision)),
        medplum: precision == 0 ? Math.round(serverTotals.get('medplum') || 0) : parseFloat((serverTotals.get('medplum') || 0).toFixed(precision)),
        hapi: precision == 0 ? Math.round(serverTotals.get('hapi') || 0) : parseFloat((serverTotals.get('hapi') || 0).toFixed(precision)),
        microsoft: precision == 0 ? Math.round(serverTotals.get('microsoft') || 0) : parseFloat((serverTotals.get('microsoft') || 0).toFixed(precision))
    };

    return [dataPoint];
}

// Main conversion function
export function convertSourceToBenchmarkReport(
    sourceData,
    runId,
    startTime,
    endTime,
    duration
) {
    const suites = [];

    // Convert CRUD data
    if (sourceData.crud) {
        const crudSuite = {
            name: 'CRUD',
            description: 'Create, Read, Update, Delete operations',
            result: {
                label: 'Average requests per second. (Higher is better)',
                description: 'Total requests per second across all CRUD operations',
                unit: 'RPS',
                data: getTotalRPS(sourceData.crud.summary.data.result)
            },
            test_cases: []
        };

        // Group P99 metrics by operation
        if (sourceData.crud.test_cases) {
            const groupedMetrics = groupMetricsByOperationAndResource(sourceData.crud.test_cases.data.result);

            // Create test cases for each operation
            for (const [operation, resourceGroups] of groupedMetrics) {
                const testCase = {
                    label: `${operation.charAt(0).toUpperCase() + operation.slice(1)} resource latency (Lower is better)`,
                    description: `P99 in milliseconds per each resource type for ${operation} operations`,
                    unit: 'MS',
                    data: createBenchmarkDataPoints(resourceGroups)
                };

                crudSuite.test_cases.push(testCase);
            }
        }

        suites.push(crudSuite);
    }

    // Convert Import data
    if (sourceData.import) {
        const importSuite = {
            name: 'Import',
            description: 'Bulk import operations',
            result: {
                label: 'Average requests per second. (Higher is better)',
                description: 'Total requests per second for import operations',
                unit: 'RPS',
                data: getTotalRPS(sourceData.import.summary.data.result, 2)
            },
            test_cases: []
        };

        // Add import test cases if available
        if (sourceData.import.test_cases) {
            let data = {
                category: 'Import',
                aidbox: 0,
                medplum: 0,
                hapi: 0,
                microsoft: 0
            }
            sourceData.import.test_cases.data.result.forEach(result => {
                data[result.metric.fhirimpl] = Math.round(parseFloat(result.value[1]))
            })

            const testCase = {
                label: 'Import Resources per second (Higher is better)',
                description: 'Total number of resources imported per second',
                unit: 'RPS',
                data: [data]
            };
            importSuite.test_cases.push(testCase);
        }

        suites.push(importSuite);
    }

    // Convert Search data
    if (sourceData.search) {
        const searchSuite = {
            name: 'FHIR Search',
            description: 'Search operations',
            result: {
                label: 'Average requests per second. (Higher is better)',
                description: 'Total requests per second across all search operations',
                unit: 'RPS',
                data: getTotalRPS(sourceData.search.summary.data.result)
            },
            test_cases: []
        };

        // Group P99 metrics by operation
        if (sourceData.search.test_cases) {
            const groupedMetrics = groupMetricsByOperationAndResource(sourceData.search.test_cases.data.result);

            // Create test cases for each operation
            for (const [operation, resourceGroups] of groupedMetrics) {
                const testCase = {
                    label: `${operation.charAt(0).toUpperCase() + operation.slice(1)} search latency (Lower is better)`,
                    description: `P99 in milliseconds per each resource type for ${operation} operations`,
                    unit: 'MS',
                    data: createBenchmarkDataPoints(resourceGroups)
                };

                searchSuite.test_cases.push(testCase);
            }
        }

        suites.push(searchSuite);
    }

    return {
        runid: runId,
        start_time: startTime,
        end_time: endTime,
        duration: duration,
        suites: suites
    };
}

// Helper function to generate run ID from timestamp
export function generateRunId() {
    return new Date().toISOString();
}

// Helper function to calculate duration from start and end times
export function calculateDuration(startTime, endTime) {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return end - start;
}

// Convenience function to convert with auto-generated metadata
export function convertSourceData(sourceData) {
    const runId = generateRunId();
    const startTime = runId;
    const endTime = new Date(new Date(runId).getTime() + 600000).toISOString(); // 10 minutes later
    const duration = calculateDuration(startTime, endTime);

    return convertSourceToBenchmarkReport(sourceData, runId, startTime, endTime, duration);
}