// Facebook feedback id resolution (pure, no network).
//
// 2026-11-27: the GraphQL comment list stopped answering for the legacy numeric
// feedback id (`base64("feedback:<numeric>")` -> {"data":{"node":null}}) on
// pfbid and group permalinks. It now wants the opaque feedback id that the
// permalink HTML embeds on the story node: `base64("feedback:pfbid...")`.
// We locate the story node of the target post (its id decodes to
// `S:_I<author>:<postId>` or `S:_I<author>:VK:<postId>`) and take the feedback
// id that follows it, falling back to the numeric form.
const STORY_ID_RE = /"id":"(UzpfS[A-Za-z0-9+/=_-]{16,})"/g;
const FEEDBACK_RE = /"feedback":\{[^{}]{0,400}?"id":"(ZmVlZGJhY2s6[A-Za-z0-9+/=_-]{8,})"/;
const WINDOW = 4000;

export const numericFeedbackId = (postId) => Buffer.from('feedback:' + postId).toString('base64');

const decode = (b64) => { try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return ''; } };

// Returns { id, source } where id is the base64 feedback id to send as `id`.
export function resolveFeedbackId(html, postId) {
  const text = String(html || '');
  const pid = String(postId || '');
  if (pid) {
    STORY_ID_RE.lastIndex = 0;
    let m;
    while ((m = STORY_ID_RE.exec(text))) {
      if (!decode(m[1]).includes(pid)) continue;
      const fb = text.slice(m.index, m.index + WINDOW).match(FEEDBACK_RE);
      if (fb?.[1]) {
        const decoded = decode(fb[1]);
        if (/^feedback:[A-Za-z0-9]+$/.test(decoded)) return { id: fb[1], source: 'story-feedback' };
      }
    }
  }
  return { id: numericFeedbackId(pid), source: 'numeric' };
}

