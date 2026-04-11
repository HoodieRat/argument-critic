# skills.md

Skills are reusable capabilities. They are not vague style notes.

## Skill: Route Turn
Description:
Determine whether the user input should be handled as chat, critic, database, report, research import, or attachment analysis.

Inputs:
- raw_input
- current_mode
- active_session_summary
- unresolved_questions

Outputs:
- route
- confidence
- downstream_agents

## Skill: Retrieve Minimal Context
Description:
Fetch the smallest useful context set for the current turn.

Inputs:
- session_id
- topic
- route
- latest_claim_ids
- unresolved_question_ids

Outputs:
- context_pack
- omitted_context
- retrieval_provenance

## Skill: Extract Argument Structure
Description:
Turn loose text into claims, definitions, assumptions, links, and candidate objections.

Inputs:
- raw_text
- context_pack

Outputs:
- claims
- links
- definitions
- assumptions
- candidate_objections
- candidate_questions

## Skill: Detect Contradictions
Description:
Compare new claims against stored claims and identify conflicts or tension.

Inputs:
- new_claims
- stored_claims
- definitions

Outputs:
- contradiction_records
- severity
- explanation

## Skill: Detect Definition Drift
Description:
Identify when key terms are used inconsistently.

Inputs:
- term_usage
- stored_definitions
- current_text

Outputs:
- drift_flags
- conflicting_definitions
- follow_up_questions

## Skill: Generate Targeted Questions
Description:
Create 1 to 3 high-value questions that test weak reasoning.

Inputs:
- weaknesses
- missing_support
- ambiguity_notes
- prior_unanswered_questions

Outputs:
- questions
- why_each_question_exists
- what_each_question_tests

## Skill: Maintain Active Question Queue
Description:
Keep the latest 5 unanswered AI questions visible and ordered.

Inputs:
- new_questions
- existing_queue
- question_status_updates

Outputs:
- updated_queue
- archived_questions
- overflow_handling_log

## Skill: Answer Direct Database Query
Description:
Respond to deterministic data requests without unnecessary AI use.

Inputs:
- parsed_query
- repositories
- filters
- sort_order

Outputs:
- procedural_result
- provenance
- optional_interpretation_needed

## Skill: Build Procedural Report
Description:
Assemble reports from stored data using templates and deterministic formatting.

Inputs:
- report_type
- structured_records
- template

Outputs:
- report
- metadata
- saved_report_record

## Skill: Summarize Session State
Description:
Create concise session summaries for future retrieval and anti-drift handoffs.

Inputs:
- session_records
- latest_changes
- unresolved_items

Outputs:
- session_summary
- carry_forward_items

## Skill: Process Screenshot Attachment
Description:
Handle a screenshot or crop as an attachment, persist it, and optionally analyze it.

Inputs:
- image_blob
- crop_bounds
- session_id
- analyze_requested

Outputs:
- attachment_record
- derived_image_metadata
- optional_analysis_request

## Skill: Import GPT-Researcher Result
Description:
Normalize GPT-Researcher outputs into stored findings and sources when enabled.

Inputs:
- research_payload
- import_settings
- topic_mapping

Outputs:
- research_run_record
- source_records
- finding_records
- linked_entities

## Skill: Compose Final Response
Description:
Assemble the final user-facing output from procedural and AI sections without hiding provenance.

Inputs:
- route
- procedural_blocks
- ai_blocks
- queue_updates

Outputs:
- final_response
- provenance_sections
- persistence_delta
