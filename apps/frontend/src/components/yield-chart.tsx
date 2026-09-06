import { useState } from "react"
import { LineChart, Table2 } from "lucide-react"
import { DATES, percent } from "@/lib/demo-data"
import type { Market } from "@/lib/demo-data"

const chainSlot = { Ethereum: 1, Base: 2, Arbitrum: 3 }
export function YieldChart({
  items,
  title = "Supply APY over the last 7 days",
}: {
  items: Market[]
  title?: string
}) {
  const [table, setTable] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const allValues = items.flatMap((item) => item.history)
  const low = Math.max(0, Math.floor(Math.min(...allValues) - 0.5))
  const high = Math.ceil(Math.max(...allValues) + 0.5)
  const width = 680,
    height = 226,
    left = 38,
    right = 90,
    top = 18,
    bottom = 35
  const x = (index: number) => left + index * ((width - left - right) / 6)
  const y = (value: number) =>
    top + ((high - value) / (high - low)) * (height - top - bottom)
  const ticks = [low, low + (high - low) / 2, high]
  const color = (item: Market) => `var(--chart-${chainSlot[item.chain]})`
  return (
    <section className="yield-chart">
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <p>Aug 30 to Sep 5, 2026. Daily sample observations.</p>
        </div>
        <button
          className="icon-button"
          aria-label={table ? "Show APY chart" : "Show APY data table"}
          onClick={() => setTable(!table)}
        >
          {table ? <LineChart size={16} /> : <Table2 size={16} />}
        </button>
      </div>
      {items.length > 1 && (
        <div className="chart-legend">
          {items.map((item) => (
            <span key={item.id}>
              <i style={{ background: color(item) }} />
              {item.chain}
            </span>
          ))}
        </div>
      )}
      {table ? (
        <div className="table-scroll">
          <table className="data-table">
            <caption className="sr-only">
              Daily sample supply APY by market, 2026
            </caption>
            <thead>
              <tr>
                <th>Date</th>
                {items.map((item) => (
                  <th key={item.id}>
                    {item.protocol} / {item.chain}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DATES.map((date, index) => (
                <tr key={date}>
                  <td>{date}</td>
                  {items.map((item) => (
                    <td key={item.id}>{percent(item.history[index])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="chart-plot"
          tabIndex={0}
          role="group"
          aria-label="Interactive APY chart. Use left and right arrow keys to inspect dates, or use the data table button."
          onFocus={() => setActive(3)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault()
              setActive(
                Math.max(
                  0,
                  Math.min(
                    6,
                    (active ?? 3) + (event.key === "ArrowRight" ? 1 : -1)
                  )
                )
              )
            }
          }}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setActive(
                Math.max(
                  0,
                  Math.min(
                    6,
                    Math.round(
                      ((((event.clientX - rect.left) / rect.width) * width -
                        left) /
                        (width - left - right)) *
                        6
                    )
                  )
                )
              )
            }}
            onMouseLeave={() => setActive(null)}
          >
            {ticks.map((value) => (
              <g key={value}>
                <line
                  x1={left}
                  y1={y(value)}
                  x2={width - right}
                  y2={y(value)}
                  className="chart-grid"
                />
                <text
                  x={left - 10}
                  y={y(value) + 4}
                  textAnchor="end"
                  className="chart-axis"
                >
                  {value.toFixed(value % 1 ? 1 : 0)}%
                </text>
              </g>
            ))}
            {DATES.map((date, index) => (
              <text
                key={date}
                x={x(index)}
                y={height - 10}
                textAnchor="middle"
                className="chart-axis"
              >
                {date}
              </text>
            ))}
            {items.map((item, series) => (
              <g key={item.id}>
                {items.length === 1 && (
                  <path
                    d={`M${x(0)},${y(low)} ${item.history.map((value, index) => `L${x(index)},${y(value)}`).join(" ")} L${x(6)},${y(low)} Z`}
                    fill={color(item)}
                    opacity="0.08"
                  />
                )}
                <polyline
                  points={item.history
                    .map((value, index) => `${x(index)},${y(value)}`)
                    .join(" ")}
                  fill="none"
                  stroke={color(item)}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className={`chart-series series-${series}`}
                />
                <circle
                  cx={x(6)}
                  cy={y(item.history[6])}
                  r="4"
                  fill={color(item)}
                  className="chart-end"
                />
                <text
                  x={x(6) + 12}
                  y={y(item.history[6]) + 4}
                  className="chart-end-label"
                >
                  {percent(item.history[6])}
                </text>
              </g>
            ))}
            {active !== null && (
              <g>
                <line
                  x1={x(active)}
                  y1={top}
                  x2={x(active)}
                  y2={height - bottom}
                  className="chart-crosshair"
                />
                {items.map((item) => (
                  <circle
                    key={item.id}
                    cx={x(active)}
                    cy={y(item.history[active])}
                    r="4"
                    fill={color(item)}
                    className="chart-end"
                  />
                ))}
              </g>
            )}
          </svg>
          {active !== null && (
            <div className="chart-tooltip" role="status">
              <strong>{DATES[active]}, 2026</strong>
              {items.map((item) => (
                <div key={item.id}>
                  <i style={{ background: color(item) }} />
                  <span>{item.chain}</span>
                  <b>{percent(item.history[active])}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
