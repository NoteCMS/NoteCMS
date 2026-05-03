import { describe, expect, it } from 'vitest';
import { assertPublishGithubIds, parseGithubRepoUrl } from '../site/publish-webhook-service.js';

describe('parseGithubRepoUrl', () => {
  it('parses https github URL', () => {
    expect(parseGithubRepoUrl('https://github.com/octocat/Hello-World')).toEqual({
      owner: 'octocat',
      repo: 'Hello-World',
    });
  });

  it('parses .git and www', () => {
    expect(parseGithubRepoUrl('https://www.github.com/myorg/my-repo.git')).toEqual({
      owner: 'myorg',
      repo: 'my-repo',
    });
  });

  it('parses owner/repo shorthand', () => {
    expect(parseGithubRepoUrl('foo/bar-baz')).toEqual({ owner: 'foo', repo: 'bar-baz' });
  });

  it('rejects empty', () => {
    expect(() => parseGithubRepoUrl('')).toThrow(/empty/i);
  });
});

describe('assertPublishGithubIds', () => {
  it('accepts typical owner, repo, and event type', () => {
    expect(() => assertPublishGithubIds('octocat', 'hello-world', 'notecms_publish')).not.toThrow();
  });

  it('rejects invalid owner', () => {
    expect(() => assertPublishGithubIds('bad/name', 'repo', 'evt')).toThrow(/owner/i);
  });

  it('rejects invalid repo', () => {
    expect(() => assertPublishGithubIds('octocat', 'bad repo', 'evt')).toThrow(/repository/i);
  });

  it('rejects invalid event type', () => {
    expect(() => assertPublishGithubIds('octocat', 'repo', 'bad type')).toThrow(/event type/i);
  });
});
