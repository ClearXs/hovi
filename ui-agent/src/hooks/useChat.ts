import { useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { Message } from "@/types";

export const useChat = () => {
  const {
    chats,
    currentChatId,
    isLoading,
    createChat,
    deleteChat,
    setCurrentChat,
    addMessage,
    updateChatTitle,
    clearChats,
  } = useChatStore();

  const currentChat = chats.find((chat) => chat.id === currentChatId);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!currentChatId || !content.trim()) return;

      // Add user message
      addMessage(currentChatId, {
        role: "user",
        content: content.trim(),
        chatId: currentChatId,
      });

      try {
        // Send to API
        const response = await api.post<{ message: string }>("/api/chat", {
          message: content.trim(),
          chatId: currentChatId,
        });

        // Add assistant response
        addMessage(currentChatId, {
          role: "assistant",
          content: response.message,
          chatId: currentChatId,
        });

        // Update chat title if it's the first message
        const chat = chats.find((c) => c.id === currentChatId);
        if (chat && chat.messages.length <= 1) {
          const title = content.trim().split(" ").slice(0, 5).join(" ");
          updateChatTitle(currentChatId, title);
        }
      } catch (error) {
        if (error instanceof ApiError) {
          // Add error message
          addMessage(currentChatId, {
            role: "assistant",
            content: `Error: ${error.message}`,
            chatId: currentChatId,
          });
        } else {
          addMessage(currentChatId, {
            role: "assistant",
            content: "An unexpected error occurred. Please try again.",
            chatId: currentChatId,
          });
        }
      }
    },
    [currentChatId, addMessage, chats, updateChatTitle],
  );

  const createNewChat = useCallback(
    (title?: string) => {
      const chatId = createChat(title);
      setCurrentChat(chatId);
      return chatId;
    },
    [createChat, setCurrentChat],
  );

  const removeChat = useCallback(
    (chatId: string) => {
      deleteChat(chatId);
    },
    [deleteChat],
  );

  const selectChat = useCallback(
    (chatId: string) => {
      setCurrentChat(chatId);
    },
    [setCurrentChat],
  );

  return {
    chats,
    currentChat,
    currentChatId,
    isLoading,
    sendMessage,
    createNewChat,
    removeChat,
    selectChat,
    clearChats,
  };
};
