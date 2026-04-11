import { useState } from "react";

import type { QuestionRecord, QuestionStatus } from "../types";

interface QuestionHistoryPanelProps {
  readonly sessionTitle: string;
  readonly activeQuestions: QuestionRecord[];
  readonly questions: QuestionRecord[];
  readonly onFilter: (status?: QuestionStatus) => Promise<void>;
  readonly onAnswer: (questionId: string, answer: string) => Promise<void>;
  readonly onArchive: (questionId: string) => Promise<void>;
  readonly onResolve: (questionId: string) => Promise<void>;
  readonly onReopen: (questionId: string) => Promise<void>;
  readonly onClearAll: () => Promise<void>;
}

const FILTERS: Array<{ label: string; value?: QuestionStatus }> = [
  { label: "All" },
  { label: "Unanswered", value: "unanswered" },
  { label: "Answered", value: "answered" },
  { label: "Resolved", value: "resolved" },
  { label: "Archived", value: "archived" }
];

export function QuestionHistoryPanel(props: QuestionHistoryPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const activeIds = new Set(props.activeQuestions.map((question) => question.id));
  const ledgerQuestions = props.questions.filter((question) => !activeIds.has(question.id));

  return (
    <section className="card compact-card questions-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Questions</p>
          <h2>Follow-up</h2>
        </div>
        <div className="questions-panel__header-actions">
          <span className="count-badge">{props.activeQuestions.length} open</span>
          <button className="ghost-button" type="button" onClick={() => void props.onClearAll()} disabled={props.activeQuestions.length === 0}>
            Clear active
          </button>
        </div>
      </div>

      {props.activeQuestions.length >= 5 ? (
        <p className="detail-line">Question queue is full. Answer, resolve, archive, or clear one before new follow-up questions will be generated.</p>
      ) : null}

      <div className="questions-panel__section">
        {props.activeQuestions.length === 0 ? (
          <div className="empty-state">No follow-up questions right now.</div>
        ) : (
          <div className="question-list">
            {props.activeQuestions.map((question) => (
              <article key={question.id} className="question-card">
                <header>
                  <p className="question-card__text">{question.questionText}</p>
                  <span className="question-card__session">{props.sessionTitle}</span>
                </header>
                <div className="question-card__labels">
                  <p className="detail-line">Why this came up: {question.whyAsked}</p>
                  <p className="detail-line">What it checks: {question.whatItTests}</p>
                </div>
                <textarea
                  value={drafts[question.id] ?? ""}
                  onChange={(event) => setDrafts((state) => ({ ...state, [question.id]: event.target.value }))}
                  placeholder="Answer this question directly."
                  rows={3}
                />
                <div className="question-card__actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void props.onAnswer(question.id, drafts[question.id] ?? "")}
                    disabled={!(drafts[question.id] ?? "").trim()}
                  >
                    Save answer
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void props.onResolve(question.id)}>
                    Mark resolved
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void props.onArchive(question.id)}>
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="questions-panel__section">
        <div className="questions-panel__section-heading">
          <div>
            <p className="eyebrow">Earlier</p>
            <h3>Previous questions</h3>
          </div>
        </div>

        <div className="filter-strip">
          {FILTERS.map((filter) => (
            <button key={filter.label} type="button" className="filter-chip" onClick={() => void props.onFilter(filter.value)}>
              {filter.label}
            </button>
          ))}
        </div>

        {ledgerQuestions.length === 0 ? (
          <div className="empty-state">No previous questions in this view.</div>
        ) : (
          <div className="history-list">
            {ledgerQuestions.map((question) => (
              <article key={question.id} className="history-item">
                <div className="history-item__meta">
                  <span className="history-item__status">{question.status}</span>
                  <span>{new Date(question.updatedAt).toLocaleString()}</span>
                </div>
                <div className="history-item__body">
                  <p>{question.questionText}</p>
                  <p className="detail-line">Why it was asked: {question.whyAsked}</p>
                </div>
                <button className="ghost-button" type="button" onClick={() => void props.onReopen(question.id)}>
                  Reopen
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}