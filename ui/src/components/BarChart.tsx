'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer } from "recharts"
import {
    ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart"
import { BenchmarkResult } from "@/types/benchmark.types"


const chartConfig = {
    aidbox: { label: "Aidbox", },
    medplum: { label: "Medplum", },
    hapi: { label: "Hapi", },
    microsoft: { label: "Microsoft", },
    wso2: { label: "WSO2", }
} satisfies ChartConfig



// Order the server series best-first. Direction follows the metric: for latency
// (ms/s) lower is better, otherwise (rps) higher is better. Bars with several
// categories are ranked by their mean value across all of them, so the ordering
// stays consistent for the whole chart.
function orderedServerKeys(result: BenchmarkResult): string[] {
    const keys = Object.keys(chartConfig)
    const lowerBetter = ["ms", "s"].includes(result.unit.toLowerCase())
    const score = (key: string) => {
        const data = result.data
        if (!data.length) return 0
        return data.reduce((sum, dp: any) => sum + (dp[key] || 0), 0) / data.length
    }
    return [...keys].sort((a, b) => (lowerBetter ? score(a) - score(b) : score(b) - score(a)))
}

export function ReportBarChart({ result, size }: { result: BenchmarkResult, size: "small" | "big" }) {
    const serverKeys = orderedServerKeys(result)

    // For the detailed chart size to its content: the height of each category
    // group scales with the number of server bars in it (~20px per bar plus
    // padding) so adding a server doesn't squeeze the bars. Plus room for the
    // legend/axis. Avoids one lonely bar floating in a fixed-height box when a
    // test case has a single resource type.
    const rowCount = Math.max(result.data.length, 1)
    // Small summary bars are thicker (barSize 24), so they need a bit more room
    // per server than the detailed view; both scale with the server count so an
    // added server doesn't squeeze the group.
    const groupHeight = size === "small" ? serverKeys.length * 28 + 12 : serverKeys.length * 20 + 20
    const className = size === "small" ? "w-full" : "aspect-auto w-full"
    const style = { height: rowCount * groupHeight + 80 }

    return (
        <ChartContainer config={chartConfig} className={className} style={style}>
            <BarChart
                accessibilityLayer
                data={result.data}
                layout="vertical"
            >
                <XAxis type="number" hide />
                <YAxis
                    dataKey="category"
                    type="category"
                    tickLine={false}
                    tickMargin={10}
                    className="text-sm font-bold"
                    width={size === "small" ? 70 : 170}
                    axisLine={false}
                    tickFormatter={(value) => value}
                />
                {/* <CartesianGrid horizontal={false} /> */}

                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="line" />}
                />
                <ChartLegend content={<ChartLegendContent />} />

                {serverKeys.map((key) => (
                    <Bar
                        key={key}
                        dataKey={key}
                        fill={`var(--color-${key})`}
                        radius={size === "small" ? 4 : 2}
                        barSize={size === "small" ? 24 : 15}
                    >
                        <LabelList
                            dataKey={key}
                            formatter={(value: any) => `${value} ${result.unit}`}
                            position="insideRight"
                            fill="white"
                            offset={10}
                            fontSize={size === "small" ? 12 : 10}
                        />
                    </Bar>
                ))}

            </BarChart>

        </ChartContainer>

    )
}