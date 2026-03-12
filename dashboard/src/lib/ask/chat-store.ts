const STORAGE_KEY = "nos-ask-chats";
const MAX_CHATS = 50;

export interface ChatEntry {
  id: string;
  title: string;
  createdAt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function readChats(): ChatEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeChats(chats: ChatEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
}

export function getChats(): ChatEntry[] {
  return readChats().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getChat(id: string): ChatEntry | undefined {
  return readChats().find((c) => c.id === id);
}

export function createChat(): ChatEntry {
  const chat: ChatEntry = {
    id: generateId(),
    title: "New chat",
    createdAt: new Date().toISOString(),
    messages: [],
  };
  const chats = readChats();
  chats.unshift(chat);
  writeChats(chats);
  return chat;
}

export function updateChat(
  id: string,
  update: Partial<Pick<ChatEntry, "title" | "messages">>
) {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === id);
  if (idx >= 0) {
    Object.assign(chats[idx], update);
    writeChats(chats);
  }
}

export function deleteChat(id: string) {
  const chats = readChats().filter((c) => c.id !== id);
  writeChats(chats);
}

/** Derive title from the first user message */
export function titleFromMessage(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 50) return trimmed;
  return trimmed.slice(0, 47) + "...";
}
