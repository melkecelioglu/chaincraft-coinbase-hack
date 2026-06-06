import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ChatArea } from '@/components/chat/chat-area';

export default function ChatPage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full">
      <ChatSidebar />
      <ChatArea />
    </div>
  );
}
