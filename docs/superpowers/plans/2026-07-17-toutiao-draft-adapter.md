# Toutiao Draft Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `toutiao` adapter that saves an authenticated user's article as a draft and never publishes it.

**Architecture:** A new core adapter implements the existing `CodeAdapter` contract and is explicitly exported and registered by the extension. A captured draft-save request from the user's logged-in headless account supplies the real endpoint and required fields; tests cover registration and the no-auth safety boundary before that request is wired in.

**Tech Stack:** TypeScript, Vitest, WechatSync core adapter registry, Chrome extension runtime.

---

## File structure

- Create: `packages/core/src/adapters/platforms/toutiao.ts` — `ToutiaoAdapter`, auth, image transfer, draft save.
- Create: `packages/core/src/adapters/platforms/__tests__/toutiao.test.ts` — adapter metadata and no-auth guard tests.
- Modify: `packages/core/src/adapters/platforms/index.ts` — public export.
- Modify: `packages/extension/src/adapters/index.ts` — explicit runtime registration.
- Create: `docs/adapter-specs/toutiao-draft-request.md` — redacted, one-time real request contract captured from the logged-in creator backend.

### Task 1: Register the platform and protect the authentication boundary

**Files:**
- Create: `packages/core/src/adapters/platforms/__tests__/toutiao.test.ts`
- Create: `packages/core/src/adapters/platforms/toutiao.ts`
- Modify: `packages/core/src/adapters/platforms/index.ts`
- Modify: `packages/extension/src/adapters/index.ts`

- [ ] **Step 1: Write the failing registration test**

```ts
import { describe, expect, it } from 'vitest'
import { ToutiaoAdapter } from '../toutiao'

describe('ToutiaoAdapter', () => {
  it('declares the public draft and image-upload capabilities', () => {
    expect(new ToutiaoAdapter().meta).toMatchObject({
      id: 'toutiao',
      name: '头条号',
      capabilities: ['article', 'draft', 'image_upload'],
    })
  })
})
```

- [ ] **Step 2: Verify it fails because the adapter does not exist**

Run: `pnpm --filter @wechatsync/core test src/adapters/platforms/__tests__/toutiao.test.ts`

Expected: FAIL with an unresolved `../toutiao` import.

- [ ] **Step 3: Add the smallest exportable adapter shell and explicit registration**

```ts
export class ToutiaoAdapter extends CodeAdapter {
  readonly meta: PlatformMeta = {
    id: 'toutiao', name: '头条号', icon: 'https://www.toutiao.com/favicon.ico',
    homepage: 'https://mp.toutiao.com/', capabilities: ['article', 'draft', 'image_upload'],
  }
  readonly preprocessConfig = { outputFormat: 'html' as const }
  async checkAuth(): Promise<AuthResult> { return { isAuthenticated: false } }
  async publish(): Promise<SyncResult> { return this.createResult(false, { error: '头条号适配器尚未联调' }) }
}
```

Add `export { ToutiaoAdapter } from './toutiao'` to the core platform index. Add `ToutiaoAdapter` to the extension import list and `ADAPTER_CLASSES` list.

- [ ] **Step 4: Verify the test passes and type-check the packages**

Run: `pnpm --filter @wechatsync/core test src/adapters/platforms/__tests__/toutiao.test.ts && pnpm --filter @wechatsync/core typecheck && pnpm --filter @wechatsync/extension build`

Expected: PASS; generated extension contains `toutiao` in its platform list.

- [ ] **Step 5: Commit the safe registration slice**

Run: `git add packages/core/src/adapters/platforms/toutiao.ts packages/core/src/adapters/platforms/__tests__/toutiao.test.ts packages/core/src/adapters/platforms/index.ts packages/extension/src/adapters/index.ts && git commit`

Commit message must state that this adds only a draft-capable platform registration, not a publish action.

### Task 2: Capture the real, redacted draft contract

**Files:**
- Create: `docs/adapter-specs/toutiao-draft-request.md`

- [ ] **Step 1: Open the already logged-in `mp.toutiao.com` creator backend and manually save a harmless one-line draft with one disposable image**

Expected: exactly one draft appears in the account's draft list; do not click submit, publish, schedule, or review.

- [ ] **Step 2: Record the request contract without secrets**

Document the request URL path, method, non-secret headers, body field names, required category/cover values, success JSON fields, image-upload request/response fields, and draft edit URL pattern. Replace cookies, tokens, account IDs, image URLs, and title/body values with `<redacted>`.

- [ ] **Step 3: Verify the record is sufficient to identify draft-only behavior**

Expected: the captured response contains a draft/article identifier and no field or endpoint that finalizes publication.

- [ ] **Step 4: Commit the redacted contract**

Run: `git add docs/adapter-specs/toutiao-draft-request.md && git commit`

### Task 3: Enforce no-auth and image failure safety with tests

**Files:**
- Modify: `packages/core/src/adapters/platforms/__tests__/toutiao.test.ts`
- Modify: `packages/core/src/adapters/platforms/toutiao.ts`

- [ ] **Step 1: Write a failing no-auth test**

```ts
it('does not upload images or save a draft when not authenticated', async () => {
  const adapter = new ToutiaoAdapter()
  await adapter.init(createRuntimeReturningUnauthenticated())
  const result = await adapter.publish({ title: 'test', markdown: '', html: '<img src="https://example.com/a.png">' })
  expect(result).toMatchObject({ success: false, draftOnly: true })
  expect(runtimeFetch).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Verify it fails before the guard is implemented**

Run: `pnpm --filter @wechatsync/core test src/adapters/platforms/__tests__/toutiao.test.ts`

Expected: FAIL because `publish()` does not yet call `checkAuth()`.

- [ ] **Step 3: Implement the guard before any image or save request**

```ts
const auth = await this.checkAuth()
if (!auth.isAuthenticated) {
  return this.createResult(false, { error: '请先登录并开通头条号', draftOnly: true })
}
```

- [ ] **Step 4: Verify all Toutiao unit tests pass**

Run: `pnpm --filter @wechatsync/core test src/adapters/platforms/__tests__/toutiao.test.ts`

Expected: PASS; the mock observes no upload or draft-save request when unauthenticated.

- [ ] **Step 5: Commit the safety guard**

Run: `git add packages/core/src/adapters/platforms/toutiao.ts packages/core/src/adapters/platforms/__tests__/toutiao.test.ts && git commit`

### Task 4: Implement and verify the captured draft workflow

**Files:**
- Modify: `packages/core/src/adapters/platforms/toutiao.ts`
- Modify: `packages/core/src/adapters/platforms/__tests__/toutiao.test.ts`

- [ ] **Step 1: Write failing tests from the redacted request contract**

Add one test that mocks the captured account response and expects `checkAuth()` to return the account name, and one test that mocks the captured image-upload and draft-save responses and expects `publish()` to return `{ success: true, draftOnly: true, postId, postUrl }`.

- [ ] **Step 2: Run the tests and verify they fail against the guard-only implementation**

Run: `pnpm --filter @wechatsync/core test src/adapters/platforms/__tests__/toutiao.test.ts`

Expected: FAIL because the captured endpoints and response mapping are absent.

- [ ] **Step 3: Implement exactly the captured request contract**

Use `runtime.fetch` with `credentials: 'include'`; use `processImages` to replace each article image only after an upload response yields a valid URL; call only the captured draft-save endpoint; construct `postUrl` from the captured edit URL pattern; always pass `draftOnly: true` to `createResult`.

- [ ] **Step 4: Run unit and package verification**

Run: `pnpm --filter @wechatsync/core test src/adapters/platforms/__tests__/toutiao.test.ts && pnpm --filter @wechatsync/core typecheck && pnpm --filter @wechatsync/extension build`

Expected: all commands exit 0.

- [ ] **Step 5: Perform one live draft-only integration test**

Send a test article containing two body images through the existing MCP bridge with `platform=toutiao`. Verify the returned edit URL opens a draft and both images render in the draft editor. Stop there: do not submit or publish.

- [ ] **Step 6: Commit the completed adapter**

Run: `git add packages/core/src/adapters/platforms/toutiao.ts packages/core/src/adapters/platforms/__tests__/toutiao.test.ts && git commit`

Commit trailers must record the source of the request contract, draft-only constraint, verification output, and any untested account state.
