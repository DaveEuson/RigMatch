import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { ChatMessage } from '../types';

/**
 * Floating chat panel for talking to the selected local model. Self-contained:
 * it only takes props (transcript, input value, callbacks) and renders against
 * global CSS. Vision models get an image-attach button; a running live show
 * lifts the dock above the mini-bar via the `has-live-bar` modifier.
 */
export function ChatDock({
  agentName,
  model,
  messages,
  value,
  onChange,
  onClose,
  onSend,
  liveShowActive,
  canSendImages,
  pendingImage,
  onAttachImage,
}: {
  agentName: string;
  model: string;
  messages: ChatMessage[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  liveShowActive?: boolean;
  canSendImages?: boolean;
  pendingImage?: string | null;
  onAttachImage?: (dataUrl: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (!file || !onAttachImage) return;
    if (!file.type.startsWith('image/')) return;
    // Guard against huge files: Ollama vision models choke on very large inputs,
    // and the base64 lives in memory until sent. Cap at ~8 MB.
    if (file.size > 8 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onAttachImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <aside className={`chat-dock${liveShowActive ? ' has-live-bar' : ''}`} aria-label={`Chat with ${agentName}`}>
      <div className="chat-title">
        <div>
          <strong>{agentName}</strong>
          <span>{model === agentName ? 'Local model chat' : model}</span>
        </div>
        <button type="button" className="mini-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="chat-stream">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.images?.map((src, index) => (
              <img key={index} src={src} alt="Attached" className="chat-message-image" />
            ))}
            {message.content && <span>{message.content}</span>}
          </div>
        ))}
      </div>
      {pendingImage && (
        <div className="chat-attachment" aria-label="Attached image">
          <img src={pendingImage} alt="Attachment preview" />
          <button type="button" className="chat-attachment-remove" onClick={() => onAttachImage?.(null)} aria-label="Remove image">
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend();
        }}
      >
        {canSendImages && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="chat-file-input"
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach an image for this vision model to read"
              aria-label="Attach an image"
            >
              <ImagePlus aria-hidden="true" />
            </button>
          </>
        )}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={canSendImages ? 'Ask about an image, or just chat...' : 'Ask the matched local agent...'}
          aria-label="Message"
        />
        <button type="submit" className="primary-button">
          Send
        </button>
      </form>
    </aside>
  );
}
