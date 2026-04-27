'use client'

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { BenchmarkSuite } from "@/types/benchmark.types"
import { ReportBarChart } from "@/components/BarChart"

// Helper function to calculate average metrics from test case data
function calculateAverageMetrics(testCase: any) {
  return {
    ...testCase,
    data: [{
      category: 'Average',
      aidbox: Math.round(testCase.data.reduce((sum: number, dp: any) => sum + dp.aidbox, 0) / testCase.data.length),
      medplum: Math.round(testCase.data.reduce((sum: number, dp: any) => sum + dp.medplum, 0) / testCase.data.length),
      hapi: Math.round(testCase.data.reduce((sum: number, dp: any) => sum + dp.hapi, 0) / testCase.data.length),
      octofhir: Math.round(testCase.data.reduce((sum: number, dp: any) => sum + dp.octofhir, 0) / testCase.data.length)
    }]
  }
}

export function Suite({ suite }: { suite: BenchmarkSuite }) {
  const [expandedCards, setExpandedCards] = useState<{ [key: number]: boolean }>({})

  // Don't render if test_cases is empty
  if (!suite.test_cases || suite.test_cases.length === 0) {
    return null;
  }

  // Check if all servers return 0 in the result data
  const hasValidData = suite.result?.data?.some((dataPoint: any) =>
    dataPoint.aidbox !== 0 || dataPoint.medplum !== 0 || dataPoint.hapi !== 0 || dataPoint.octofhir !== 0
  );

  // Don't render if all values are 0
  if (!hasValidData) {
    return null;
  }

  return (
    <div >
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Suite: {suite.name}</CardTitle>
          <CardDescription>{suite.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <h3 className="text-lg font-medium text-gray-900">{suite.result.label}</h3>
          <div className="text-sm text-gray-600">{suite.result.description}</div>
          <br />
          <ReportBarChart result={suite.result} size="small" />
        </CardContent>

      {suite.test_cases.length == 1 &&
          suite.test_cases.map((testCase, index) => (
            <div key={index} className="mt-12">
              <div className="cursor-pointer hover:bg-gray-50 transition-colors mb-4 border-y px-6 py-4 border-gray-200" >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Test Case: {testCase.label}</h3>
                    <div className="text-sm text-gray-600">{testCase.description}</div>
                  </div>
                </div>
              </div>
              <CardContent>
                <ReportBarChart result={calculateAverageMetrics(testCase)} size="small" />
              </CardContent>
            </div>
          ))
      }


      {suite.test_cases.length > 1 &&
          suite.test_cases.map((testCase, index) => (
            <div key={index} className="mt-12">
              <div className="cursor-pointer hover:bg-gray-50 transition-colors mb-4 border-y px-6 py-4 border-gray-200" >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Test Case: {testCase.label}</h3>
                    <div className="text-sm text-gray-600">{testCase.description}</div>
                  </div>
                </div>
              </div>
              <CardContent>
                <ReportBarChart result={calculateAverageMetrics(testCase)} size="small" />
                <ReportBarChart result={testCase} size="big" />
              </CardContent>
            </div>
          ))
      }

      </Card>

    </div>
  )
}
