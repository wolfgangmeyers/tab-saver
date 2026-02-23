export type TabGroupColor =
  | 'grey' | 'blue' | 'red' | 'yellow' | 'green'
  | 'pink' | 'purple' | 'cyan' | 'orange';

export interface SavedTab {
  url: string;
  title: string;
  pinned: boolean;
  index: number; // tab's position within its window; used to sort tabs into original order at save time
}

export interface SavedGroup {
  title: string; // stable identifier for re-save matching
  color: TabGroupColor;
  collapsed: boolean;
  tabs: SavedTab[];
}

export interface SavedState {
  savedAt: number;
  ungroupedTabs: SavedTab[];
  groups: SavedGroup[];
}

