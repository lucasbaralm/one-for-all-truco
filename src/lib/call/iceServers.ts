// Servidores que ajudam o WebRTC a achar o caminho entre duas pessoas:
//  • STUN: só diz "seu endereço público é este" — de graça, e resolve a maioria das redes caseiras;
//  • TURN: RETRANSMITE o vídeo quando a conexão direta é impossível (4G, Wi-Fi de empresa, NAT rígido). Custa
//    banda, então exige credencial — e a credencial nunca vai pro navegador "pronta": a rota /api/turn gera uma
//    temporária por pessoa a partir de segredos que só o servidor conhece.
//
// Duas formas de configurar o TURN (variáveis de ambiente do Next, só no servidor):
//  • Cloudflare Realtime TURN: CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN (credenciais de 24 h por pessoa);
//  • qualquer TURN (coturn próprio, Metered, Twilio...): TURN_URLS (separadas por vírgula) + TURN_USERNAME + TURN_CREDENTIAL.
// Sem nenhuma das duas, a chamada usa só STUN: funciona pra maioria, e uma minoria de pares não conecta.

export interface IceEnv {
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
}

export interface IceResult {
  iceServers: RTCIceServer[];
  /** Tem TURN configurado (a chamada atravessa redes que o STUN sozinho não atravessa). */
  relay: boolean;
}

export const STUN_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

/** Validade das credenciais temporárias do Cloudflare (segundos): uma noite de jogo cabe folgada. */
export const CLOUDFLARE_TTL_S = 86_400;
const CLOUDFLARE_TIMEOUT_MS = 4000;

const urlsOf = (server: RTCIceServer): string[] => (Array.isArray(server.urls) ? server.urls : [server.urls]);
const isRelay = (server: RTCIceServer) => urlsOf(server).some((u) => /^turns?:/i.test(u));

async function fromCloudflare(env: IceEnv, fetchFn: typeof fetch): Promise<RTCIceServer[] | null> {
  const { CLOUDFLARE_TURN_KEY_ID: keyId, CLOUDFLARE_TURN_API_TOKEN: token } = env;
  if (!keyId || !token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUDFLARE_TIMEOUT_MS);
  try {
    const res = await fetchFn(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: CLOUDFLARE_TTL_S }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
    // A resposta já veio como lista; versões antigas da API devolviam um objeto só.
    const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    const servers = list.filter((s) => s && urlsOf(s).length > 0);
    return servers.some(isRelay) ? servers : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fromEnv(env: IceEnv): RTCIceServer[] | null {
  const urls = (env.TURN_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length === 0 || !env.TURN_USERNAME || !env.TURN_CREDENTIAL) return null;
  return [{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
}

/** Monta a lista de servidores da chamada. Nunca falha: se o TURN não responde, a chamada cai pro STUN. */
export async function buildIceServers(env: IceEnv, fetchFn: typeof fetch = fetch): Promise<IceResult> {
  const turn = (await fromCloudflare(env, fetchFn)) ?? fromEnv(env);
  if (!turn) return { iceServers: STUN_SERVERS, relay: false };
  return { iceServers: [...STUN_SERVERS, ...turn], relay: true };
}
