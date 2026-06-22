'use client'

import { BenchmarkSuite, ServerName, BenchmarkReport } from "@/types/benchmark.types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import Image from "next/image"

// Get base path from environment or use empty string for local dev
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

// Use absolute paths with base path for images
const serverIcons = {
  aidbox: `${basePath}/images/aidbox.svg`,
  medplum: `${basePath}/images/medplum.svg`,
  hapi: `${basePath}/images/hapi.png`
}

function calculateServerStats(suites: BenchmarkSuite[]) {
  const stats = {
    aidbox: { wins: 0, avgRps: 0 },
    medplum: { wins: 0, avgRps: 0 },
    hapi: { wins: 0, avgRps: 0 }
  }

  let totalRps = {
    aidbox: 0,
    medplum: 0,
    hapi: 0
  }

  let rpsTestCount = 0

  // Calculate wins and sum up RPS across all suites
  suites.forEach(suite => {
    suite.test_cases.forEach(testCase => {
      const averages = {
        aidbox: testCase.data.reduce((sum: number, dp: any) => sum + dp.aidbox, 0) / testCase.data.length,
        medplum: testCase.data.reduce((sum: number, dp: any) => sum + dp.medplum, 0) / testCase.data.length,
        hapi: testCase.data.reduce((sum: number, dp: any) => sum + dp.hapi, 0) / testCase.data.length
      }

      // For metrics where lower is better (like response time), we want the minimum
      const isLowerBetter = testCase.unit.toLowerCase() === 'ms'
      let bestServer: ServerName = 'aidbox'
      let bestValue = averages.aidbox

      Object.entries(averages).forEach(([server, value]) => {
        if (isLowerBetter ? value < bestValue : value > bestValue) {
          bestServer = server as ServerName
          bestValue = value
        }
      })

      stats[bestServer].wins++

      // Sum up RPS for average calculation
      if (testCase.unit.toLowerCase() === 'rps') {
        rpsTestCount++
        Object.entries(averages).forEach(([server, value]) => {
          totalRps[server as keyof typeof totalRps] += value
        })
      }
    })
  })

  // Calculate average RPS
  if (rpsTestCount > 0) {
    Object.keys(stats).forEach(server => {
      stats[server as keyof typeof stats].avgRps = Math.round(totalRps[server as keyof typeof totalRps] / rpsTestCount)
    })
  }

  return stats
}

export function ReportSummary({ report }: { report: BenchmarkReport }) {
  const stats = calculateServerStats(report.suites)

  return (
    <div></div>
  )
} 