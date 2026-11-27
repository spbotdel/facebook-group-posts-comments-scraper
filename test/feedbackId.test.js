import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFeedbackId, numericFeedbackId } from '../src/engines/comments/feedbackId.js';
import { parseCommentEdges } from '../src/engines/comments/parseComments.js';
import { buildDepth1Vars, feedbackId } from '../src/engines/comments/settings.js';

const b64 = (s) => Buffer.from(s).toString('base64');
const storyId = (s) => b64(s);
const fb = (token) => b64('feedback:' + token);

// Sanitized shape of the 2026-11-27 permalink HTML: several story nodes, each
// followed by its own opaque feedback id; only one belongs to the target post.
const page = (target) => `<html>..."node_v2":{"__typename":"Story","id":"${storyId('S:_I100:111111111111:111111111111')}","sponsored_data":null,"feedback":{"associated_group":null,"id":"${fb('pfbid0OTHERpostAAAA')}","x":1}}
..."node_v2":{"__typename":"Story","id":"${storyId('S:_I100:' + target + ':' + target)}","sponsored_data":null,"feedback":{"associated_group":null,"id":"${fb('pfbid0TARGETpostBBBB')}","x":1}}..."`;

test('resolveFeedbackId picks the feedback id of the story that matches the post id', () => {
  const r = resolveFeedbackId(page('6375219342552112'), '6375219342552112');
  assert.equal(r.source, 'story-feedback');
  assert.equal(Buffer.from(r.id, 'base64').toString(), 'feedback:pfbid0TARGETpostBBBB');
});

test('resolveFeedbackId handles the group story id shape (S:_I<author>:VK:<id>)', () => {
  const html = `"id":"${storyId('S:_I100006821464901:VK:28938326995772401')}","sponsored_data":null,"feedback":{"associated_group":{"id":"1"},"id":"${fb('pfbid0GROUPpostCCCC')}"}`;
  // associated_group nests a brace, so the feedback block regex must still reach the id
  const r = resolveFeedbackId(html.replace('{"id":"1"}', 'null'), '28938326995772401');
  assert.equal(Buffer.from(r.id, 'base64').toString(), 'feedback:pfbid0GROUPpostCCCC');
});

test('resolveFeedbackId falls back to the numeric id when the page has no matching story', () => {
  const r = resolveFeedbackId('<html>nothing</html>', '123456789012');
  assert.equal(r.source, 'numeric');
  assert.equal(r.id, numericFeedbackId('123456789012'));
  assert.equal(r.id, feedbackId('123456789012'));
  assert.equal(resolveFeedbackId(null, '').source, 'numeric');
});

test('parsed rows keep the opaque feedback id non-enumerable (never reaches the dataset)', () => {
  const commentId = b64('comment:6375219342552112_481627996424606');
  const payload = { data: { node: { comment_rendering_instance_for_feed_location: { comments: {
    edges: [{ node: { id: commentId, legacy_fbid: '481627996424606', body: { text: 'hi' }, feedback: { id: fb('pfbid0COMMENTdddd'), expansion_info: { expansion_token: 'tok' } } } }],
    page_info: { has_next_page: false },
  } } } } };
  const { comments } = parseCommentEdges(payload);
  assert.equal(comments.length, 1);
  assert.equal(Buffer.from(comments[0].feedback_id, 'base64').toString(), 'feedback:pfbid0COMMENTdddd');
  assert.equal(Object.keys(comments[0]).includes('feedback_id'), false);
  assert.equal('feedback_id' in { ...comments[0] }, false);
});

test('buildDepth1Vars prefers the comment own feedback id over the composed numeric one', () => {
  const own = fb('pfbid0COMMENTdddd');
  assert.equal(buildDepth1Vars('1', '2', 'tok', 'https://www.facebook.com/x/posts/1', null, null, own).id, own);
  assert.equal(buildDepth1Vars('1', '2', 'tok', 'https://www.facebook.com/x/posts/1').id, feedbackId('1', '2'));
});
