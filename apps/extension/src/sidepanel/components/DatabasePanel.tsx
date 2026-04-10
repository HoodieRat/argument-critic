import { useState } from "react";

import type { DatabaseQueryResponse } from "../types";

interface DatabasePanelProps {
  readonly result: DatabaseQueryResponse | null;
  readonly onQuery: (query: string, interpret?: boolean) => Promise<void>;
}

const QUICK_QUERIES = [
  "List unanswered questions",
  "Show contradictions",
  "Generate session summary report",
  "Show saved reports"
];

export function DatabasePanel(props: DatabasePanelProps) {
  const [query, setQuery] = useState("");
  const [interpret, setInterpret] = useState(false);

  return (
    <section className="card compact-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Database Mode</p>
          <h2>Speak directly to stored records</h2>
        </div>
      </div>

      <div className="quick-grid">
        {QUICK_QUERIES.map((item) => (
          <button key={item} className="ghost-button" type="button" onClick={() => void props.onQuery(item, interpret)}>
            {item}
          </button>
        ))}
      </div>

      <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={4} placeholder="Ask for exact questions, contradiction lists, counts, or structured reports." />

      <label className="checkbox-row">
        <input type="checkbox" checked={interpret} onChange={(event) => setInterpret(event.target.checked)} />
        <span>Add an interpretive layer on top of the exact records.</span>
      </label>

      <button className="primary-button" type="button" onClick={() => void props.onQuery(query, interpret)} disabled={!query.trim()}>
        Run query
      </button>

      {props.result ? (
        <div className="database-result">
          <p className={`provenance provenance--${props.result.provenance}`}>{props.result.provenance}</p>
          <pre>{props.result.answer}</pre>
        </div>
      ) : null}
    </section>
  );
}