# CR-17 — Progressive Unlock UX

Status: approved for Preview implementation on 2026-09-02.

## Outcome

Famnesia must remain fail-closed without leaving an authenticated user at a dead-end. The public homepage scrolls as a normal document. After Google authentication, users enter a workspace hub, select or create a workspace, and unlock it before the family application is rendered.

## Approved flow

1. Public homepage → Google sign-in → workspace hub.
2. Select or create a workspace.
3. Reuse an in-memory workspace key when available.
4. Otherwise request the key from another active tab, recover it from the Google Drive vault, or let an owner bootstrap a new empty workspace.
5. Load and decrypt the encrypted family snapshot.
6. Render `FamilyTreePage` only after successful decryption.

The UI distinguishes loading, ready, unlock required, owner bootstrap, recovery error, access denied, and fatal security error. Every recoverable error provides a concrete next action.

## Security boundary

- `EncryptedFamilyRepository` is the family-data read/write path for this flow.
- Supabase stores ciphertext, revisions, and minimal operational metadata only.
- There is no fallback to the blocked plaintext family/media/backup APIs.
- Workspace keys stay in memory and are not stored in localStorage, IndexedDB, Supabase, logs, or analytics.
- Decryption failure is never interpreted as an empty workspace.
- Membership removal locks the active workspace session.
- Preview starts with new/empty workspaces; legacy Production migration is out of scope.
- Production remains unchanged until Preview acceptance.

## Experience and visual system

The visual direction is a living family archive: warm paper, moss green, editorial serif headings, readable sans-serif body text, and restrained lineage motifs. Famnesia keeps its logo, Vietnamese copy, and existing brand character. UI/UX Pro Max recommendations are applied for accessibility, responsive behavior, recovery states, and touch interaction; its generic blue SaaS palette is not adopted.

- Public pages use document scrolling.
- The authenticated family application uses a fixed viewport shell with one intentional scrolling region per view.
- Mobile targets are at least 44px with at least 8px separation.
- Forms use visible labels and at least 16px text on mobile.
- Dialogs manage focus; keyboard focus remains visible; reduced motion is respected.
- Breakpoints are verified at 375, 768, 1024, and 1440px, including mobile landscape and safe-area insets.

## Error handling

- Revision conflicts do not overwrite newer ciphertext.
- Wrong Drive identity offers account switching.
- Recovery failures offer retry and workspace navigation.
- Loading, empty, warning, error, and success states share consistent components and language.
- Security-sensitive values and plaintext are never logged.

## Verification gates

- Unit tests cover the unlock state machine and encrypted repository adapter.
- Integration covers workspace creation, bootstrap, encrypted write, reload/recovery, and decrypt.
- Multi-tab checks cover key handoff, sign-out, and relock.
- Roles, pending approval, membership removal, and revision conflict are exercised.
- Browser verification covers responsive layout, keyboard focus, reduced motion, console errors, and the absence of plaintext network requests.
- Build and full tests must pass before deploying a Preview.

## Decision log

- Chosen: progressive workspace unlock instead of a permanently blocking encrypted gate.
- Chosen: browser-native encryption with ciphertext-only server persistence.
- Chosen: document scrolling for public pages and a fixed shell only for the authenticated application.
- Chosen: preserve the Famnesia archive identity while applying UI/UX Pro Max usability guidance.
- Rejected: a manual unlock on every navigation because it adds avoidable friction.
- Rejected: only restyling the existing gate because the product would remain unusable after sign-in.
