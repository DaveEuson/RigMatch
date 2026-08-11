import { useRef } from 'react';
import { ImagePlus, Mic, X } from 'lucide-react';
import type { ChatAttachment, ChatMessage } from '../types';

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
  canSendAudio,
  pendingAttachment,
  onAttach,
  availableModels,
  onModelChange,
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
  /** Models reporting the `audio` capability can be sent a recording. */
  canSendAudio?: boolean;
  pendingAttachment?: ChatAttachment | null;
  onAttach?: (attachment: ChatAttachment | null) => void;
  /** Installed models the user can switch to without leaving the drawer. */
  availableModels?: string[];
  onModelChange?: (model: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (!file || !onAttach) return;
    const kind = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('audio/') ? 'audio'
        : null;
    if (!kind) return;
    if (kind === 'image' && !canSendImages) return;
    if (kind === 'audio' && !canSendAudio) return;
    // Guard against huge files: models choke on very large inputs, and the
    // base64 lives in memory until sent. Audio gets more room because a minute
    // of speech is already several megabytes.
    const limit = (kind === 'audio' ? 25 : 8) * 1024 * 1024;
    if (file.size > limit) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onAttach({ dataUrl: reader.result, kind, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const accept = [canSendImages ? 'image/*' : '', canSendAudio ? 'audio/*' : ''].filter(Boolean).join(',');

  return (
    <aside className={`chat-dock${liveShowActive ? ' has-live-bar' : ''}`} aria-label={`Chat with ${agentName}`}>
      <div className="chat-title">
        <div>
          <strong>{agentName}</strong>
          {/* The drawer opened on whichever model happened to be selected, with
              no way to change it and no indication of who you were talking to. */}
          {availableModels && availableModels.length > 1 && onModelChange ? (
            <label className="chat-model-switch">
              <span className="sr-only">Model to chat with</span>
              <select value={model} onChange={(event) => onModelChange(event.target.value)}>
                {availableModels.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
          ) : (
            <span>{model === agentName ? 'Local model chat' : model}</span>
          )}
        </div>
        <button type="button" className="mini-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="chat-stream">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.images?.map((src, index) => (message.attachmentKind === 'audio'
              // A waveform cannot be shown, but the recording can be played
              // back — otherwise a sent message gives no sign of what was in it.
              ? <audio key={index} controls src={src} className="chat-message-audio" />
              : <img key={index} src={src} alt="Attached" className="chat-message-image" />
            ))}
            {message.content && <span>{message.content}</span>}
          </div>
        ))}
      </div>
      {pendingAttachment && (
        <div className="chat-attachment" aria-label={pendingAttachment.kind === 'audio' ? 'Attached recording' : 'Attached image'}>
          {pendingAttachment.kind === 'audio' ? (
            // Nothing to preview, so say what it is. Playable, because sending
            // the wrong recording is otherwise invisible until the answer.
            <div className="chat-attachment-audio">
              <Mic aria-hidden="true" />
              <span title={pendingAttachment.name}>{pendingAttachment.name || 'Recording'}</span>
              <audio controls src={pendingAttachment.dataUrl} />
            </div>
          ) : (
            <img src={pendingAttachment.dataUrl} alt="Attachment preview" />
          )}
          <button type="button" className="chat-attachment-remove" onClick={() => onAttach?.(null)} aria-label="Remove attachment">
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
        {(canSendImages || canSendAudio) && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
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
