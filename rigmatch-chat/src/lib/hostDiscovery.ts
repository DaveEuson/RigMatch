import { DEFAULT_CAROLINE_SOCKET_URL } from "./carolineSocket";

export type DiscoveredHost = {
  url: string;
  label: string;
};

export type HostDiscoveryProgress = {
  scanned: number;
  total: number;
  found: DiscoveredHost[];
  currentUrl: string;
  phase: "scanning" | "complete";
};

export type HostDiscoveryOptions = {
  concurrency?: number;
  onProgress?: (progress: HostDiscoveryProgress) => void;
  seedUrls?: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function urlFromHost(host: string) {
  // 8080 = nginx (externally reachable). Node-RED's 1880 is typically firewall-blocked.
  return `ws://${host}:8080/ws/caroline`;
}

function parseHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function likelyLocalPrefixes(seedUrls: string[]) {
  const prefixes = ["192.168.1", "192.168.0", "10.0.0", "10.0.1", "172.16.0"];

  for (const url of seedUrls) {
    const host = parseHost(url);
    const parts = host.split(".");
    if (parts.length === 4 && isPrivateIpv4(host)) {
      prefixes.unshift(parts.slice(0, 3).join("."));
    }
  }

  return unique(prefixes);
}

function candidateUrls(defaultUrl: string, seedUrls: string[] = []) {
  const seeds = unique([defaultUrl, ...seedUrls]);
  const urls = [
    ...seeds,
    ...["caroline", "caroline.local", "raspberrypi", "raspberrypi.local", "jetson", "jetson.local", "steamdeck", "steamdeck.local", "localhost"].map(urlFromHost),
  ];
  const commonLastOctets = [2, 10, 20, 50, 100, 101, 150, 200, 254];
  const fullScanPrefixes = new Set<string>();

  for (const url of seeds) {
    const host = parseHost(url);
    const parts = host.split(".");
    if (parts.length === 4 && isPrivateIpv4(host)) {
      fullScanPrefixes.add(parts.slice(0, 3).join("."));
    }
  }

  for (const prefix of likelyLocalPrefixes(seeds)) {
    const octets = fullScanPrefixes.has(prefix)
      ? Array.from({ length: 254 }, (_, index) => index + 1)
      : commonLastOctets;
    for (const octet of octets) {
      urls.push(urlFromHost(`${prefix}.${octet}`));
    }
  }

  return unique(urls);
}

function probeWebSocket(url: string, timeoutMs = 900, signal?: AbortSignal): Promise<DiscoveredHost | null> {
  if (signal?.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;
    const abort = () => finish(null);

    const finish = (host: DiscoveredHost | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
      resolve(host);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });

    try {
      socket = new WebSocket(url);
    } catch {
      finish(null);
      return;
    }

    socket.onopen = () => {
      // Discovery point:
      // A future Node-RED flow can reply with host metadata here, but for now
      // a successful socket connection is enough to list the host.
      finish({
        url,
        label: parseHost(url) || url
      });
    };
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}

export async function discoverCarolineHosts(defaultUrl = DEFAULT_CAROLINE_SOCKET_URL, options: HostDiscoveryOptions = {}) {
  const candidates = candidateUrls(defaultUrl, options.seedUrls);
  const found: DiscoveredHost[] = [];
  let scanned = 0;
  let nextIndex = 0;
  const concurrency = Math.max(1, Math.min(options.concurrency || 24, candidates.length));
  const emit = (currentUrl: string, phase: HostDiscoveryProgress["phase"] = "scanning") => {
    options.onProgress?.({
      scanned,
      total: candidates.length,
      found: found.slice(),
      currentUrl,
      phase,
    });
  };

  emit("");

  async function worker() {
    while (!options.signal?.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= candidates.length) break;
      const url = candidates[index];
      emit(url);
      const result = await probeWebSocket(url, options.timeoutMs || 900, options.signal);
      scanned += 1;
      if (result && !found.some((host) => host.url === result.url)) {
        found.push(result);
      }
      emit(url);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  emit("", "complete");

  return found;
}
