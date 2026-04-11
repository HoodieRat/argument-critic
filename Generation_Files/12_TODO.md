# TODO

## Phase 0 - Foundation
- [ ] create workspace skeleton
- [ ] configure root scripts
- [ ] configure extension build
- [ ] configure server build
- [ ] add TypeScript base config
- [ ] add logging and env handling


## Phase 0.5 - Runtime Lifecycle
- [ ] implement install/bootstrap script
- [ ] implement single-command start script
- [ ] implement process supervisor
- [ ] implement shutdown coordinator
- [ ] implement managed Chrome launcher
- [ ] implement stale-process recovery
- [ ] implement runtime shutdown route
- [ ] verify Windows child-process cleanup

## Phase 1 - Database Foundation
- [ ] implement SQLite bootstrap
- [ ] implement migrations
- [ ] implement repositories
- [ ] implement audit log writes
- [ ] implement settings persistence

## Phase 2 - Session and Routing
- [ ] implement session routes
- [ ] implement session registry
- [ ] implement turn router
- [ ] implement decision matrix
- [ ] implement orchestration coordinator
- [ ] implement persistence coordinator

## Phase 3 - Core Chat and Critic
- [ ] integrate Copilot client
- [ ] implement normal chat path
- [ ] implement critic mode path
- [ ] implement context retrieval
- [ ] implement structure extraction
- [ ] implement contradiction detection
- [ ] implement question generation

## Phase 4 - Question Queue
- [ ] implement question queue service
- [ ] implement question resolution service
- [ ] implement active queue UI
- [ ] implement history UI
- [ ] implement direct reply flow
- [ ] implement archive and resolve flows

## Phase 5 - Database Speak Mode
- [ ] implement deterministic query routes
- [ ] implement procedural answer blocks
- [ ] implement DB mode UI
- [ ] implement provenance display

## Phase 6 - Capture
- [ ] implement screenshot trigger
- [ ] implement crop overlay
- [ ] implement attachment route
- [ ] implement attachment persistence
- [ ] implement image analysis request flow

## Phase 7 - Reports
- [ ] implement procedural report builder
- [ ] implement report templates
- [ ] implement report UI
- [ ] implement saved reports retrieval

## Phase 8 - Optional Research
- [ ] implement research settings gate
- [ ] implement GPT-Researcher importer
- [ ] implement normalization
- [ ] implement research report blocks
- [ ] ensure isolation from ordinary chat

## Phase 9 - Testing and Hardening
- [ ] implement acceptance tests
- [ ] test restart safety
- [ ] test queue integrity
- [ ] test anti-collapse behavior
- [ ] test migration safety
- [ ] test capture flow
- [ ] test runtime lifecycle cleanup
- [ ] test stale-process recovery
