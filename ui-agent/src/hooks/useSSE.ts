import { useEffect, useRef, useCallback } from "react";

export interface SSEMessage {
  type: string;
  data: any;
}

export const useSSE = (
  url: string,
  onMessage: (message: SSEMessage) => void,
  onError?: (error: Event) => void,
) => {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000;

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      eventSourceRef.current = new EventSource(url);

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
          reconnectAttemptsRef.current = 0; // Reset on successful message
        } catch (error) {
          // Ignore parse errors
        }
      };

      eventSourceRef.current.onerror = (error) => {
        if (onError) {
          onError(error);
        }

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay * reconnectAttemptsRef.current);
        }
      };

      eventSourceRef.current.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };
    } catch (error) {
      // Failed to create SSE connection
    }
  }, [url, onMessage, onError]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connect,
    disconnect,
    isConnected: !!eventSourceRef.current,
  };
};
