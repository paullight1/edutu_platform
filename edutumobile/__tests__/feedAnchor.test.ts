import { anchorFeedOrder } from '../packages/core/src/utils/feedAnchor';

interface FeedItem {
  id: string;
  match?: number;
}

const getId = (item: FeedItem) => item.id;

describe('anchorFeedOrder', () => {
  it('keeps the current relative order for ids present in both lists', () => {
    const current: FeedItem[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const incoming: FeedItem[] = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];

    expect(anchorFeedOrder(current, incoming, getId).map(getId)).toEqual(['a', 'b', 'c']);
  });

  it('adopts the incoming item data for kept ids', () => {
    const current: FeedItem[] = [
      { id: 'a', match: 10 },
      { id: 'b', match: 20 },
    ];
    const incoming: FeedItem[] = [
      { id: 'b', match: 88 },
      { id: 'a', match: 91 },
    ];

    expect(anchorFeedOrder(current, incoming, getId)).toEqual([
      { id: 'a', match: 91 },
      { id: 'b', match: 88 },
    ]);
  });

  it('inserts new ids at their incoming rank', () => {
    const current: FeedItem[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const incoming: FeedItem[] = [{ id: 'new-top' }, { id: 'c' }, { id: 'new-mid' }, { id: 'a' }, { id: 'b' }];

    expect(anchorFeedOrder(current, incoming, getId).map(getId)).toEqual([
      'new-top',
      'a',
      'new-mid',
      'b',
      'c',
    ]);
  });

  it('drops ids missing from incoming', () => {
    const current: FeedItem[] = [{ id: 'a' }, { id: 'stale' }, { id: 'b' }];
    const incoming: FeedItem[] = [{ id: 'b' }, { id: 'a' }];

    expect(anchorFeedOrder(current, incoming, getId).map(getId)).toEqual(['a', 'b']);
  });

  it('returns incoming verbatim when the current feed is empty and never mutates inputs', () => {
    const current: FeedItem[] = [];
    const incoming: FeedItem[] = [{ id: 'a' }, { id: 'b' }];

    const result = anchorFeedOrder(current, incoming, getId);

    expect(result.map(getId)).toEqual(['a', 'b']);
    expect(result).not.toBe(incoming);

    const anchoredCurrent: FeedItem[] = [{ id: 'b' }, { id: 'a' }];
    anchorFeedOrder(anchoredCurrent, incoming, getId);
    expect(anchoredCurrent.map(getId)).toEqual(['b', 'a']);
    expect(incoming.map(getId)).toEqual(['a', 'b']);
  });
});
