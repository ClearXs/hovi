// ASR service for speech-to-text using Web Speech API

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionType = any;

export interface AsrOptions {
  language?: string;
}

export interface AsrResult {
  text: string;
  confidence?: number;
}

// Web Speech API based recognition
export class WebSpeechRecognizer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private isListening: boolean = false;
  private onResult: ((text: string) => void) | null = null;
  private onEnd: (() => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  constructor() {
    // Check browser support - use any to avoid TypeScript errors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      return;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = "zh-CN";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onresult = (event: any) => {
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        }
      }

      if (finalTranscript) {
        this.onResult?.(finalTranscript);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onEnd?.();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onerror = (event: any) => {
      this.onError?.(event.error);
      this.isListening = false;
    };
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  setLanguage(language: string): void {
    if (this.recognition) {
      this.recognition.lang = language;
    }
  }

  start(
    onResult: (text: string) => void,
    onEnd?: () => void,
    onError?: (error: string) => void,
  ): void {
    if (!this.recognition) {
      onError?.("Speech recognition not supported");
      return;
    }

    this.onResult = onResult;
    this.onEnd = onEnd ?? (() => {});
    this.onError = onError ?? (() => {});

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (error) {
      this.isListening = false;
    }
  }

  stop(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  get listening(): boolean {
    return this.isListening;
  }
}

// Fallback: MediaRecorder based recording (for future whisper integration)
export class AsrRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.audioChunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: "audio/webm;codecs=opus",
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("No recording in progress"));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: "audio/webm" });
        this.cleanup();
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }
}

// Convert audio blob to text using gateway whisper RPC
export async function transcribeAudio(audioBlob: Blob, _options?: AsrOptions): Promise<AsrResult> {
  // TODO: Implement gateway whisper RPC call
  // For now, return empty result
  return {
    text: "",
    confidence: 0,
  };
}
