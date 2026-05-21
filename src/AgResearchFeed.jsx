import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

const CROPS = ["All", "Cotton", "Corn", "Sorghum"];
const TOPICS = [
  { id: "chemicals", label: "New Chemicals" },
  { id: "pest",      label: "Pest & Disease" },
  { id: "agronomy",  label: "Agronomy & Tactics" },
  { id: "variety",   label: "Variety Research" },
  { id: "irrigation",label: "Water & Irrigation" },
];

const DAILY_ROTATION = [
  { crop: "Cotton",  topic: "pest",       label: "Cotton Pest & Disease" },
  { crop: "Corn",    topic: "chemicals",  label: "Corn New Chemicals" },
  { crop: "Sorghum", topic: "agronomy",   label: "Sorghum Agronomy & Tactics" },
  { crop: "Cotton",  topic: "variety",    label: "Cotton Variety Research" },
  { crop: "Corn",    topic: "pest",       label: "Corn Pest & Disease" },
  { crop: "Sorghum", topic: "chemicals",  label: "Sorghum New Chemicals" },
  { crop: "All",     topic: "irrigation", label: "Water & Irrigation" },
];

function getTodayRotation() { return DAILY_ROTATION[new Date().getDay()]; }
function getDayName() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function getCacheKey(crop, topic) {
  return `agfeed_${crop}_${topic}_${new Date().toISOString().slice(0, 10)}`;
}

function ArticleCard({ article, index, isDaily }) {
  const [expanded, setExpanded] = useState(false);
  const cropBorder = { Cotton:"#2980b9", Corn:"#f39c12", Sorghum:"#e67e22", General:"#27ae60" };
  const cropBg     = { Cotton:"#e8f4f8", Corn:"#fef9e7", Sorghum:"#fdf2e9", General:"#f0f4f0" };
  const color = cropBorder[article.crop] || cropBorder.General;
  const bg    = cropBg[article.crop]    || cropBg.General;

  return (
    <div style={{
      background: bg, border:`1px solid ${isDaily ? color : "#ddd"}`,
      borderLeft:`4px solid ${color}`, borderRadius:6, padding:"14px 16px", marginBottom:12,
    }}>
      <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
        {isDaily && (
          <span style={{ background:"#1c2b1e", color:"#c8e6c9", fontSize:9, fontWeight:800,
            padding:"2px 7px", borderRadius:10, letterSpacing:"0.1em", textTransform:"uppercase" }}>
            📅 Today
          </span>
        )}
        {article.crop && (
          <span style={{ background:color, color:"#fff", fontSize:10, fontWeight:700,
            padding:"2px 7px", borderRadius:10, textTransform:"uppercase" }}>{article.crop}</span>
        )}
        {article.topic && (
          <span style={{ background:"#555", color:"#fff", fontSize:10, fontWeight:600,
            padding:"2px 7px", borderRadius:10, textTransform:"uppercase" }}>{article.topic}</span>
        )}
        {article.year && (
          <span style={{ background:"#eee", color:"#555", fontSize:10, padding:"2px 7px", borderRadius:10 }}>
            {article.year}
          </span>
        )}
      </div>
      <div style={{ fontWeight:700, fontSize:14, color:"#1a1a1a", lineHeight:1.4, marginBottom:4 }}>
        {article.title}
      </div>
      {article.source && (
        <div style={{ fontSize:11, color:"#777", marginBottom:6 }}>{article.source}</div>
      )}
      <div style={{ fontSize:13, color:"#333", lineHeight:1.6 }}>
        {expanded ? article.summary : article.summary?.slice(0, 200) + (article.summary?.length > 200 ? "…" : "")}
      </div>
      <div style={{ display:"flex", gap:10, marginTop:8, alignItems:"center" }}>
        {article.summary?.length > 200 && (
          <button onClick={() => setExpanded(!expanded)} style={{
            background:"none", border:"none", color, fontSize:12, cursor:"pointer", fontWeight:600, padding:0
          }}>{expanded ? "Show less ▲" : "Read more ▼"}</button>
        )}
        {article.url && (
          <a href={article.url} target="_blank" rel="noopener noreferrer" style={{
            fontSize:12, color, textDecoration:"none", fontWeight:600,
            border:`1px solid ${color}`, padding:"2px 10px", borderRadius:4
          }}>View Source →</a>
        )}
      </div>
    </div>
  );
}

export default function AgResearchFeed() {
  const today = getTodayRotation();
  const [selectedCrop,  setSelectedCrop]  = useState(today.crop);
  const [selectedTopic, setSelectedTopic] = useState(today.topic);
  const [articles,      setArticles]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [lastSearched,  setLastSearched]  = useState(null);
  const [isDailyLoad,   setIsDailyLoad]   = useState(false);
  const hasMounted = useRef(false);

  const fetchResearch = useCallback(async (crop, topicId, isAuto = false) => {
    const cacheKey = getCacheKey(crop, topicId);
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { articles: ca, topicLabel } = JSON.parse(cached);
        setArticles(ca);
        setLastSearched({ crop, topic: topicLabel });
        setIsDailyLoad(isAuto);
        return;
      }
    } catch (_) {}

    setLoading(true);
    setError(null);
    setArticles([]);
    setIsDailyLoad(isAuto);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ai-assistant", {
        body: { action: "research", crop, topicId },
      });
      if (fnErr) throw fnErr;
      const parsed = JSON.parse(data.result);
      if (!Array.isArray(parsed)) {
        throw new Error(parsed?.error || "Unexpected response from server");
      }
      const topicLabel = TOPICS.find(t => t.id === topicId)?.label || topicId;
      setArticles(parsed);
      setLastSearched({ crop, topic: topicLabel });
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ articles: parsed, topicLabel }));
      } catch (_) {}
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      fetchResearch(today.crop, today.topic, true);
    }
  }, []);

  return (
    <div style={{ fontFamily:"system-ui,'Segoe UI',sans-serif" }}>
      <style>{`
        @keyframes agfadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes agspin   { to{transform:rotate(360deg)} }
      `}</style>

      {/* Header */}
      <div style={{ background:"#1c2b1e", padding:"14px 16px 12px", borderRadius:"8px 8px 0 0", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>🌾</span>
          <div>
            <div style={{ color:"#e8f0e9", fontWeight:700, fontSize:15, letterSpacing:"0.02em" }}>
              Ag Research Feed
            </div>
            <div style={{ color:"#7da888", fontSize:11 }}>
              {getDayName()} · Today: {today.label}
            </div>
          </div>
        </div>
      </div>

      {/* Crop selector */}
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"#666", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Crop</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {CROPS.map(crop => {
            const active = selectedCrop === crop;
            const colors = { Cotton:"#2980b9", Corn:"#e67e22", Sorghum:"#c0392b", All:"#4a7c59" };
            const c = colors[crop];
            return (
              <button key={crop} onClick={() => setSelectedCrop(crop)} style={{
                padding:"5px 12px", borderRadius:20, border:`2px solid ${active ? c : "#ccc"}`,
                background: active ? c : "#fff", color: active ? "#fff" : "#555",
                fontWeight: active ? 700 : 500, fontSize:13, cursor:"pointer",
              }}>{crop}</button>
            );
          })}
        </div>
      </div>

      {/* Topic selector */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:10, fontWeight:700, color:"#666", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Topic</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {TOPICS.map(t => {
            const active = selectedTopic === t.id;
            return (
              <button key={t.id} onClick={() => setSelectedTopic(t.id)} style={{
                padding:"4px 11px", borderRadius:14, border:`1px solid ${active ? "#1c2b1e" : "#ccc"}`,
                background: active ? "#1c2b1e" : "#fff", color: active ? "#e8f0e9" : "#555",
                fontWeight: active ? 700 : 400, fontSize:12, cursor:"pointer",
              }}>{t.label}</button>
            );
          })}
        </div>
      </div>

      {/* Search button */}
      <button onClick={() => fetchResearch(selectedCrop, selectedTopic, false)} disabled={loading} style={{
        width:"100%", padding:"11px",
        background: loading ? "#999" : "#4a7c59",
        color:"#fff", border:"none", borderRadius:7,
        fontWeight:700, fontSize:14, cursor: loading ? "not-allowed" : "pointer",
        display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:14,
      }}>
        {loading ? (
          <>
            <span style={{ display:"inline-block", width:14, height:14,
              border:"2px solid rgba(255,255,255,0.4)", borderTopColor:"#fff",
              borderRadius:"50%", animation:"agspin 0.7s linear infinite" }}/>
            {isDailyLoad ? "Loading today's reading…" : "Searching…"}
          </>
        ) : <>🔍 Search for Articles</>}
      </button>

      {/* Results */}
      {error && (
        <div style={{ background:"#fdecea", border:"1px solid #e74c3c", borderRadius:6,
          padding:"10px 12px", color:"#c0392b", fontSize:13, marginBottom:12 }}>
          ⚠ {error}
        </div>
      )}
      {lastSearched && !loading && articles.length > 0 && (
        <div style={{ fontSize:12, color:"#888", marginBottom:10 }}>
          {isDailyLoad ? "📅 Today's reading — " : `${articles.length} results — `}
          {lastSearched.crop} · {lastSearched.topic}
        </div>
      )}
      {Array.isArray(articles) && articles.map((article, i) => (
        <ArticleCard key={i} article={article} index={i} isDaily={isDailyLoad} />
      ))}
      {loading && (
        <div style={{ textAlign:"center", color:"#999", padding:"30px 0", fontSize:13 }}>
          Pulling from AgriLife, USDA, and extension databases…
        </div>
      )}
      {!loading && articles.length === 0 && !error && (
        <div style={{ textAlign:"center", color:"#999", padding:"40px 0", fontSize:14, lineHeight:1.8 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📚</div>
          Select a crop and topic,<br/>then tap Search to pull live research.
        </div>
      )}
    </div>
  );
}
