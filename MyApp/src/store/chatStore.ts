import {create} from 'zustand';

interface ChatState {
  // 현재 열려있는 채팅방 ID (읽음 처리 판단용)
  activeMatchId: string | null;
  setActiveMatchId: (id: string | null) => void;
}

const useChatStore = create<ChatState>(set => ({
  activeMatchId: null,
  setActiveMatchId: id => set({activeMatchId: id}),
}));

export default useChatStore;
