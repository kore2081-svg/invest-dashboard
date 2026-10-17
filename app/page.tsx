"use client";
import { useEffect, useState, useCallback, useRef } from "react";

function fmt(n: any, digits = 2): string {
  if (n === null || n === undefined || !isFinite(Number(n))) return "-";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function kst(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...opts,
  }).format(date);
}

function ddayText(d: number | null): string {
  if (d === null || d === undefined) return "-";
  if (d === 0) return "D-Day";
  if (d > 0) return `D-${d}`;
  return "종료";
}

function Sparkline({ data, w = 130, h = 38 }: { data: number[]; w?: number; h?: number }) {
  if (!data || data.length < 2) return <div className="spark" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data
    .map(
      (v, i) =>
        `${((i / (data.length - 1)) * w).toFixed(1)},${(
          h - 3 - ((v - min) / rng) * (h - 6)
        ).toFixed(1)}`
    )
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <div className="spark">
      <svg width={w} height={h}>
        <polyline
          points={pts}
          fill="none"
          stroke={up ? "#f04452" : "#3182f6"}
          strokeWidth="1.6"
        />
      </svg>
    </div>
  );
}

function CandleChart({ months }: { months: any[] }) {
  if (!months || months.length === 0) return <div className="loading">차트 데이터 없음</div>;
  const W = 960, H = 320, padL = 10, padR = 70, padT = 14, padB = 30;
  const lows = months.map((m) => m.low);
  const highs = months.map((m) => m.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const pad = (max - min) * 0.06;
  const lo = min - pad, hi = max + pad;
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const step = (W - padL - padR) / months.length;
  const cw = Math.max(3, step * 0.62);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {[0.25, 0.5, 0.75].map((f) => {
        const v = lo + (hi - lo) * f;
        return (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#1e2532" strokeWidth="1" />
            <text x={W - padR + 6} y={y(v) + 4} fill="#8a94a6" fontSize="11">
              {v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </text>
          </g>
        );
      })}
      {months.map((m, i) => {
        const x = padL + step * i + step / 2;
        const up = m.close >= m.open;
        const c = up ? "#f04452" : "#3182f6";
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(m.high)} y2={y(m.low)} stroke={c} strokeWidth="1.2" />
            <rect
              x={x - cw / 2}
              y={y(Math.max(m.open, m.close))}
              width={cw}
              height={Math.max(1.5, Math.abs(y(m.open) - y(m.close)))}
              fill={c}
            />
            {i % 6 === 0 && (
              <text x={x} y={H - 10} fill="#8a94a6" fontSize="11" textAnchor="middle">
                {m.date.slice(0, 4)}.{m.date.slice(4, 6)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Card({
  title,
  children,
  source,
}: {
  title: string;
  children: React.ReactNode;
  source?: string;
}) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {children}
      {source && <div className="meta">{source}</div>}
    </div>
  );
}

const QUOTE_CARDS = [
  { key: "us10y", title: "미국 10년물 국채 금리" },
  { key: "brent", title: "브렌트유" },
  { key: "dxy", title: "미국 달러 인덱스" },
  { key: "usdkrw", title: "원/달러 환율" },
];

const ASIA_CARDS = [
  { key: "nikkei", title: "닛케이 225 (도쿄)" },
  { key: "taiex", title: "대만 가권지수 (TAIEX)" },
];

function QuoteCard({ title, d, changeDigits = 3, pending = false }: { title: string; d: any; changeDigits?: number; pending?: boolean }) {
  if (!d) return <Card title={title}><div className="loading">{pending ? "불러오는 중" : "시세 조회 실패 · 새로고침해 주세요"}</div></Card>;
  const up = (d.change ?? d.changePct ?? 0) >= 0;
  return (
    <Card title={title} source={`${d.source} · ${d.asOf}`}>
      <div className="big">
        {fmt(d.value, 2)}
        <span className="unit">{d.unit}</span>
      </div>
      <div className={`chg ${up ? "up" : "down"}`}>
        {d.change !== null && d.change !== undefined ? `${d.change >= 0 ? "+" : ""}${fmt(d.change, changeDigits)}` : "-"}
        {d.changePct !== null && d.changePct !== undefined
          ? ` (${d.changePct >= 0 ? "+" : ""}${fmt(d.changePct)}%)`
          : ""}
      </div>
      <Sparkline data={d.history} />
    </Card>
  );
}

export default function Dashboard() {
  const [quotes, setQuotes] = useState<any>(null);
  const [kospi, setKospi] = useState<any>(null);
  const [indicators, setIndicators] = useState<any>(null);
  const [fed, setFed] = useState<any>(null);
  const [calendar, setCalendar] = useState<any>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [spinning, setSpinning] = useState(false);
  const [err, setErr] = useState<string>("");

  const quoteInFlight = useRef<Promise<void> | null>(null);

  const getJSON = useCallback(async (path: string) => {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }, []);

  const loadQuotes = useCallback((): Promise<void> => {
    // 느린 원천 응답 중 15초 타이머/수동 갱신이 겹쳐도 중복 요청하지 않음.
    if (quoteInFlight.current) return quoteInFlight.current;
    const request = (async () => {
      try {
        const q = await getJSON(`/api/quotes?_t=${Date.now()}`);
        setQuotes(q);
        const missing = ["us10y", "brent", "dxy", "usdkrw", "btc"].filter(key => !q[key]);
        setErr(missing.length ? "일부 시장지표 조회 실패 · 마지막 조회 시각과 각 지표의 기준 시각을 확인하세요." : "");
      } catch {
        setQuotes((previous: any) => previous ?? {});
        setErr("시장지표 갱신 실패 · 표시 중인 값은 이전 조회값입니다. 새로고침해 주세요.");
      }
    })();
    quoteInFlight.current = request;
    void request.finally(() => { quoteInFlight.current = null; });
    return request;
  }, [getJSON]);

  const loadKospi = useCallback(async () => {
    try { setKospi(await getJSON("/api/kospi")); } catch { /* 이전 값 유지 */ }
  }, [getJSON]);

  const loadFast = useCallback(async () => {
    await Promise.all([loadQuotes(), loadKospi()]);
  }, [loadQuotes, loadKospi]);

  const loadSlow = useCallback(async () => {
    try {
      const [i, f] = await Promise.all([getJSON("/api/indicators"), getJSON("/api/fed")]);
      setIndicators(i);
      setFed(f);
    } catch {
      /* 유지 */
    }
  }, [getJSON]);

  const refreshAll = useCallback(async () => {
    setSpinning(true);
    setErr("");
    await Promise.all([
      loadFast(),
      loadSlow(),
      getJSON("/api/calendar").then(setCalendar).catch(() => {}),
    ]);
    setSpinning(false);
  }, [loadFast, loadSlow, getJSON]);

  useEffect(() => {
    refreshAll();
    let lastFast = Date.now();
    let lastSlow = Date.now();
    let lastKospi = Date.now();
    const runFast = () => {
      lastFast = Date.now();
      loadQuotes();
    };
    const runSlow = () => {
      lastSlow = Date.now();
      loadSlow();
    };
    const clock = setInterval(() => setNow(new Date()), 1000);
    // 탭이 안 보이면(백그라운드·최소화) API를 부르지 않음 → Vercel 사용량 절약
    const fast = setInterval(() => {
      if (!document.hidden && Date.now() - lastFast >= 14_000) runFast();
    }, 15_000);
    const kospiTimer = setInterval(() => {
      if (!document.hidden) { lastKospi = Date.now(); loadKospi(); }
    }, 60_000);
    const slow = setInterval(() => {
      if (!document.hidden && Date.now() - lastSlow >= 590_000) runSlow();
    }, 600_000);
    // 탭으로 돌아오면 오래된 데이터만 즉시 갱신
    const onVisible = () => {
      if (document.hidden) return;
      const t = Date.now();
      if (t - lastFast >= 15_000) runFast();
      if (t - lastKospi >= 60_000) { lastKospi = t; loadKospi(); }
      if (t - lastSlow >= 600_000) runSlow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(clock);
      clearInterval(fast);
      clearInterval(slow);
      clearInterval(kospiTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wrap">
      <div className="header">
        <div>
          <h1>투자 대시보드</h1>
          <div className="sub">시장 지표·아시아 지수 15초 자동갱신 · 코스피 60초 갱신 · 경제지표/연준발언 10분 자동갱신 · 탭이 안 보이면 일시정지</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button className="btn" onClick={refreshAll} disabled={spinning}>
            {spinning ? "갱신 중…" : "전체 새로고침"}
          </button>
          <div className="clock">
            <div className="time">
              {kst(now, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </div>
            <div className="date">
              {kst(now, { year: "numeric", month: "long", day: "numeric", weekday: "short" })} (KST)
            </div>
          </div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="section-title">시장 지표</div>
      <div className="note" style={{ marginBottom: 12 }}>
        마지막 API 조회: {quotes?.updatedAt ? kst(new Date(quotes.updatedAt), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " (KST)" : "-"}
        {" · 새로고침 시 캐시 없이 재조회 · 무료 시세는 지연 가능 · 휴장 중에는 마지막 거래값"}
      </div>
      <div className="grid5">
        {QUOTE_CARDS.map((c) => (
          <QuoteCard key={c.key} title={c.title} d={quotes?.[c.key]} pending={!quotes} />
        ))}
        {(() => {
          const d = quotes?.btc;
          if (!d) return <Card title="비트코인 (BTC)"><div className="loading">{quotes ? "시세 조회 실패 · 새로고침해 주세요" : "불러오는 중"}</div></Card>;
          const up = (d.changePct ?? 0) >= 0;
          return (
            <Card title="비트코인 (BTC)" source={`${d.source} · 조회 ${d.fetchedAt ? kst(new Date(d.fetchedAt), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " (KST)" : "-"}`}>
              <div className="big">
                ${fmt(d.price, 0)}
              </div>
              <div className={`chg ${up ? "up" : "down"}`}>
                24h {d.changePct >= 0 ? "+" : ""}{fmt(d.changePct)}%
              </div>
              <div className="meta">H ${fmt(d.high, 0)} · L ${fmt(d.low, 0)}</div>
            </Card>
          );
        })()}
      </div>

      <div className="section-title">아시아 증시 · 메모리 가격</div>
      <div className="grid3">
        {ASIA_CARDS.map((c) => (
          <QuoteCard key={c.key} title={c.title} d={quotes?.[c.key]} pending={!quotes} changeDigits={2} />
        ))}
        <Card title="PC용 D램 DDR4 평균가격" source="DRAMeXchange (TrendForce) · 현물/고정거래가격">
          <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>
            DDR4 시세는 DRAMeXchange 공개 페이지에서 확인할 수 있습니다 (공식 API 미제공).
          </div>
          <a
            className="btn"
            href="https://www.dramexchange.com/"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            DRAMeXchange에서 DDR4 가격 보기 ↗
          </a>
        </Card>
      </div>

      <div className="section-title">코스피 월봉</div>
      <div className="card">
        {kospi ? (
          <>
            <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 8 }}>
              <span className="big" style={{ fontSize: 22, fontWeight: 800 }}>
                {fmt(kospi.lastClose, 2)}
              </span>
              <span className={`chg ${(kospi.momPct ?? 0) >= 0 ? "up" : "down"}`} style={{ fontWeight: 700 }}>
                전월비 {kospi.momPct >= 0 ? "+" : ""}{fmt(kospi.momPct)}%
              </span>
              <span className="meta">{kospi.source} · 기준 {kospi.asOf}</span>
            </div>
            <CandleChart months={kospi.months} />
          </>
        ) : (
          <div className="loading">불러오는 중</div>
        )}
      </div>

      <div className="section-title">미국 주요 경제지표 (최신 발표치)</div>
      <div className="card">
        {indicators ? (
          <>
            <table className="tbl">
              <thead>
                <tr><th>지표</th><th>발표치</th><th>전월/전년비</th><th>발표 기준월</th></tr>
              </thead>
              <tbody>
                {indicators.items.map((it: any) => (
                  <tr key={it.key}>
                    <td>{it.label}</td>
                    <td>
                      {it.error ? <span className="err">조회 실패</span> : <><b>{fmt(it.value, 1)}</b> <span className="meta">{it.unit}</span></>}
                    </td>
                    <td className={(it.change ?? 0) >= 0 ? "up" : "down"}>
                      {it.error ? "-" : `${it.changeLabel} ${it.change >= 0 ? "+" : ""}${fmt(it.change, 1)}`}
                    </td>
                    <td className="meta">{it.date || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="note">{indicators.source} · 6시간 캐시</div>
          </>
        ) : (
          <div className="loading">불러오는 중</div>
        )}
      </div>

      <div className="section-title">연준 위원 최근 발언</div>
      <div className="card">
        {fed ? (
          fed.items.length === 0 ? (
            <div className="loading">최근 4일 내 발언 없음</div>
          ) : (
            <ul className="clean">
              {fed.items.map((it: any, i: number) => (
                <li key={i}>
                  <a href={it.link} target="_blank" rel="noreferrer">{it.title}</a>
                  <span className="src">{it.source}</span>
                  <span className="dt">{kst(new Date(it.pubDate), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="loading">불러오는 중</div>
        )}
        <div className="note">Google News RSS · 최근 4일 · 30분 캐시</div>
      </div>

      <div className="section-title">중앙은행 금리 일정</div>
      <div className="grid3">
        {calendar ? calendar.centralBanks.map((b: any) => (
          <Card key={b.name} title={b.name}>
            <div className="kv"><span className="k">다음 회의</span><span><b>{b.next || "-"}</b><span className="badge">{ddayText(b.nextDday)}</span></span></div>
            <div className="kv"><span className="k">직전 회의</span><span>{b.last || "-"}</span></div>
            <div className="note">{b.note}</div>
          </Card>
        )) : <div className="loading">불러오는 중</div>}
      </div>

      <div className="section-title">옵션 만기일</div>
      <div className="grid2">
        {calendar ? calendar.options.map((o: any) => (
          <Card key={o.market} title={`${o.market} (${o.rule})`}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{o.date}</span>
              <span className="dday">{ddayText(o.dday)}</span>
              {o.witching && <span className="badge hot">{o.label}</span>}
              {!o.witching && <span className="badge">{o.label}</span>}
            </div>
          </Card>
        )) : <div className="loading">불러오는 중</div>}
      </div>

      <div className="section-title">반도체 실적 발표 일정</div>
      <div className="card">
        {calendar ? (
          <table className="tbl">
            <thead><tr><th>기업</th><th>구분</th><th>예상일</th><th>D-day</th><th>비고</th></tr></thead>
            <tbody>
              {calendar.earnings.map((e: any, i: number) => (
                <tr key={i}>
                  <td><b>{e.company}</b></td>
                  <td>{e.kind}</td>
                  <td>{e.expected}</td>
                  <td><span className="badge" style={e.dday === 0 ? { background: "#3a1620", color: "#ff7a8a" } : {}}>{ddayText(e.dday)}</span></td>
                  <td className="meta">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="loading">불러오는 중</div>
        )}
        <div className="note">실적일은 통상 패턴 기반 예상치입니다. 확정 공시는 각 사 IR을 확인하세요.</div>
      </div>

      <div className="note" style={{ marginTop: 30 }}>
        데이터 제공: FRED · Yahoo Finance · Coinbase · 네이버 금융(KRX 원천·해외지수) · Google News (보조: Stooq · CoinGecko) ·
        금리/옵션/실적 일정은 2026년 공개 일정 기반. 투자 판단의 참고용이며 실시간 체결가와 다를 수 있습니다.
      </div>
    </div>
  );
}
