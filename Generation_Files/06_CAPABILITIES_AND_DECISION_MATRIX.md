# Capabilities and Decision Matrix

## Full V1 Capabilities

### User Interaction
- normal chat
- critic mode
- database mode
- report mode
- session creation and switching
- stop current generation
- last-5 active question queue
- question history view
- direct reply to queued question
- archive question to DB
- mark question resolved
- revisit archived question

### Inputs
- typed text
- pasted logs
- entire conversation log import
- screenshot capture
- crop region submission
- image attachment analysis on request

### Database Capabilities
- store sessions
- store messages
- store questions and statuses
- store claims, contradictions, objections, assumptions, definitions
- retrieve prior structures
- answer direct database questions
- generate procedural reports
- keep full question history
- compare current inputs to prior sessions

### AI Capabilities
- extract argument structure
- pressure-test reasoning
- generate objections and counterexamples
- ask targeted questions
- interpret nuanced conflicts
- provide advisor-style responses

### Optional Research
- import GPT-Researcher outputs
- normalize sources and findings
- link research to topics and claims
- keep research excluded unless selected

## Decision Matrix

### Use procedural-only when:
- the answer exists exactly in the database
- the task is a count, filter, sort, status lookup, or report assembly
- exact chronology is needed
- exact question lists are requested
- exact contradiction lists are requested
- exact source lists are requested

### Use DB + AI when:
- stored data exists but the user wants explanation or synthesis
- the system must interpret the significance of contradictions
- the user wants a critique grounded in stored context

### Use AI-first when:
- the input is unstructured and needs extraction
- the user requests criticism or testing
- the user wants new targeted questions
- the user wants interpretation of a screenshot

### Use research only when:
- enabled by the user
- explicitly imported or selected
- the current route permits it

## Required Question-Asking Cases

The system must ask targeted questions when:
- a conclusion depends on an unsupported premise
- a key term is ambiguous
- there is a contradiction with prior stored material
- the structure is incomplete but recoverable
- the user requests deeper testing of an argument

## Question Queue Rules

- queue shows maximum 5 unanswered questions
- newest relevant question may displace older low-priority unanswered questions into history
- queue cards must show:
  - question text
  - why it was asked
  - what it tests
  - session/topic link
  - status
- full history retains everything


## Runtime and Lifecycle Capabilities

The finished V1 must also provide:
- one easy root startup path
- managed startup of all app-owned runtime components
- process ownership tracking
- graceful shutdown on Ctrl+C
- graceful shutdown from in-app exit
- stale-process recovery on next start after a crash
- safe process-tree termination limited to app-owned processes
- Windows-friendly spawning that avoids stray console windows where possible
