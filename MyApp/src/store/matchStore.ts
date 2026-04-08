import {create} from 'zustand';

export interface ProfileData {
  uid: string;
  nickname: string;
  birth_year: number;
  gender: string;
  bio: string;
  photos: string[];
  hobby_tags: string[];
  activity_area: string;
  completeness: number;
  job?: string;
  job_field?: string;
  ideal_type_tags?: string[];
  location?: {lat: number; lng: number} | null;
  location_fuzzy?: {lat: number; lng: number} | null;
}

export interface FilterSettings {
  minAge: number;
  maxAge: number;
  maxDistance: number; // km (표시용, 실제 거리 필터는 MATCH-03에서 구현)
  hobbyTags: string[]; // 빈 배열 = 전체 허용
}

export const DEFAULT_FILTER: FilterSettings = {
  minAge: 18,
  maxAge: 60,
  maxDistance: 30,
  hobbyTags: [],
};

interface MatchState {
  // 세션 중 스와이프한 uid 캐시 (Firestore 중복 조회 방지)
  swipedUids: string[];
  addSwipedUid: (uid: string) => void;
  removeSwipedUid: (uid: string) => void;

  // 되돌리기: 마지막 스와이프 문서 ID + 날짜
  lastSwipeDocId: string | null;
  setLastSwipeDocId: (id: string | null) => void;
  undoUsedDate: string | null; // 'YYYY-MM-DD'
  markUndoUsed: () => void;
  canUndo: () => boolean;

  // 필터 설정
  filter: FilterSettings;
  setFilter: (filter: FilterSettings) => void;
  resetFilter: () => void;

  // 탐색 버튼 표시 여부
  showButtons: boolean;
  setShowButtons: (v: boolean) => void;
}

const useMatchStore = create<MatchState>((set, get) => ({
  swipedUids: [],
  addSwipedUid: uid =>
    set(state => ({swipedUids: [...state.swipedUids, uid]})),
  removeSwipedUid: uid =>
    set(state => ({swipedUids: state.swipedUids.filter(id => id !== uid)})),

  lastSwipeDocId: null,
  setLastSwipeDocId: id => set({lastSwipeDocId: id}),

  undoUsedDate: null,
  markUndoUsed: () => {
    const today = new Date().toISOString().split('T')[0];
    set({undoUsedDate: today});
  },
  canUndo: () => {
    const today = new Date().toISOString().split('T')[0];
    return get().undoUsedDate !== today;
  },

  filter: {...DEFAULT_FILTER},
  setFilter: filter => set({filter}),
  resetFilter: () => set({filter: {...DEFAULT_FILTER}}),

  showButtons: true,
  setShowButtons: v => set({showButtons: v}),
}));

export default useMatchStore;
