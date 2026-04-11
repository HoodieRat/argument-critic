# Minimal Implementation Plan

## Goal
Implement four user-facing improvements with the smallest durable change set:

1. Keep generated follow-up questions capped at five active items.
2. Let the user clear active questions and turn question generation on or off.
3. Make cropshots and uploaded files appear as visible chat attachments in the composer and in sent messages.
4. Make the top capture action visible and reliable.

## Constraints
- Keep the current lane and orchestration model intact.
- Reuse existing settings, attachment storage, and question lifecycle paths.
- Do not build a separate attachment subsystem for chat if the existing capture/attachment path can be extended.
- Use migrations only where the current schema cannot represent the feature cleanly.
- Keep the first pass practical: images plus text-like reference files should be analyzable; unsupported binary formats can still upload and display, but should be surfaced as references until a parser exists.

## What Already Exists
- The active question queue is already capped at five via `ACTIVE_QUESTION_LIMIT` and `QuestionQueueService.listActive()`.
- Users can already answer, archive, resolve, and reopen individual questions.
- Captures already persist as attachments and optional capture records.
- The sidepanel already shows capture status and has a dedicated capture tab.
- Runtime settings already persist simple boolean toggles through `SettingsRepository` and `/runtime/settings`.

## Recommended Scope
### 1. Questions: finish the existing queue behavior
Do not change the five-item cap logic. Add only:
- a runtime setting `questionGenerationEnabled`
- a `clear all active questions` action for the current session
- UI controls in Questions and Settings

### 2. Attachments: make them first-class in chat
Extend the current attachment system rather than creating a new message payload format.
- Captures should auto-populate the current chat draft as pending attachments.
- Uploads should use the same attachment store and return attachment metadata.
- Sending a chat turn should accept `attachmentIds` and link them to the user message.
- Message responses should return message attachment metadata so the UI can render chips/previews in transcript history.

### 3. Attachment analysis: keep it minimal and real
For the first implementation, support analysis in this order:
- images: use the existing capture/image analysis path and feed its summary into the chat turn context
- text-like files: extract UTF-8 text for `.txt`, `.md`, `.json`, `.csv`, and common code files, then feed a bounded excerpt into the chat turn context
- unsupported binary files: allow upload and visible attachment chips, but tell the user the file is attached as reference only

This avoids pretending the model analyzed arbitrary files when the backend does not yet have a parser.

### 4. Capture launch: fix visibility, then clarify the UI
Treat this as a reliability and discoverability issue, not a new feature.
- Keep the desktop drawer on top after crop completion.
- Surface capture success directly in the chat draft area, not only in the Capture tab.
- Make the top action text or tooltip clearly say `Capture` instead of relying on an icon-only flow.

## Minimal Schema Changes
### Migration A: message attachments
Create a `message_attachments` junction table so chat messages can own zero or more attachments.

Files:
- `apps/server/src/services/db/migrations/004_message_attachments.sql`
- `apps/server/src/services/db/repositories/MessagesRepository.ts`
- `apps/server/src/services/db/repositories/AttachmentsRepository.ts`

Why this is necessary:
- The current schema stores attachments and messages independently.
- Without a junction table, uploaded files and captures cannot be rendered as part of a message history cleanly.

### Migration B: attachment display name
Add a `display_name` column to `attachments`.

Files:
- `apps/server/src/services/db/migrations/005_attachment_display_name.sql`
- `apps/server/src/services/db/repositories/AttachmentsRepository.ts`
- `apps/server/src/types/domain.ts`
- `apps/extension/src/sidepanel/types.ts`

Why this is necessary:
- Uploaded files need a user-visible name in the composer and transcript.
- Hash-based storage paths are not acceptable UI labels.

## Implementation Sequence
### Phase 1: Question controls
Backend:
- `apps/server/src/routes/runtime.ts`
- `apps/server/src/routes/questions.ts`
- `apps/server/src/services/agents/Orchestrator.ts`
- `apps/server/src/services/db/repositories/QuestionsRepository.ts`
- `apps/server/src/types/api.ts`

Frontend:
- `apps/extension/src/sidepanel/types.ts`
- `apps/extension/src/sidepanel/api/client.ts`
- `apps/extension/src/sidepanel/state/store.ts`
- `apps/extension/src/sidepanel/components/QuestionHistoryPanel.tsx`
- `apps/extension/src/sidepanel/components/SettingsPanel.tsx`

Concrete changes:
- Add `questionGenerationEnabled` to runtime settings request/response types.
- Read/write the setting through `SettingsRepository` in `/runtime/settings`.
- In `Orchestrator`, skip question generation entirely when the setting is off.
- Add `POST /questions/clear-all` to archive all unanswered questions for the current session.
- Add one Settings toggle and one `Clear active` button in the Questions panel.

Notes:
- The active five-question cap should remain exactly where it is today.
- The UI should make it clear that once five active questions exist, the user must answer, resolve, archive, or clear them before the queue becomes useful again.

### Phase 2: Attachment transport and persistence
Backend:
- `apps/server/src/routes/chat.ts`
- `apps/server/src/routes/capture.ts`
- `apps/server/src/routes/attachments.ts` (new)
- `apps/server/src/services/attachments/AttachmentStore.ts`
- `apps/server/src/services/attachments/ImageAnalysisService.ts`
- `apps/server/src/services/db/repositories/AttachmentsRepository.ts`
- `apps/server/src/services/db/repositories/MessagesRepository.ts`
- `apps/server/src/types/api.ts`
- `apps/server/src/types/domain.ts`

Frontend:
- `apps/extension/src/sidepanel/api/client.ts`
- `apps/extension/src/sidepanel/state/store.ts`
- `apps/extension/src/sidepanel/components/ChatView.tsx`
- `apps/extension/src/sidepanel/types.ts`

Concrete changes:
- Add `attachmentIds?: string[]` to the chat turn request.
- Add attachment metadata to returned message records.
- Create a generic `POST /attachments/upload` multipart endpoint using the already-installed multipart stack.
- Add `GET /attachments/:attachmentId` or `GET /attachments/:attachmentId/content` so the UI can render previews/download links.
- Extend `AttachmentStore` to accept uploaded files in addition to data URLs from capture.
- Link uploaded/captured attachment IDs to the created user message through `message_attachments`.

Notes:
- Do not embed attachment metadata into the message text.
- Reuse the existing attachment hashing and dedupe behavior.

### Phase 3: Composer attachments and drag/drop
Frontend:
- `apps/extension/src/sidepanel/components/ChatView.tsx`
- `apps/extension/src/sidepanel/state/store.ts`
- `apps/extension/src/sidepanel/styles.css`
- `apps/extension/src/sidepanel/components/AttachmentChip.tsx` (new)

Concrete changes:
- Add `pendingAttachments` state to the store for the current draft.
- When a capture succeeds, push the returned attachment into `pendingAttachments` immediately.
- Add a visible attachment strip above the chat textarea.
- Add remove buttons on pending attachment chips.
- Add a hidden file input and an `Attach files` button in the composer.
- Add drag-over / drop handling to the composer region so dropped files upload and appear in the same pending strip.
- On successful send, clear the pending attachment strip.

Notes:
- Keep this in the existing chat composer instead of opening a second attachment modal.
- Use small image previews for images and simple filename chips for non-images.

### Phase 4: Feed attachments into the model context
Backend:
- `apps/server/src/services/agents/Orchestrator.ts`
- `apps/server/src/services/agents/ContextRetrieverAgent.ts`
- `apps/server/src/services/agents/ReportBuilderAgent.ts`
- `apps/server/src/services/db/repositories/AttachmentsRepository.ts`
- `apps/server/src/services/attachments/ImageAnalysisService.ts`

Concrete changes:
- When `attachmentIds` are present on the current user turn, build an attachment context block before the model request.
- For captures/images, use the existing analysis summary path and include a short structured summary in the prompt.
- For text-like uploads, read a bounded excerpt and include it in the prompt.
- For unsupported binary files, include filename, MIME type, and a note that the file is attached but not parsed.

Notes:
- Do not try to build full multimodal support in this pass.
- The goal is truthful analysis support, not fake file awareness.

### Phase 5: Capture visibility and reliability
Desktop and UI:
- `apps/desktop/src/electron/main.ts`
- `apps/extension/src/sidepanel/platform.ts`
- `apps/extension/src/sidepanel/state/store.ts`
- `apps/extension/src/sidepanel/components/SessionHeader.tsx`
- `apps/extension/src/sidepanel/components/CaptureStatusCard.tsx`

Concrete changes:
- After crop completion, explicitly refocus the main drawer window.
- Keep the desktop drawer `alwaysOnTop` during the capture workflow.
- Preserve the current `activePanel: "capture"` behavior, but make the more important success state the pending attachment row in chat.
- Change the top capture affordance so it is text-labeled or at least has clearer wording than the current icon-only flow.
- Distinguish user cancellation from actual failure and keep the retry path obvious.

Notes:
- This should solve both “it didn’t open” and “it opened somewhere I couldn’t see” without building a new windowing system.

## What Not To Change
- Do not add a new lane or a new mode for attachments.
- Do not replace the existing `AttachmentStore` dedupe strategy.
- Do not move question generation logic out of `Orchestrator`; just gate it.
- Do not create a separate draft composer state outside the existing sidepanel store.
- Do not claim broad file analysis support for formats the backend cannot actually parse yet.

## Verification
### Automated
Run after implementation:
- `corepack pnpm --filter @argument-critic/server test`
- `corepack pnpm --filter @argument-critic/server build`
- `corepack pnpm --filter @argument-critic/extension build`

Tests to update or add:
- `apps/server/test/acceptance/question-queue.test.ts`
  - verify generation toggle off
  - verify clear-all archives active questions
  - verify active queue still returns at most five
- `apps/server/test/acceptance/normal-chat.test.ts`
  - verify a message with attachments persists and reloads with attachment metadata
- `apps/server/test/acceptance/critic-mode.test.ts`
  - verify a turn with attachment context still produces an answer and questions when generation is on
- `apps/server/test/acceptance/capture-flow.test.ts`
  - verify captures can be reused as message attachments
- add `apps/server/test/acceptance/attachment-upload.test.ts`
  - verify upload, serve, and chat linkage for text and image files

### Manual
1. Generate questions until five are open; confirm no more than five are shown.
2. Turn question generation off and send a turn; confirm no new questions appear.
3. Turn it back on and send a turn; confirm question generation resumes.
4. Use `Clear active` and confirm the open queue empties while history remains.
5. Trigger cropshot from the top control and confirm the drawer remains visible.
6. Confirm the cropshot appears immediately in the chat composer as a removable attachment.
7. Upload an image and a text file with the file picker; confirm both appear in the pending attachment strip.
8. Drag and drop a supported file into the composer; confirm upload and preview.
9. Send a turn with attachments in Chat, Critic, and Reviewer; confirm the assistant explicitly references the attached material.

## Recommended Build Order
1. Question toggle and clear-all.
2. Attachment schema and message linkage.
3. Upload endpoint and composer attachment strip.
4. Attachment-aware prompt context.
5. Capture visibility polish.

That order keeps the early changes low-risk and makes the attachment UI useful as soon as the message linkage exists.
