import { getDefaultIconSuggestions, searchIconSuggestions } from './icon-input.util';

describe('icon-input utilities', () => {
  const icons = [
    '10k',
    'account_balance',
    'article',
    'backup',
    'bug_report',
    'calendar_month',
    'check_circle',
    'code',
    'dns',
    'edit_note',
    'event_note',
    'favorite',
    'fitness_center',
    'groups',
    'rocket_launch',
    'task_alt',
    'terminal',
    'view_kanban',
  ];

  it('shows curated categories before alphabetical fallback for empty input', () => {
    const suggestions = getDefaultIconSuggestions(icons);

    expect(suggestions.slice(0, 3)).toEqual([
      { name: 'check_circle', category: 'Planning & tasks' },
      { name: 'task_alt', category: 'Planning & tasks' },
      { name: 'event_note', category: 'Planning & tasks' },
    ]);
    expect(suggestions.some((item) => item.name === '10k')).toBeTrue();
  });

  it('ranks direct starts-with matches before broader matches', () => {
    const suggestions = searchIconSuggestions(icons, 'task');

    expect(suggestions[0].name).toBe('task_alt');
  });

  it('finds icons by aliases', () => {
    expect(searchIconSuggestions(icons, 'money')[0].name).toBe('account_balance');
    expect(searchIconSuggestions(icons, 'homelab')[0].name).toBe('dns');
    expect(searchIconSuggestions(icons, 'social')[0].name).toBe('groups');
  });

  it('supports fuzzy abbreviation search', () => {
    const suggestions = searchIconSuggestions(icons, 'ckc');

    expect(suggestions[0].name).toBe('check_circle');
  });
});
