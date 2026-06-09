// Port 8080 = nginx proxy (externally accessible). Port 1880 = Node-RED direct (firewall-blocked).
export const DEFAULT_CAROLINE_SOCKET_URL = "ws://caroline.local:8080/ws/caroline";

export type CarolineSocketStatus = "connecting" | "online" | "offline" | "rejected";

export type CarolineSocketMessage = {
  text: string;
  type?: string;
  raw: unknown;
  role?: "assistant" | "user" | "system";
  source?: string;
  clientId?: string;
  clientName?: string;
  userName?: string;
  aiName?: string;
  deviceType?: string;
  origin?: string;
  agentProfile?: string;
  personalityHint?: string;
};

export type CompanionClientInfo = {
  clientId: string;
  displayName: string;
  userName?: string;
  pairingCode?: string;
};

export type DocumentDropPayload = {
  name: string;
  type: string;
  size: number;
  kind: "text" | "data" | "code";
  excerpt: string;
  truncated: boolean;
};

export type ScreenAskPayload = {
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: string;
};

type CarolineSocketOptions = {
  url?: string;
  // Getter so the socket always reads current settings without being recreated on name/code changes
  getClient: () => CompanionClientInfo;
  onStatusChange?: (status: CarolineSocketStatus) => void;
  onMessage?: (message: CarolineSocketMessage) => void;
};

const COMPANION_APP_VERSION = "0.1.21";
const pairingResyncAttempts = new Set<string>();

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizePairingCode(value: string | undefined) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function parseIncomingMessage(data: unknown): CarolineSocketMessage | null {
  if (typeof data !== "string") {
    return { text: String(data ?? ""), raw: data };
  }

  try {
    const parsed = JSON.parse(data) as unknown;

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;

      const msgType = typeof record.type === "string" ? record.type : undefined;

      if (
        msgType === "system_stats" ||
        msgType === "client_heartbeat" ||
        msgType === "assistant_typing" ||
        msgType === "settings_changed" ||
        msgType === "settings_confirmed"
      ) {
        return null;
      }

      if (msgType === "host_hello") {
        const hostName =
          (typeof record.aiName === "string" ? record.aiName : null) ??
          (typeof record.name === "string" ? record.name : null) ??
          "Caroline";

        return {
          text: hostName,
          type: msgType,
          raw: parsed,
          role: "system",
          aiName: stringField(record, "aiName") || hostName,
          userName: stringField(record, "userName"),
          deviceType: stringField(record, "deviceType") || stringField(record, "hostDeviceType"),
          agentProfile: stringField(record, "agentProfile"),
          personalityHint: stringField(record, "personalityHint"),
        };
      }

      if (msgType === "pairing_rejected") {
        const reason = stringField(record, "reason") || "Pairing code rejected";
        return { text: reason, type: msgType, raw: parsed, role: "system" };
      }

      if (msgType === "conversation_event") {
        const roleValue = stringField(record, "role");
        const role =
          roleValue === "user"
            ? "user"
            : roleValue === "assistant"
            ? "assistant"
            : "system";
        const text =
          stringField(record, "content") ||
          stringField(record, "message") ||
          stringField(record, "text");

        if (!text) return null;

        return {
          text,
          type: msgType,
          raw: parsed,
          role,
          source: stringField(record, "source"),
          clientId: stringField(record, "clientId"),
          clientName: stringField(record, "clientName"),
          userName: stringField(record, "userName"),
          aiName: stringField(record, "aiName"),
          origin: stringField(record, "origin"),
        };
      }

      if (msgType === "user_discord" || msgType === "user_telegram") {
        const text =
          stringField(record, "content") ||
          stringField(record, "message") ||
          stringField(record, "text");

        if (!text) return null;

        return {
          text,
          type: msgType,
          raw: parsed,
          role: "user",
          source: msgType === "user_discord" ? "discord" : "telegram",
          userName: stringField(record, "userName"),
        };
      }

      if (msgType === "todo_update" || msgType === "calendar_update") return null;

      if (msgType?.startsWith("spotify_")) {
        const text =
          (typeof record.reply === "string" ? record.reply : null) ??
          (typeof record.message === "string" ? record.message : null) ??
          (typeof record.content === "string" ? record.content : null) ??
          (typeof record.text === "string" ? record.text : null) ??
          msgType.replace(/_/g, " ");

        return { text: `🎵 ${text}`, type: msgType, raw: parsed };
      }

      const text =
        (typeof record.reply === "string" ? record.reply : null) ??
        (typeof record.message === "string" ? record.message : null) ??
        (typeof record.content === "string" ? record.content : null) ??
        (typeof record.text === "string" ? record.text : null) ??
        data;

      return {
        text: String(text),
        type: msgType,
        raw: parsed,
        role: msgType === "reply" ? "assistant" : undefined,
        source: stringField(record, "source"),
        aiName: stringField(record, "aiName"),
        origin: stringField(record, "origin"),
      };
    }

    return { text: String(parsed), raw: parsed };
  } catch {
    return { text: data, raw: data };
  }
}

export function createCarolineSocket(options: CarolineSocketOptions) {
  let socket: WebSocket | null = null;
  let heartbeatTimer: number | undefined;
  let rejectedClose = false;
  let connectionToken = 0;
  const url = options.url || DEFAULT_CAROLINE_SOCKET_URL;

  function setStatus(status: CarolineSocketStatus) {
    options.onStatusChange?.(status);
  }

  function connect() {
    disconnect();
    connectionToken += 1;
    const token = connectionToken;
    setStatus("connecting");

    try {
      socket = new WebSocket(url);
    } catch {
      setStatus("offline");
      return;
    }

    socket.onopen = () => {
      if (token !== connectionToken) return;
      rejectedClose = false;
      setStatus("online");
      announceClient();
      heartbeatTimer = window.setInterval(sendHeartbeat, 30_000);
    };
    socket.onclose = () => {
      if (token !== connectionToken) return;
      clearHeartbeat();
      setStatus(rejectedClose ? "rejected" : "offline");
    };
    socket.onerror = () => {
      if (token === connectionToken) setStatus("offline");
    };
    socket.onmessage = (event) => {
      if (token !== connectionToken) return;
      const msg = parseIncomingMessage(event.data);
      if (!msg) return;

      // Node-RED host sends { type: "pairing_rejected", reason: "..." } for a wrong code.
      // Disconnect immediately so the user knows to fix the code in Settings.
      if (msg.type === "pairing_rejected") {
        if (tryResyncPairingCode(token)) return;
        clearHeartbeat();
        rejectedClose = true;
        socket?.close();
        setStatus("rejected");
      }
      if (msg.type === "host_hello") {
        const client = options.getClient();
        pairingResyncAttempts.delete(pairingResyncKey(normalizePairingCode(client.pairingCode)));
      }

      options.onMessage?.(msg);
    };
  }

  function tryResyncPairingCode(token: number) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    const client = options.getClient();
    const pairingCode = normalizePairingCode(client.pairingCode);
    const attemptKey = pairingResyncKey(pairingCode);
    if (pairingCode.length !== 6 || pairingResyncAttempts.has(attemptKey)) return false;

    pairingResyncAttempts.add(attemptKey);
    clearHeartbeat();
    socket.send(
      JSON.stringify({
        type: "settings_update",
        source: "caroline-companion",
        clientId: client.clientId,
        clientName: client.displayName,
        userName: client.userName,
        companionPairingCode: pairingCode,
        appVersion: COMPANION_APP_VERSION,
      })
    );
    setStatus("connecting");
    options.onMessage?.({
      text: "Pairing code was out of sync. Updating the kiosk and retrying once.",
      type: "pairing_resync",
      raw: { pairingCode },
      role: "system",
    });
    window.setTimeout(() => {
      if (token !== connectionToken) return;
      connect();
    }, 700);
    return true;
  }

  function pairingResyncKey(pairingCode: string) {
    return `${url.trim()}::${pairingCode}`;
  }

  function send(text: string) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    const client = options.getClient();
    // Node-RED hook: route this "chat" message into your LLM/AI flow and reply via the socket.
    socket.send(
      JSON.stringify({
        type: "chat",
        message: text,
        source: "caroline-companion",
        clientId: client.clientId,
        clientName: client.displayName,
        userName: client.userName,
      })
    );

    return true;
  }

  function sendDocument(document: DocumentDropPayload, prompt?: string) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    const client = options.getClient();
    socket.send(
      JSON.stringify({
        type: "document_drop",
        source: "caroline-companion",
        clientId: client.clientId,
        clientName: client.displayName,
        userName: client.userName,
        message:
          prompt?.trim() ||
          `Please review the attached document ${document.name}. Summarize what matters and suggest one useful next step. Do not save this as beta feedback.`,
        document,
      })
    );

    return true;
  }

  function sendScreenAsk(screen: ScreenAskPayload, prompt?: string) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    const client = options.getClient();
    socket.send(
      JSON.stringify({
        type: "screen_ask",
        source: "caroline-companion",
        clientId: client.clientId,
        clientName: client.displayName,
        userName: client.userName,
        message: prompt?.trim() || "What should I notice on this screen?",
        screen,
      })
    );

    return true;
  }

  function announceClient() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const client = options.getClient();
    // Node-RED host visibility: on receiving "client_hello", validate pairingCode and
    // store clientId/displayName in flow context so the kiosk can list connected companions.
    // If pairingCode is wrong, reply with { type: "pairing_rejected", reason: "Bad code" }.
    socket.send(
      JSON.stringify({
        type: "client_hello",
        source: "caroline-companion",
        clientId: client.clientId,
        clientName: client.displayName,
        userName: client.userName,
        pairingCode: client.pairingCode || undefined,
        appVersion: COMPANION_APP_VERSION,
      })
    );
  }

  function sendHeartbeat() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const client = options.getClient();
    // Node-RED: refresh the connected-clients list on each heartbeat (every 30s).
    socket.send(
      JSON.stringify({
        type: "client_heartbeat",
        source: "caroline-companion",
        clientId: client.clientId,
        clientName: client.displayName,
        userName: client.userName,
        pairingCode: client.pairingCode || undefined,
        sentAt: new Date().toISOString(),
      })
    );
  }

  function clearHeartbeat() {
    if (heartbeatTimer !== undefined) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  }

  function disconnect() {
    connectionToken += 1;
    clearHeartbeat();
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  return { connect, disconnect, send, sendDocument, sendScreenAsk, get url() { return url; } };
}
