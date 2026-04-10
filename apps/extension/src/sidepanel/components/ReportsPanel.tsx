import type { ReportRecord } from "../types";

interface ReportsPanelProps {
  readonly reports: ReportRecord[];
  readonly selectedReport: ReportRecord | null;
  readonly onGenerate: (reportType: string) => Promise<void>;
  readonly onSelect: (report: ReportRecord) => void;
}

const REPORT_TYPES = [
  { value: "session_overview", label: "Session overview" },
  { value: "contradictions", label: "Contradictions" },
  { value: "research", label: "Research summary" }
];

export function ReportsPanel(props: ReportsPanelProps) {
  return (
    <section className="card compact-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Procedural summaries</h2>
        </div>
      </div>

      <div className="quick-grid">
        {REPORT_TYPES.map((reportType) => (
          <button key={reportType.value} className="ghost-button" type="button" onClick={() => void props.onGenerate(reportType.value)}>
            {reportType.label}
          </button>
        ))}
      </div>

      <div className="report-layout">
        <aside className="report-list">
          {props.reports.map((report) => (
            <button key={report.id} className="report-item" type="button" onClick={() => props.onSelect(report)}>
              <span>{report.title}</span>
              <small>{new Date(report.createdAt).toLocaleString()}</small>
            </button>
          ))}
        </aside>
        <article className="report-viewer">
          {props.selectedReport ? <pre>{props.selectedReport.content}</pre> : <div className="empty-state">Generate or select a report.</div>}
        </article>
      </div>
    </section>
  );
}