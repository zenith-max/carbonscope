import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line, Legend } from 'recharts';
import { Globe, Search, Moon, Sun, TrendingUp } from 'lucide-react';

const API_BASE = 'http://localhost:8000';
const RANGE_PRESETS = [
  { label: '1750–2017', value: [1750, 2017] },
  { label: '1900–2017', value: [1900, 2017] },
  { label: '1950–2017', value: [1950, 2017] },
  { label: '2000–2017', value: [2000, 2017] },
];

const chartPalette = ['#2F6D4A', '#3A7D5B', '#6FA28C', '#88B19A', '#B8D2C1'];

type GlobalSeriesItem = { year: number; value: number };
type CountrySummary = { country: string; year: number; co2: number; population: number; rank: number; change_from_previous_year: number | null; iso_code?: string | null };
type HistoryPoint = { year: number; co2: number };
type Insight = { title: string; description: string };

type GlobalData = { series: GlobalSeriesItem[] };

type ComparePoint = { country: string; year: number; co2: number };

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function App() {
  const [dark, setDark] = useState(false);
  const [globalData, setGlobalData] = useState<GlobalData | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [selectedRange, setSelectedRange] = useState<[number, number]>([1750, 2017]);
  const [year, setYear] = useState(2017);
  const [countries, setCountries] = useState<CountrySummary[]>([]);
  const [countrySearch, setCountrySearch] = useState('');
  const [compareSelection, setCompareSelection] = useState<string[]>(['China', 'United States', 'India', 'Germany']);
  const [countryCompareData, setCountryCompareData] = useState<ComparePoint[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('China');
  const [countryDetail, setCountryDetail] = useState<any>(null);
  const [countryHistory, setCountryHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    fetchJson<GlobalData>('/api/global').then(setGlobalData).catch(console.error);
    fetchJson<any>('/api/summary').then(setSummary).catch(console.error);
    fetchJson<CountrySummary[]>('/api/countries?year=2017').then(setCountries).catch(console.error);
  }, []);

  useEffect(() => {
    fetchJson<CountrySummary[]>(`/api/countries?year=${year}`).then(setCountries).catch(console.error);
  }, [year]);

  useEffect(() => {
    const list = compareSelection.join(',');
    fetchJson<{ series: ComparePoint[] }>(`/api/compare?countries=${encodeURIComponent(list)}`).then((data) => {
      setCountryCompareData(data.series ?? []);
    }).catch(console.error);
  }, [compareSelection]);

  useEffect(() => {
    if (!selectedCountry) return;
    fetchJson<any>(`/api/country/${encodeURIComponent(selectedCountry)}`).then(setCountryDetail).catch(console.error);
    fetchJson<HistoryPoint[]>(`/api/country/${encodeURIComponent(selectedCountry)}/history`).then(setCountryHistory).catch(console.error);
  }, [selectedCountry]);

  const filteredCountries = useMemo(() => {
    const normalized = countrySearch.toLowerCase();
    return countries.filter((country) => country.country.toLowerCase().includes(normalized));
  }, [countries, countrySearch]);

  const globalWithinRange = useMemo(() => {
    if (!globalData) return [] as GlobalSeriesItem[];
    return globalData.series.filter((item) => item.year >= selectedRange[0] && item.year <= selectedRange[1]);
  }, [globalData, selectedRange]);

  const metricCards = [
    { label: 'Global CO₂ Emissions', value: summary ? `${numberFormatter.format(Math.round(summary.latest_global_co2))} MtCO₂` : '—', detail: `Latest year: ${summary?.latest_year ?? '—'}` },
    { label: 'Highest Emitting Country', value: summary ? summary.highest_emitting_country : '—', detail: summary ? `${numberFormatter.format(Math.round(summary.highest_emitting_value))} MtCO₂` : '—' },
    { label: 'Data Coverage', value: '1750–2017', detail: 'Historical emissions dataset' },
  ];

  const comparisonChartData = useMemo(() => {
    const map = new Map<number, Record<string, number | string>>();
    countryCompareData.forEach((item) => {
      const entry = (map.get(item.year) ?? { year: item.year }) as Record<string, number | string>;
      (entry as Record<string, number | string>)[item.country] = item.co2;
      map.set(item.year, entry);
    });
    return Array.from(map.values()).sort((a, b) => Number(a.year) - Number(b.year));
  }, [countryCompareData]);

  const mapData = useMemo(() => {
    return countries.filter((item) => item.iso_code && item.iso_code.length === 3 && item.co2 != null);
  }, [countries]);

  const choroplethData = useMemo(() => ({
    type: 'choropleth' as const,
    locationmode: 'ISO-3' as const,
    locations: mapData.map((item) => item.iso_code ?? ''),
    z: mapData.map((item) => Number(item.co2 || 0)),
    text: mapData.map((item) => `${item.country} (${Number(item.co2 || 0).toLocaleString()} MtCO₂)`),
    hovertemplate: '<b>%{text}</b><extra></extra>',
    colorscale: [
      [0, '#EEF5EF'],
      [0.25, '#D7E9DD'],
      [0.5, '#A6C9B0'],
      [0.75, '#5A9B78'],
      [1, '#2F6D4A'],
    ],
    marker: { line: { color: '#FAFAF8', width: 0.5 } },
    colorbar: { thickness: 12, title: 'MtCO₂' },
  }), [mapData]);

  const pageClasses = dark ? 'dark bg-[#101614] text-white' : 'bg-[#FAFAF8] text-[#161816]';

  return (
    <div className={pageClasses}>
      <div className="min-h-screen transition-colors duration-300">
        <header className="sticky top-0 z-20 border-b border-[#E5E7E1] bg-[#FAFAF8]/90 backdrop-blur-sm dark:bg-[#101614]/90">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#DCE5DF] bg-white text-[#2F6D4A] shadow-soft">
                <Globe className="h-4 w-4" />
              </div>
              <div className="text-lg font-semibold">CarbonScope</div>
            </div>
            <nav className="hidden items-center gap-7 text-sm font-medium text-[#5B665F] md:flex">
              <span>Overview</span>
              <span>Explore</span>
              <span>Compare</span>
              <span>Countries</span>
              <span>About</span>
            </nav>
            <button
              onClick={() => setDark(!dark)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7E1] bg-white text-[#161816]"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="grid-pattern rounded-[22px] border border-[#E5E7E1] bg-[#F8F9F4] p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col gap-8">
              <div className="flex items-center gap-2 text-sm text-[#3E4B45]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2F6D4A]" />
                <span>Historical emissions dataset</span>
              </div>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-[-0.06em] sm:text-5xl lg:text-6xl">
                  The Carbon Footprint of Our Planet.
                </h1>
                <p className="max-w-xl text-base text-[#5B665F] sm:text-lg">
                  Explore how CO₂ emissions have changed across countries and generations.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {metricCards.map((metric) => (
                  <div key={metric.label} className="card bg-white p-5">
                    <div className="text-sm text-[#5B665F]">{metric.label}</div>
                    <div className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{metric.value}</div>
                    <div className="mt-2 text-xs text-[#5B665F]">{metric.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="card p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.04em]">Global Emissions Timeline</h2>
                  <p className="text-sm text-[#5B665F]">Total global CO₂ emissions over time</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {RANGE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setSelectedRange(preset.value as [number, number])}
                      className={`rounded-full border px-2.5 py-1.5 text-xs ${
                        Math.round(selectedRange[0]) === preset.value[0] ? 'border-[#2F6D4A] bg-[#EAF4EE] text-[#2F6D4A]' : 'border-[#E5E7E1] bg-white text-[#5B665F]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 flex items-center gap-3 text-sm text-[#5B665F]">
                <label className="text-xs uppercase tracking-[0.12em] text-[#77827B]">From</label>
                <input
                  type="number"
                  value={selectedRange[0]}
                  onChange={(e) => setSelectedRange([Number(e.target.value), selectedRange[1]])}
                  className="w-20 rounded-lg border border-[#E5E7E1] bg-white px-2 py-1.5"
                />
                <label className="text-xs uppercase tracking-[0.12em] text-[#77827B]">To</label>
                <input
                  type="number"
                  value={selectedRange[1]}
                  onChange={(e) => setSelectedRange([selectedRange[0], Number(e.target.value)])}
                  className="w-20 rounded-lg border border-[#E5E7E1] bg-white px-2 py-1.5"
                />
              </div>

              <div className="chart-shell">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={globalWithinRange} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <defs>
                      <linearGradient id="co2Fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2F6D4A" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#2F6D4A" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#EBEFEA" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: '#64706B', fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64706B', fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number | string | readonly (number | string)[] | undefined) => [`${numberFormatter.format(Number(Array.isArray(value) ? value[0] ?? 0 : value ?? 0))} MtCO₂`, 'CO₂']}
                      labelFormatter={(label) => `Year ${label}`}
                    />
                    <Area type="monotone" dataKey="value" stroke="#2F6D4A" strokeWidth={2.5} fill="url(#co2Fill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5 sm:p-6">
              <h3 className="text-lg font-semibold">What the Data Shows</h3>
              <div className="mt-4 space-y-4">
                {summary?.insights?.map((insight: Insight) => (
                  <div key={insight.title} className="rounded-2xl border border-[#E5E7E1] bg-[#F8F9F4] p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#2F6D4A]">
                      <TrendingUp className="h-4 w-4" />
                      {insight.title}
                    </div>
                    <p className="text-sm leading-6 text-[#5B665F]">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="card p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.04em]">World Emissions Map</h2>
                  <p className="text-sm text-[#5B665F]">CO₂ emissions by country</p>
                </div>
                <div className="rounded-full border border-[#E5E7E1] bg-[#F8F9F4] px-3 py-1.5 text-sm text-[#5B665F]">
                  Year: {year}
                </div>
              </div>
              <div className="h-[360px] rounded-2xl border border-[#E5E7E1] bg-[#F8F9F4] p-2">
                <Plot
                  data={[choroplethData]}
                  layout={{
                    margin: { l: 0, r: 0, t: 0, b: 0 },
                    paper_bgcolor: '#F8F9F4',
                    plot_bgcolor: '#F8F9F4',
                    geo: {
                      showframe: false,
                      showcoastlines: false,
                      projection: { type: 'natural earth' },
                      bgcolor: '#F8F9F4',
                    },
                    font: { family: 'Inter, sans-serif', color: '#161816' },
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: '100%' }}
                  useResizeHandler
                />
              </div>
              <div className="mt-4">
                <input
                  type="range"
                  min={1750}
                  max={2017}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full accent-[#2F6D4A]"
                />
                <div className="mt-2 flex justify-between text-xs text-[#5B665F]">
                  <span>1750</span>
                  <span>2017</span>
                </div>
              </div>
            </div>

            <div className="card p-5 sm:p-6">
              <h2 className="text-xl font-semibold tracking-[-0.04em]">Country Comparison</h2>
              <p className="text-sm text-[#5B665F]">Compare countries over time</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['China', 'United States', 'India', 'Germany', 'Japan', 'United Kingdom'].map((country) => (
                  <button
                    key={country}
                    onClick={() => {
                      setCompareSelection((prev) => {
                        if (prev.includes(country)) {
                          return prev.filter((item) => item !== country);
                        }
                        if (prev.length >= 5) {
                          return [...prev.slice(1), country];
                        }
                        return [...prev, country];
                      });
                    }}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      compareSelection.includes(country)
                        ? 'border-[#2F6D4A] bg-[#EAF4EE] text-[#2F6D4A]'
                        : 'border-[#E5E7E1] bg-white text-[#5B665F]'
                    }`}
                  >
                    {country}
                  </button>
                ))}
              </div>
              <div className="chart-shell mt-4 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comparisonChartData} margin={{ top: 10, right: 10, left: -24, bottom: 10 }}>
                    <CartesianGrid stroke="#EBEFEA" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: '#64706B', fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64706B', fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number | string | readonly (number | string)[] | undefined) => [`${numberFormatter.format(Number(Array.isArray(value) ? value[0] ?? 0 : value ?? 0))} MtCO₂`, 'CO₂']}
                      labelFormatter={(label) => `Year ${label}`}
                    />
                    <Legend />
                    {compareSelection.map((country, index) => (
                      <Line
                        key={country}
                        type="monotone"
                        dataKey={country}
                        stroke={chartPalette[index % chartPalette.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="mt-8 card p-5 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em]">Country Explorer</h2>
                <p className="text-sm text-[#5B665F]">Search and sort the historical dataset</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[#E5E7E1] bg-[#F8F9F4] px-3 py-2 text-sm text-[#5B665F]">
                <Search className="h-4 w-4" />
                <input
                  value={countrySearch}
                  onChange={(event) => setCountrySearch(event.target.value)}
                  placeholder="Search country"
                  className="w-36 bg-transparent outline-none placeholder:text-[#8A938C]"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-[#5B665F]">
                    <th className="pb-2 pr-4 font-medium">Country</th>
                    <th className="pb-2 pr-4 font-medium">Year</th>
                    <th className="pb-2 pr-4 font-medium">CO₂ emissions</th>
                    <th className="pb-2 pr-4 font-medium">Rank</th>
                    <th className="pb-2 pr-4 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCountries.slice(0, 8).map((country) => (
                    <tr key={`${country.country}-${country.year}`} className="rounded-2xl border border-[#E5E7E1] bg-white">
                      <td className="rounded-l-2xl border-y border-l border-[#E5E7E1] px-4 py-3">
                        <button onClick={() => setSelectedCountry(country.country)} className="font-medium text-[#161816] hover:text-[#2F6D4A]">
                          {country.country}
                        </button>
                      </td>
                      <td className="border-y border-[#E5E7E1] px-4 py-3">{country.year}</td>
                      <td className="border-y border-[#E5E7E1] px-4 py-3">{compactFormatter.format(country.co2)} Mt</td>
                      <td className="border-y border-[#E5E7E1] px-4 py-3">#{country.rank}</td>
                      <td className="rounded-r-2xl border-y border-r border-[#E5E7E1] px-4 py-3">
                        {country.change_from_previous_year === null ? '—' : `${country.change_from_previous_year >= 0 ? '+' : ''}${compactFormatter.format(country.change_from_previous_year)} Mt`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="card p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.04em]">{selectedCountry}</h2>
                  <p className="text-sm text-[#5B665F]">Historical emissions profile</p>
                </div>
                <div className="rounded-full border border-[#E5E7E1] bg-[#F8F9F4] px-3 py-1.5 text-xs font-medium text-[#2F6D4A]">
                  {countryDetail?.latest_year ?? '—'}
                </div>
              </div>
              <div className="mb-4 text-3xl font-semibold tracking-[-0.05em]">
                {countryDetail ? `${numberFormatter.format(Math.round(countryDetail.latest_value))} MtCO₂` : '—'}
              </div>
              <div className="chart-shell h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={countryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <defs>
                      <linearGradient id="countryFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2F6D4A" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#2F6D4A" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#EBEFEA" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: '#64706B', fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64706B', fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number | string | readonly (number | string)[] | undefined) => [`${numberFormatter.format(Number(Array.isArray(value) ? value[0] ?? 0 : value ?? 0))} MtCO₂`, 'CO₂']}
                      labelFormatter={(label) => `Year ${label}`}
                    />
                    <Area type="monotone" dataKey="co2" stroke="#2F6D4A" strokeWidth={2.5} fill="url(#countryFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5 sm:p-6">
              <h3 className="text-lg font-semibold">Country Metrics</h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-[#E5E7E1] bg-[#F8F9F4] p-3">
                  <span className="text-sm text-[#5B665F]">Historical trend</span>
                  <span className="font-medium">{countryDetail ? `${countryDetail.long_term_change >= 0 ? '+' : ''}${numberFormatter.format(Math.round(countryDetail.long_term_change))} Mt` : '—'}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[#E5E7E1] bg-[#F8F9F4] p-3">
                  <span className="text-sm text-[#5B665F]">Highest emission year</span>
                  <span className="font-medium">{countryDetail?.highest_recorded_year ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[#E5E7E1] bg-[#F8F9F4] p-3">
                  <span className="text-sm text-[#5B665F]">Lowest emission year</span>
                  <span className="font-medium">{countryDetail?.lowest_recorded_year ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[#E5E7E1] bg-[#F8F9F4] p-3">
                  <span className="text-sm text-[#5B665F]">Global share</span>
                  <span className="font-medium">{countryDetail?.global_share_percent !== null && countryDetail?.global_share_percent !== undefined ? `${countryDetail.global_share_percent.toFixed(1)}%` : '—'}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 card p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold tracking-[-0.04em]">About the Data</h2>
              <p className="text-sm text-[#5B665F]">Historical dataset • 1750–2017</p>
            </div>
            <div className="mt-4 space-y-4 text-sm leading-7 text-[#5B665F]">
              <p>
                Data source: Yoann Boyere’s CO₂ & GHG Emissions dataset on Kaggle, based on Our World in Data.
              </p>
              <div className="flex flex-wrap gap-3 text-[#2F6D4A] underline decoration-[#A7C2B0] underline-offset-4">
                <a href="https://www.kaggle.com/datasets/yoannboyere/co2-ghg-emissionsdata" target="_blank" rel="noreferrer">Kaggle dataset</a>
                <a href="https://ourworldindata.org/co2-and-greenhouse-gas-emissions" target="_blank" rel="noreferrer">Our World in Data</a>
                <a href="https://ourworldindata.org/co2-and-greenhouse-gas-emissions" target="_blank" rel="noreferrer">Original data sources</a>
              </div>
              <p>
                This dashboard displays historical emissions values only. It does not provide real-time CO₂ monitoring because the underlying dataset ends in 2017.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
