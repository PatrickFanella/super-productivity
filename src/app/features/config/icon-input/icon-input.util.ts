export interface IconSuggestion {
  name: string;
  category: string;
}

interface IconCategory {
  label: string;
  icons: string[];
}

const DEFAULT_ICON_LIMIT = 120;
const SEARCH_ICON_LIMIT = 150;

export const COMMON_ICON_CATEGORIES: IconCategory[] = [
  {
    label: 'Planning & tasks',
    icons: [
      'check_circle',
      'task_alt',
      'done_all',
      'assignment',
      'assignment_turned_in',
      'event_note',
      'edit_calendar',
      'calendar_month',
      'schedule',
      'today',
      'pending_actions',
      'playlist_add_check',
    ],
  },
  {
    label: 'Work & projects',
    icons: [
      'folder',
      'work',
      'business_center',
      'category',
      'dashboard',
      'view_kanban',
      'account_tree',
      'hub',
      'rocket_launch',
      'flag',
      'priority_high',
      'bookmark',
    ],
  },
  {
    label: 'Development & homelab',
    icons: [
      'code',
      'terminal',
      'bug_report',
      'integration_instructions',
      'memory',
      'dns',
      'storage',
      'router',
      'cloud',
      'backup',
      'security',
      'monitoring',
    ],
  },
  {
    label: 'Content & media',
    icons: [
      'edit_note',
      'article',
      'draw',
      'palette',
      'auto_awesome',
      'movie',
      'videocam',
      'music_note',
      'photo_camera',
      'image',
      'campaign',
      'publish',
    ],
  },
  {
    label: 'People & life',
    icons: [
      'person',
      'groups',
      'diversity_3',
      'favorite',
      'favorite_border',
      'self_improvement',
      'fitness_center',
      'restaurant',
      'home',
      'cleaning_services',
      'pets',
      'travel_explore',
    ],
  },
  {
    label: 'Finance & admin',
    icons: [
      'account_balance',
      'account_balance_wallet',
      'payments',
      'receipt_long',
      'savings',
      'credit_card',
      'request_quote',
      'admin_panel_settings',
      'verified_user',
      'lock',
      'key',
      'inventory_2',
    ],
  },
];

const ICON_ALIASES: Record<string, string[]> = {
  account_balance: ['bank', 'finance', 'money', 'budget', 'tax'],
  account_balance_wallet: ['wallet', 'finance', 'money', 'budget'],
  account_tree: ['project', 'dependency', 'tree', 'plan'],
  admin_panel_settings: ['admin', 'settings', 'security', 'ops'],
  article: ['blog', 'post', 'writing', 'content'],
  auto_awesome: ['ai', 'magic', 'polish', 'creative'],
  backup: ['restore', 'snapshot', 'sync', 'homelab'],
  bug_report: ['bug', 'debug', 'issue', 'test'],
  campaign: ['marketing', 'launch', 'announcement', 'social'],
  calendar_month: ['calendar', 'month', 'schedule', 'plan'],
  check_circle: ['done', 'complete', 'success', 'ok'],
  cleaning_services: ['chores', 'clean', 'home', 'tidy'],
  code: ['dev', 'development', 'programming', 'software'],
  dns: ['server', 'homelab', 'network', 'domain'],
  edit_calendar: ['calendar', 'schedule', 'plan', 'event'],
  edit_note: ['write', 'content', 'notes', 'draft'],
  event_note: ['planning', 'schedule', 'calendar', 'agenda'],
  favorite: ['health', 'heart', 'love', 'care'],
  fitness_center: ['health', 'body', 'exercise', 'workout'],
  groups: ['social', 'people', 'community', 'relationships'],
  hub: ['network', 'connected', 'integrations', 'systems'],
  integration_instructions: ['api', 'dev', 'integration', 'automation'],
  inventory_2: ['archive', 'storage', 'box', 'admin'],
  key: ['password', 'secret', 'auth', 'security'],
  memory: ['gpu', 'cpu', 'hardware', 'computer'],
  monitoring: ['metrics', 'observability', 'health', 'status'],
  payments: ['money', 'finance', 'cash', 'income'],
  pending_actions: ['todo', 'waiting', 'backlog', 'tasks'],
  receipt_long: ['expense', 'bill', 'invoice', 'finance'],
  rocket_launch: ['launch', 'release', 'ship', 'startup'],
  router: ['network', 'wifi', 'homelab', 'internet'],
  savings: ['finance', 'budget', 'money', 'save'],
  self_improvement: ['reflect', 'meditate', 'mindfulness', 'health'],
  storage: ['disk', 'database', 'backup', 'server'],
  task_alt: ['task', 'done', 'complete', 'todo'],
  terminal: ['cli', 'shell', 'dev', 'command'],
  verified_user: ['security', 'audit', 'safe', 'admin'],
  view_kanban: ['kanban', 'board', 'project', 'tasks'],
};

const normalized = (value: string): string =>
  value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

const compact = (value: string): string => normalized(value).replace(/\s/g, '');

const matchesSubsequence = (needle: string, haystack: string): boolean => {
  let haystackIndex = 0;
  for (const char of needle) {
    haystackIndex = haystack.indexOf(char, haystackIndex);
    if (haystackIndex === -1) return false;
    haystackIndex++;
  }
  return true;
};

const curatedRank = new Map<string, number>();
COMMON_ICON_CATEGORIES.flatMap((category) => category.icons).forEach((icon, index) => {
  if (!curatedRank.has(icon)) curatedRank.set(icon, index);
});

const getSearchText = (icon: string): string =>
  normalized([icon, ...(ICON_ALIASES[icon] || [])].join(' '));

export const getDefaultIconSuggestions = (icons: string[]): IconSuggestion[] => {
  const available = new Set(icons);
  const used = new Set<string>();
  const suggestions: IconSuggestion[] = [];

  for (const category of COMMON_ICON_CATEGORIES) {
    for (const icon of category.icons) {
      if (!available.has(icon) || used.has(icon)) continue;
      used.add(icon);
      suggestions.push({ name: icon, category: category.label });
    }
  }

  for (const icon of icons) {
    if (suggestions.length >= DEFAULT_ICON_LIMIT) break;
    if (used.has(icon)) continue;
    used.add(icon);
    suggestions.push({ name: icon, category: 'More icons' });
  }

  return suggestions;
};

export const searchIconSuggestions = (
  icons: string[],
  query: string,
): IconSuggestion[] => {
  const q = normalized(query);
  if (!q) return getDefaultIconSuggestions(icons);

  const queryTokens = q.split(' ').filter(Boolean);
  const queryCompact = compact(q);

  return icons
    .map((icon, index) => {
      const iconText = normalized(icon);
      const iconCompact = compact(icon);
      const searchText = getSearchText(icon);
      const searchCompact = compact(searchText);

      let score = Number.POSITIVE_INFINITY;
      if (iconText === q) score = 0;
      else if (iconText.startsWith(q)) score = 10;
      else if (iconText.split(' ').some((part) => part.startsWith(q))) score = 20;
      else if (iconText.includes(q)) score = 30;
      else if (queryTokens.every((token) => iconText.includes(token))) score = 40;
      else if (queryTokens.every((token) => searchText.includes(token))) score = 50;
      else if (matchesSubsequence(queryCompact, iconCompact)) score = 70;
      else if (matchesSubsequence(queryCompact, searchCompact)) score = 90;

      if (!Number.isFinite(score)) return null;

      const rank = curatedRank.get(icon);
      if (rank !== undefined) score -= 2;

      return {
        icon,
        score,
        rank: rank ?? Number.MAX_SAFE_INTEGER,
        index,
      };
    })
    .filter(
      (item): item is { icon: string; score: number; rank: number; index: number } =>
        !!item,
    )
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.rank - b.rank ||
        a.icon.localeCompare(b.icon) ||
        a.index - b.index,
    )
    .slice(0, SEARCH_ICON_LIMIT)
    .map((item) => ({
      name: item.icon,
      category: ICON_ALIASES[item.icon]?.length ? 'Best match' : 'Material Symbols',
    }));
};
