import { describe, it, expect } from 'vitest';
import { composeAwarenessForPrompt, type EntitySnapshot } from '../src/ai/entity';

const base: EntitySnapshot = {
  time: '09:30 Monday (UTC)',
  posture: 'morning, fresh',
  online: true,
  totalChats: 0,
  totalMessages: 0,
  totalFacts: 0,
  weekChats: 0,
  recentTopics: []
};

describe('composeAwarenessForPrompt', () => {
  it('always emits the header and the time/posture line', () => {
    const out = composeAwarenessForPrompt(base);
    expect(out.split('\n')[0]).toBe(
      'Your current awareness (always-on, derived locally — no API call):'
    );
    expect(out).toContain('- time: 09:30 Monday (UTC), posture: morning, fresh');
  });

  it('includes the chat and fact counts', () => {
    const out = composeAwarenessForPrompt({ ...base, totalChats: 3, totalFacts: 5 });
    expect(out).toContain('- you have 3 chats and 5 remembered facts about this user');
  });

  it('omits the browser-language line when language is absent', () => {
    expect(composeAwarenessForPrompt(base)).not.toContain('browser language');
  });

  it('includes the browser-language line when language is present', () => {
    const out = composeAwarenessForPrompt({ ...base, language: 'en-US' });
    expect(out).toContain("- user's browser language: en-US");
  });

  it('omits the week line when no chats touched this week', () => {
    expect(composeAwarenessForPrompt(base)).not.toContain('past week');
  });

  it('pluralizes the week line correctly', () => {
    expect(composeAwarenessForPrompt({ ...base, weekChats: 1 })).toContain(
      '- 1 chat touched this past week'
    );
    expect(composeAwarenessForPrompt({ ...base, weekChats: 3 })).toContain(
      '- 3 chats touched this past week'
    );
  });

  it('includes the current-session line when a session is active', () => {
    const out = composeAwarenessForPrompt({
      ...base,
      currentSession: { title: 'Test', modelId: 'gpt-4', messages: 7 }
    });
    expect(out).toContain('- this thread: "Test" on gpt-4, 7 messages so far');
  });

  it('omits the current-session line when none is active', () => {
    expect(composeAwarenessForPrompt(base)).not.toContain('this thread:');
  });

  it('adds the offline notice only when offline', () => {
    expect(composeAwarenessForPrompt(base)).not.toContain('offline');
    expect(composeAwarenessForPrompt({ ...base, online: false })).toContain(
      '- the user is offline right now'
    );
  });
});
