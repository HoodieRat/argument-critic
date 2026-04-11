# Data Model

## Database Choice
SQLite in V1.

Rationale:
- local
- stable
- simple backups
- zero account dependency
- excellent single-user fit

## Core Tables

### sessions
- id
- title
- mode
- topic
- summary
- created_at
- updated_at

### messages
- id
- session_id
- role
- content
- provenance
- created_at

### attachments
- id
- session_id
- type
- path
- mime_type
- width
- height
- created_at

### captures
- id
- attachment_id
- crop_x
- crop_y
- crop_width
- crop_height
- analysis_status
- created_at

### claims
- id
- session_id
- text
- claim_type
- confidence
- source_message_id
- created_at

### claim_links
- id
- from_claim_id
- to_claim_id
- link_type
- explanation
- created_at

### definitions
- id
- session_id
- term
- definition_text
- source_message_id
- created_at

### assumptions
- id
- session_id
- text
- source_message_id
- created_at

### objections
- id
- session_id
- claim_id
- text
- severity
- created_at

### contradictions
- id
- session_id
- claim_a_id
- claim_b_id
- status
- explanation
- created_at

### questions
- id
- session_id
- topic
- question_text
- why_asked
- what_it_tests
- status
- priority
- source_turn_id
- created_at
- updated_at

### question_answers
- id
- question_id
- message_id
- resolution_note
- created_at

### reports
- id
- session_id
- report_type
- title
- content
- created_at

### research_runs
- id
- session_id
- provider
- import_mode
- enabled_for_context
- created_at

### research_sources
- id
- research_run_id
- title
- url
- snippet
- source_hash
- created_at

### research_findings
- id
- research_run_id
- finding_text
- category
- created_at

### settings
- key
- value_json
- updated_at

### audit_log
- id
- session_id
- turn_id
- route
- action
- detail_json
- created_at

## Required Status Values

### question status
- unanswered
- answered
- resolved
- archived
- dismissed
- superseded

### contradiction status
- open
- reviewed
- resolved
- downgraded

## Migration Requirements
- versioned migrations
- startup migration check
- no destructive migration without explicit safe path


## Runtime State Artifacts

The implementation may store runtime lifecycle metadata outside the main SQLite domain tables when appropriate, such as:
- a managed PID registry file for app-owned child processes
- a managed Chrome profile directory marker
- a shutdown state marker for stale-process recovery

These artifacts must be owned by the app, must be safe to clean up on next start, and must never be used to terminate unrelated user processes.
