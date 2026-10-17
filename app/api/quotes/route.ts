import { NextResponse } from "next/server";
import {
  fetchText,
  fetchJson,
  parseStooqQuote,
  fredSeries,
} from "@/app/lib/sources";

export const dynamic = "force-dynamic";

async function stooqQuotes(): Promise<Record<string, any>> {
  try {
    const t = await fetchText(
      "https://stooq.com/q/l/?s=10usy.b,dx.f,usdkrw&f=sd2t2ohlcv&h&e=csv"
    );
    return parseStooqQuote(t);
  } catch {
    return {};
  }
}

async function fredRows(id: string): Promise<{ date: string; value: number }[]> {
  try {
    return await fredSeries(id, 60);
  } catch {
    return [];
  }
}

// 비트코인: Coinbase(미국 서버에서도 접속 가능) → CoinGecko 백업
async function btcQuote(): Promise<any> {
  try {
    const j = await fetchJson("https://api.exchange.coinbase.com/products/BTC-USD/stats");
    const last = parseFloat(j.last);
    const open = parseFloat(j.open);
    if (!isFinite(last)) throw new Error("no price");
    return {
      price: last,
      changePct: open ? +(((last - open) / open) * 100).toFixed(2) : null,
      high: parseFloat(j.high),
      low: parseFloat(j.low),
      source: "Coinbase (실시간)",
    };
  } catch {}
  try {
    const j = await fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"
    );
    return {
      price: j.bitcoin.usd,
      changePct: +Number(j.bitcoin.usd_24h_change).toFixed(2),
      high: null,
      low: null,
      source: "CoinGecko",
    };
  } catch {}
  return null;
}

// 원/달러: Yahoo Finance(시장 환율) → 네이버(하나은행 고시) → FRED DEXKOUS(전일)
async function usdKrw(): Promise<any> {
  try {
    const j = await fetchJson(
      "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=2mo&interval=1d"
    );
    const r = j.chart.result[0];
    const m = r.meta;
    const closes: number[] = (r.indicators.quote[0].close || []).filter(
      (v: any) => typeof v === "number" && isFinite(v)
    );
    const value = Number(m.regularMarketPrice);
    if (!isFinite(value)) throw new Error("no price");
    const prev = closes.length >= 2 ? closes[closes.length - 2] : null;
    return {
      value: +value.toFixed(2),
      change: prev ? +(value - prev).toFixed(2) : null,
      changePct: prev ? +(((value - prev) / prev) * 100).toFixed(2) : null,
      history: closes.slice(-30),
      asOf: new Date(m.regularMarketTime * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      source: "Yahoo Finance (시장 환율)",
      unit: "원",
    };
  } catch {}
  try {
    const j = await fetchJson("https://api.stock.naver.com/marketindex/exchange/FX_USDKRW");
    const e = j.exchangeInfo;
    const num = (s: any) => parseFloat(String(s).replace(/,/g, ""));
    const value = num(e.closePrice);
    if (!isFinite(value)) throw new Error("no price");
    return {
      value,
      change: num(e.fluctuations),
      changePct: num(e.fluctuationsRatio),
      history: [],
      asOf: e.localTradedAt,
      source: "네이버 (하나은행 고시)",
      unit: "원",
    };
  } catch {}
  try {
    const rows = await fredSeries("DEXKOUS", 60);
    const last = rows[rows.length - 1];
    if (!last) throw new Error("no data");
    return {
      value: last.value,
      change: null,
      changePct: null,
      history: rows.slice(-30).map((r) => r.value),
      asOf: last.date,
      source: "FRED DEXKOUS (전일)",
      unit: "원",
    };
  } catch {}
  return null;
}

// 아시아 지수: Yahoo Finance(지연 시세 + 30일 히스토리) → 네이버 해외지수(15~20분 지연) 백업
async function asiaIndex(yahooSym: string, naverSym: string): Promise<any> {
  try {
    const j = await fetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=2mo&interval=1d`
    );
    const r = j.chart.result[0];
    const m = r.meta;
    const value = Number(m.regularMarketPrice);
    if (!isFinite(value)) throw new Error("no price");
    const ts: number[] = r.timestamp || [];
    const raw: any[] = r.indicators.quote[0].close || [];
    const tz = m.exchangeTimezoneName || "UTC";
    const day = (sec: number) =>
      new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: tz });
    const today = day(m.regularMarketTime);
    const pts = ts
      .map((t, i) => ({ d: day(t), c: raw[i] }))
      .filter((x) => typeof x.c === "number" && isFinite(x.c));
    // 전일 종가 = 현재 거래일 이전의 마지막 종가
    const prevPts = pts.filter((x) => x.d < today);
    const prev = prevPts.length ? prevPts[prevPts.length - 1].c : null;
    const hist = [...prevPts.map((x) => x.c), value];
    return {
      value: +value.toFixed(2),
      change: prev ? +(value - prev).toFixed(2) : null,
      changePct: prev ? +(((value - prev) / prev) * 100).toFixed(2) : null,
      history: hist.slice(-30),
      asOf: new Date(m.regularMarketTime * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      source: "Yahoo Finance (지연 시세)",
      unit: "pt",
    };
  } catch {}
  try {
    const j = await fetchJson(`https://api.stock.naver.com/index/${naverSym}/basic`);
    const num = (s: any) => parseFloat(String(s).replace(/,/g, ""));
    const value = num(j.closePriceRaw ?? j.closePrice);
    if (!isFinite(value)) throw new Error("no price");
    return {
      value,
      change: num(j.compareToPreviousClosePriceRaw ?? j.compareToPreviousClosePrice),
      changePct: num(j.fluctuationsRatioRaw ?? j.fluctuationsRatio),
      history: [],
      asOf: new Date(j.localTradedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      source: `네이버 (${j.delayTimeName || "지연"})`,
      unit: "pt",
    };
  } catch {}
  return null;
}

// 장중 시세 우선. 무료 제공 데이터는 지연될 수 있어 기준 시각을 함께 표시합니다.
async function marketQuote(symbol: string, unit: string, label: string): Promise<any> {
  try {
    const j = await fetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2mo&interval=1d`
    );
    const r = j.chart?.result?.[0];
    const m = r?.meta;
    if (typeof m?.regularMarketPrice !== "number" || !isFinite(m.regularMarketPrice) ||
        typeof m.regularMarketTime !== "number" || !isFinite(m.regularMarketTime)) throw new Error("no quote");
    const value = m.regularMarketPrice;
    const tz = m.exchangeTimezoneName || "UTC";
    const day = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-CA", { timeZone: tz });
    const today = day(m.regularMarketTime);
    const raw = r.indicators?.quote?.[0]?.close || [];
    const prior: number[] = (r.timestamp || []).flatMap((t: number, i: number) =>
      day(t) < today && typeof raw[i] === "number" && isFinite(raw[i]) ? [raw[i]] : []
    );
    const prev = Number(m.chartPreviousClose ?? m.previousClose);
    const previous = prior.length ? prior[prior.length - 1] : (isFinite(prev) && prev > 0 ? prev : null);
    return {
      value: +value.toFixed(3),
      change: previous ? +(value - previous).toFixed(3) : null,
      changePct: previous ? +(((value - previous) / previous) * 100).toFixed(2) : null,
      history: [...prior, value].slice(-30),
      asOf: new Date(m.regularMarketTime * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      source: `Yahoo Finance (${label} · 지연 가능)`,
      unit,
    };
  } catch { return null; }
}

export async function GET() {
  // 시장지표는 인메모리/브라우저/CDN 캐시를 사용하지 않고 매 요청마다 원천 API 재조회.
  const [live10, liveBrent, liveDxy, btc, krw, nikkei, taiex] = await Promise.all([
    marketQuote("^TNX", "%", "10년물 금리"),
    marketQuote("BZ=F", "$", "브렌트유 선물"),
    marketQuote("DX-Y.NYB", "pt", "DXY"),
    btcQuote(), usdKrw(),
    asiaIndex("^N225", ".N225"), asiaIndex("^TWII", ".TWII"),
  ]);

  // 일별 자료는 장중 조회 실패 시에만 사용하고, 다른 지표를 DXY로 대체하지 않습니다.
  const [q, brentRows, dgs10Rows] = await Promise.all([
    (!live10 || !liveDxy || !krw) ? stooqQuotes() : Promise.resolve({} as Record<string, any>),
    !liveBrent ? fredRows("DCOILBRENTEU") : Promise.resolve([]),
    !live10 ? fredRows("DGS10") : Promise.resolve([]),
  ]);
  const stooq = (quote: any, unit: string) => quote ? {
    value: quote.close,
    change: isFinite(quote.open) ? +(quote.close - quote.open).toFixed(3) : null,
    changePct: quote.open ? +(((quote.close - quote.open) / quote.open) * 100).toFixed(2) : null,
    history: [], asOf: `${quote.date} ${quote.time}`,
    source: "Stooq (지연 가능 · 원천 시각)", unit,
  } : null;
  const daily = (rows: { date: string; value: number }[], unit: string, source: string) => {
    const last = rows[rows.length - 1];
    return last ? { value: last.value, change: null, changePct: null,
      history: rows.slice(-30).map(r => r.value), asOf: last.date, source, unit } : null;
  };
  const data = {
    us10y: live10 || stooq(q["10usy.b"], "%") || daily(dgs10Rows, "%", "FRED DGS10 (일별 종가 · 장중 조회 실패)"),
    brent: liveBrent || daily(brentRows, "$", "FRED 브렌트 현물 (일별 종가 · 선물 조회 실패)"),
    dxy: liveDxy || stooq(q["dx.f"], "pt"),
    usdkrw: krw || stooq(q["usdkrw"], "원"),
    btc: btc ? { ...btc, unit: "$", fetchedAt: new Date().toISOString() } : null,
    nikkei, taiex, updatedAt: new Date().toISOString(),
  };
  return NextResponse.json(data, { headers: {
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store",
  } });
}
