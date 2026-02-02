import { useState } from "react";
import "./index.css";

const TABS = ["Summary", "Next Steps", "Compare", "Masked Text", "Original PDF"];
const MASK_PATTERN = /\[MASKED\]/gi;

/* ── Shared components ──────────────────────────────────────────────────── */

// Helper to extract JSON from LLM response (handles markdown code blocks, etc.)
function extractJSON(text) {
  if (!text) return null;
  
  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {}
  }
  
  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }
  
  // Try parsing the whole text
  try {
    return JSON.parse(text);
  } catch {}
  
  return null;
}

function MaskedTextView({ text }) {
  const [highlightAll, setHighlightAll] = useState(false);
  const parts = text.split(MASK_PATTERN);
  const matchCount = (text.match(MASK_PATTERN) || []).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#FF3621]">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {matchCount} redacted
          </span>
          <span className="text-xs text-[#6E6E7A]">20 PII types masked by ai_mask()</span>
        </div>
        <button
          onClick={() => setHighlightAll((v) => !v)}
          className={`text-xs px-3 py-1 rounded-md transition-all border ${
            highlightAll
              ? "bg-[#FF3621]/10 border-[#FF3621]/40 text-[#FF3621]"
              : "border-[#2E2E33] text-[#9B9BA7] hover:text-[#E4E4E8] hover:border-[#6E6E7A]"
          }`}
        >
          {highlightAll ? "Hide highlights" : "Highlight all"}
        </button>
      </div>

      <div className="bg-[#1B1B1F] border border-[#2E2E33] rounded-xl p-5 overflow-auto max-h-[500px]">
        <p className="text-sm text-[#E4E4E8] whitespace-pre-wrap leading-relaxed">
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && <MaskedChip highlight={highlightAll} />}
            </span>
          ))}
        </p>
      </div>

      <div className="flex items-center gap-4 px-1">
        <span className="text-xs text-[#6E6E7A]">Legend:</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#9B9BA7]">
          <span className="inline-block w-3 h-3 rounded bg-[#FF3621]/20 border border-[#FF3621]/40" />
          Redacted PII
        </span>
      </div>
    </div>
  );
}

function MaskedChip({ highlight }) {
  const [clicked, setClicked] = useState(false);
  const isActive = highlight || clicked;

  return (
    <button
      onClick={() => setClicked((v) => !v)}
      className={`inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 rounded text-xs font-mono font-medium transition-all cursor-pointer align-baseline ${
        isActive
          ? "bg-[#FF3621]/20 text-[#FF3621] border border-[#FF3621]/40 shadow-[0_0_8px_rgba(255,54,33,0.15)]"
          : "bg-[#2E2E33] text-[#9B9BA7] border border-[#2E2E33] hover:border-[#FF3621]/30 hover:text-[#FF3621]/80"
      }`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
      </svg>
      MASKED
    </button>
  );
}

function CompareView({ original, masked }) {
  const [syncScroll, setSyncScroll] = useState(true);

  function handleScroll(e, target) {
    if (!syncScroll) return;
    const el = document.getElementById(target);
    if (el) {
      el.scrollTop = e.currentTarget.scrollTop;
    }
  }

  const maskedParts = masked.split(MASK_PATTERN);
  const matchCount = (masked.match(MASK_PATTERN) || []).length;

  // Build original with highlights at the positions where masking occurred
  function renderOriginalHighlighted() {
    // Find what was replaced: split masked text to get surrounding context,
    // then locate those positions in the original
    const chunks = [];
    let origRemaining = original;
    let maskedRemaining = masked;

    for (let i = 0; i < maskedParts.length; i++) {
      const segment = maskedParts[i];
      // Find this segment in the original to stay in sync
      const idx = origRemaining.indexOf(segment);
      if (idx === -1) {
        // fallback: just push remaining
        chunks.push({ type: "text", value: origRemaining });
        origRemaining = "";
        break;
      }
      if (idx > 0) {
        // The text before this segment is the PII that was masked
        chunks.push({ type: "pii", value: origRemaining.slice(0, idx) });
      }
      chunks.push({ type: "text", value: segment });
      origRemaining = origRemaining.slice(idx + segment.length);
    }
    if (origRemaining) {
      chunks.push({ type: "pii", value: origRemaining });
    }

    return chunks.map((chunk, i) =>
      chunk.type === "pii" ? (
        <mark
          key={i}
          className="bg-amber-500/20 text-amber-300 border-b border-amber-500/40 rounded-sm px-0.5"
          title="This PII was redacted in the masked version"
        >
          {chunk.value}
        </mark>
      ) : (
        <span key={i}>{chunk.value}</span>
      )
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="flex items-center justify-between bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Side-by-side comparison
          </span>
          <span className="text-xs text-[#6E6E7A]">{matchCount} sensitive items redacted</span>
        </div>
        <button
          onClick={() => setSyncScroll((v) => !v)}
          className={`text-xs px-3 py-1 rounded-md transition-all border ${
            syncScroll
              ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
              : "border-[#2E2E33] text-[#9B9BA7] hover:text-[#E4E4E8]"
          }`}
        >
          {syncScroll ? "Sync scroll on" : "Sync scroll off"}
        </button>
      </div>

      {/* Side by side panels */}
      <div className="grid grid-cols-2 gap-3">
        {/* Original */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs font-medium text-[#9B9BA7] uppercase tracking-wider">
              Original
            </span>
            <span className="text-xs text-[#6E6E7A]">(PII highlighted)</span>
          </div>
          <div
            id="panel-original"
            onScroll={(e) => handleScroll(e, "panel-masked")}
            className="bg-[#1B1B1F] border border-[#2E2E33] rounded-xl p-4 overflow-auto max-h-[500px]"
          >
            <p className="text-sm text-[#E4E4E8] whitespace-pre-wrap leading-relaxed">
              {renderOriginalHighlighted()}
            </p>
          </div>
        </div>

        {/* Masked */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="inline-block w-2 h-2 rounded-full bg-[#FF3621]" />
            <span className="text-xs font-medium text-[#9B9BA7] uppercase tracking-wider">
              Masked
            </span>
            <span className="text-xs text-[#6E6E7A]">(PII redacted)</span>
          </div>
          <div
            id="panel-masked"
            onScroll={(e) => handleScroll(e, "panel-original")}
            className="bg-[#1B1B1F] border border-[#2E2E33] rounded-xl p-4 overflow-auto max-h-[500px]"
          >
            <p className="text-sm text-[#E4E4E8] whitespace-pre-wrap leading-relaxed">
              {maskedParts.map((part, i) => (
                <span key={i}>
                  {part}
                  {i < maskedParts.length - 1 && (
                    <span className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 rounded text-xs font-mono font-medium bg-[#FF3621]/20 text-[#FF3621] border border-[#FF3621]/40">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                      MASKED
                    </span>
                  )}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 px-1">
        <span className="text-xs text-[#6E6E7A]">Legend:</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#9B9BA7]">
          <span className="inline-block w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40" />
          Original PII (highlighted)
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#9B9BA7]">
          <span className="inline-block w-3 h-3 rounded bg-[#FF3621]/20 border border-[#FF3621]/40" />
          Redacted
        </span>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon }) {
  return (
    <div className="bg-[#1B1B1F] border border-[#2E2E33] rounded-xl p-5 hover:border-[#FF3621]/30 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-xs font-semibold text-[#9B9BA7] uppercase tracking-wider">
          {label}
        </p>
      </div>
      <div className="text-base text-[#E4E4E8] leading-relaxed">
        {Array.isArray(value) ? (
          <ul className="space-y-1.5">
            {value.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#FF3621] mt-1.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          value || <span className="text-[#6E6E7A] italic">Not available</span>
        )}
      </div>
    </div>
  );
}

function SummaryView({ summary }) {
  const parsed = extractJSON(summary);
  
  if (!parsed) {
    // Fallback: Display as formatted text
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium text-[#E4E4E8]">Document Summary</span>
        </div>
        <div className="bg-[#1B1B1F] border border-[#2E2E33] rounded-xl p-6">
          <pre className="text-sm text-[#E4E4E8] whitespace-pre-wrap leading-relaxed font-sans">
            {summary}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm font-medium text-[#E4E4E8]">Document Intelligence Summary</span>
        <span className="text-xs text-[#6E6E7A] ml-auto">Powered by ai_query()</span>
      </div>

      {/* Title - Full Width */}
      {parsed.title && (
        <div className="bg-gradient-to-br from-[#FF3621]/10 to-[#FF3621]/5 border border-[#FF3621]/30 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-5 h-5 text-[#FF3621]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-semibold text-[#9B9BA7] uppercase tracking-wider">Document Title</span>
          </div>
          <h2 className="text-xl font-semibold text-[#E4E4E8] leading-relaxed">
            {parsed.title}
          </h2>
        </div>
      )}

      {/* Grid for Date and Parties */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {parsed.date && (
          <SummaryCard 
            label="Date" 
            value={parsed.date}
            icon={
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
        )}
        
        {parsed.parties && (
          <SummaryCard 
            label="Parties Involved" 
            value={Array.isArray(parsed.parties) ? parsed.parties : [parsed.parties]}
            icon={
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
        )}
      </div>

      {/* Key Terms */}
      {parsed.key_terms && (
        <SummaryCard 
          label="Key Terms" 
          value={Array.isArray(parsed.key_terms) ? parsed.key_terms : [parsed.key_terms]}
          icon={
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          }
        />
      )}

      {/* Summary - Full Width */}
      {parsed.summary && (
        <SummaryCard 
          label="Executive Summary" 
          value={parsed.summary}
          icon={
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      )}
    </div>
  );
}

function NextStepsView({ nextSteps }) {
  const parsed = extractJSON(nextSteps);

  if (!parsed || !parsed.next_steps) {
    // Fallback: Try to display as formatted text
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
          <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="text-sm font-medium text-[#E4E4E8]">
            AI-Generated Action Items
          </span>
          <span className="text-xs text-[#6E6E7A] ml-auto">Powered by ai_query()</span>
        </div>
        <div className="bg-[#1B1B1F] border border-[#2E2E33] rounded-xl p-6">
          <pre className="text-sm text-[#E4E4E8] whitespace-pre-wrap leading-relaxed font-sans">
            {nextSteps}
          </pre>
        </div>
      </div>
    );
  }

  const steps = parsed.next_steps || [];
  const priorityColors = {
    high: "text-red-400 bg-red-500/10 border-red-500/40",
    medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/40",
    low: "text-blue-400 bg-blue-500/10 border-blue-500/40",
  };

  const priorityIcons = {
    high: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L2 22h20L12 2zm0 4.5L18.5 20h-13L12 6.5z"/>
      </svg>
    ),
    medium: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    low: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
        <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <span className="text-sm font-medium text-[#E4E4E8]">
          {steps.length} Recommended Action {steps.length === 1 ? 'Item' : 'Items'}
        </span>
        <span className="text-xs text-[#6E6E7A] ml-auto">Powered by ai_query()</span>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => {
          const priority = step.priority?.toLowerCase() || 'medium';
          return (
            <div key={i} className="bg-[#1B1B1F] border border-[#2E2E33] rounded-xl p-5 hover:border-[#FF3621]/30 transition-colors">
              <div className="flex items-start gap-4">
                {/* Number Badge */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-[#FF3621] to-[#E02E1B] flex items-center justify-center shadow-lg">
                  <span className="text-base font-bold text-white">{i + 1}</span>
                </div>
                
                <div className="flex-1 min-w-0">
                  {/* Action */}
                  <p className="text-base text-[#E4E4E8] mb-3 leading-relaxed font-medium">
                    {step.action}
                  </p>
                  
                  {/* Meta Info */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Priority Badge */}
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${priorityColors[priority]}`}>
                      {priorityIcons[priority]}
                      <span>{(step.priority || 'MEDIUM').toUpperCase()} PRIORITY</span>
                    </div>
                    
                    {/* Deadline */}
                    {step.deadline && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#2E2E33] text-[#9B9BA7] border border-[#2E2E33]">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{step.deadline}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PDFViewer({ pdfData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
        <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span className="text-sm font-medium text-[#E4E4E8]">Original PDF Document</span>
      </div>

      <div className="bg-[#1B1B1F] border border-[#2E2E33] rounded-xl overflow-hidden">
        <iframe
          src={`data:application/pdf;base64,${pdfData}`}
          className="w-full h-[600px]"
          title="PDF Viewer"
        />
      </div>

      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-[#6E6E7A]">
          Tip: Right-click to download or print the document
        </span>
      </div>
    </div>
  );
}

/* ── App ────────────────────────────────────────────────────────────────── */

export default function App() {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/process", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || res.statusText);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function parseSummary(raw) {
    return extractJSON(raw);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.toLowerCase().endsWith(".pdf")) setFile(dropped);
  }

  const summary = result ? parseSummary(result.summary) : null;

  return (
    <div className="min-h-screen bg-[#0F0F12] text-[#E4E4E8] flex flex-col">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <img src="/dbx_logo.png" alt="Databricks" className="h-8 w-auto" />
        <span className="text-base font-semibold tracking-tight text-gray-900">
          Document Intelligence
        </span>
        <span className="ml-auto text-xs text-gray-400 font-mono">
          ai_parse_document + ai_mask
        </span>
      </nav>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className={`w-full space-y-6 ${result ? "max-w-5xl" : "max-w-2xl"}`}>
          {/* Upload */}
          <form onSubmit={handleSubmit} className={`space-y-3 ${result ? "max-w-2xl mx-auto" : ""}`}>
            <label
              htmlFor="pdf"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                dragOver
                  ? "border-[#FF3621] bg-[#FF3621]/5"
                  : file
                  ? "border-[#FF3621]/50 bg-[#1B1B1F]"
                  : "border-[#2E2E33] hover:border-[#FF3621]/40 bg-[#1B1B1F]/50"
              }`}
            >
              {file ? (
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#FF3621]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-[#E4E4E8] font-medium text-sm">{file.name}</span>
                  <span className="text-xs text-[#6E6E7A]">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <>
                  <svg className="w-7 h-7 text-[#6E6E7A] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
                  </svg>
                  <span className="text-[#6E6E7A] text-sm">
                    Drop a PDF here or click to browse
                  </span>
                </>
              )}
              <input
                id="pdf"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
            </label>

            <button
              type="submit"
              disabled={!file || loading}
              className="w-full py-2.5 rounded-lg bg-[#FF3621] hover:bg-[#E02E1B] disabled:opacity-30 disabled:cursor-not-allowed font-medium text-sm text-white transition-colors"
            >
              {loading ? "Processing..." : "Process Document"}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="bg-red-950/50 border border-red-800/60 text-red-300 rounded-lg p-4 text-sm">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 border-[#2E2E33]" />
                <div className="absolute inset-0 rounded-full border-2 border-t-[#FF3621] animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm text-[#9B9BA7]">Processing document...</p>
                <p className="text-xs text-[#6E6E7A] mt-1">
                  Parsing, masking PII, and generating summary
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* File info bar */}
              <div className="flex items-center gap-3 bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
                <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium">{result.file}</span>
                <span className="text-xs text-[#6E6E7A]">
                  {result.parsed_length.toLocaleString()} characters extracted
                </span>
              </div>

              {/* Timing info bar */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
                  <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1">
                    <div className="text-xs text-[#6E6E7A] mb-0.5">Parse Time</div>
                    <div className="text-sm font-medium text-[#E4E4E8]">{result.parse_time}s</div>
                  </div>
                  <span className="text-xs text-[#6E6E7A] font-mono">ai_parse_document()</span>
                </div>
                <div className="flex items-center gap-2.5 bg-[#1B1B1F] border border-[#2E2E33] rounded-lg px-4 py-2.5">
                  <svg className="w-4 h-4 text-[#FF3621] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div className="flex-1">
                    <div className="text-xs text-[#6E6E7A] mb-0.5">Mask Time</div>
                    <div className="text-sm font-medium text-[#E4E4E8]">{result.mask_time}s</div>
                  </div>
                  <span className="text-xs text-[#6E6E7A] font-mono">ai_mask()</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-0.5 bg-[#1B1B1F] p-1 rounded-lg border border-[#2E2E33]">
                {TABS.map((tab, i) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(i)}
                    className={`flex-1 py-2 text-sm rounded-md transition-all ${
                      activeTab === i
                        ? "bg-[#FF3621] text-white font-medium shadow-sm"
                        : "text-[#9B9BA7] hover:text-[#E4E4E8]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === 0 && (
                <SummaryView summary={result.summary} />
              )}

              {activeTab === 1 && result.next_steps && (
                <NextStepsView nextSteps={result.next_steps} />
              )}

              {activeTab === 2 && (
                <CompareView original={result.parsed_text} masked={result.masked_text} />
              )}

              {activeTab === 3 && (
                <MaskedTextView text={result.masked_text} />
              )}

              {activeTab === 4 && result.pdf_data && (
                <PDFViewer pdfData={result.pdf_data} />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2E2E33] px-6 py-3 text-center text-xs text-[#6E6E7A]">
        Powered by Databricks AI Functions
      </footer>
    </div>
  );
}
