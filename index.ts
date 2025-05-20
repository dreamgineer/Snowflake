import { EventEmitter } from "events";

const GatewayIntents = Object.fromEntries(
  "#S,#_MEMBERS,#_BANS,#_EMOJIS_AND_STICKERS,#_INTEGRATIONS,#_WEBHOOKS,#_INVITES,#_VOICE_STATES,#_PRESENCES,#_$S,#_$_REACTIONS,#_$_TYPING,DIRECT_$S,DIRECT_$_REACTIONS,DIRECT_$_TYPING,$_CONTENT,#_SCHEDULED_EVENTS,AUTO_MODERATION_CONFIGURATION,AUTO_MODERATION_EXECUTION"
    .replace(/#/g, "GUILD")
    .replace(/\$/g, "MESSAGE")
    .split(",")
    .map((e, i) => [e, 1 << i]),
);
const stringify = JSON.stringify;

const methods = {
  get: "GET",
  create: "POST",
  post: "POST",
  delete: "DELETE",
  edit: "PATCH",
  patch: "PATCH",
  add: "PUT",
  put: "PUT",
} as const;

class Snowflake extends EventEmitter {
  private ws: WebSocket | undefined;
  private s: ClientSettings;
  private se: ClientSession = {};
  private st: ClientStore = {};
  constructor(settings: ClientSettings) {
    super();
    settings.api ??= "https://discord.com/api/";
    if (typeof settings.intents !== "number")
      settings.intents = settings.intents.reduce((a, b) => a + b);
    this.s = settings;
    if (!this.s.ws)
      fetch(this.s.api + "gateway")
        .then((e) => e.json())
        .then((e: any) => ((this.s.ws = e.url), this.connect()));
    else this.connect();
    const cache = Bun.file(import.meta.dir + "/specification.json");
    this.st.sp = cache.exists().then((exist) =>
      exist
        ? cache.json()
        : fetch(
            `https://raw.githubusercontent.com/discord/discord-api-spec/${settings.lock || "refs/heads/main"}/specs/openapi.json`,
          )
            .then((e) => e.json())
            .then((e: any) => e.paths),
    );
  }

  async connect() {
    if (this.ws && this.ws.readyState < 2) return;
    if (this.se.hbt) clearTimeout(this.se.hbt);
    const ws = (this.ws = new WebSocket(
      this.se.s?.resume_gateway_url || this.s.ws,
    ));
    const sid = this.se.s?.session_id;
    this.se = {};
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data) as GatewayEvent;
      this.emit(data.t, data.d);
      switch (data.op) {
        case 10:
          // Hello
          this.se.hb = data.d.heartbeat_interval;
          this.hb();
          ws.send(
            stringify({
              op: 2,
              d: {
                ...(sid
                  ? {
                      session_id: sid,
                    }
                  : {
                      properties: {
                        os: process.platform,
                        browser: "snowflake",
                        device: process.arch,
                      },
                    }),
                ...this.s,
                seq: this.se.seq,
              },
            }),
          );
          break;
        case 11:
          this.se.pong = true;
          this.se.ping = Date.now() - Number(this.se.start);
          break;
        //@ts-ignore
        case 1:
          this.se.s = data.d as Session;
        case 0:
          if (data.t === "READY")
            return (
              this.st.sp && this.st.sp.finally(() => this.emit("ready", data.d))
            );
          return this.emit(toCamelCase(data.t), data.d);
        case 7:
        case 9:
          this.emit("disconnected", data.d);
          if (data.d || data.op == 7) {
            this.ws?.close();
            this.connect();
          } else {
            this.emit(
              "error",
              new Error("Gateway issued disconnection without resume"),
            );
            this.emit("close", "Connection closed by gateway!");
            this.destroy();
          }
      }
      data.s && (this.se.seq = data.s);
    };
  }

  private hb() {
    if (!this.ws || this.ws.readyState > 1) return;
    this.se.pong = false;
    this.se.start = Date.now();
    this.ws.send(stringify({ op: 1, d: this.se.seq }));
    setTimeout(() => this.hb(), this.se.hb);
  }

  get ping() {
    return this.se.ping;
  }

  destroy() {
    if (this.se.hbt) clearTimeout(this.se.hbt);
    if (this.ws) this.ws.close();
  }
  
  private proxy(path: string[] = [], base: string, token: string) {
    const proxy = this.proxy;
    return new Proxy(
      async (payload: Record<string, any>, p: string[] = path) => {
        const { m: method, p: pathname } = this.parse(p, await this.st.sp as Specification);
        const url = `${base}/${pathname}`;
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: method === "GET" ? undefined : JSON.stringify(payload),
        });
        if (res.ok) return res.json();
        throw res.json();
      },
      {
        get(_, p) {
          return proxy([...path, String(p)], base, token);
        },
        set(t, p, v) {
          t(v, [...path, String(p), "post"]);
          return true;
        },
        deleteProperty(t, p) {
          t({}, [...path, String(p)]);
          return true;
        },
      },
    );
  }
  
  private parse(
    path: string[],
    specRoot: Specification,
    options: Record<string, any> = {}
  ) {
    const parts = [...path];
    const rawMethod = parts.at(-1)!;
    const method = methods[rawMethod as keyof typeof methods] || "GET";
  
    if (method !== "GET") parts.pop();
  
    // Resolve spec path, example: ["channels", "channel_id"] => "/channels/{channel_id}"
    const pathSpecKeyParts: string[] = [];
    const pathActualParts: string[] = [];
  
    for (let i = 0; i < parts.length; i++) {
      const val = `${parts[i]}`;
      const next = parts[i + 1];
  
      if (options?.[val] != null && /^[a-z_]+$/.test(val)) {
        pathSpecKeyParts.push(`{${val}}`);
        pathActualParts.push(encodeURIComponent(String(options[val])));
      } else if (next && options?.[next] != null && /^[a-z_]+$/.test(next)) {
        pathSpecKeyParts.push(val, `{${next}}`);
        pathActualParts.push(val, encodeURIComponent(String(options[next])));
        i++; // skip next
      } else {
        pathSpecKeyParts.push(val);
        pathActualParts.push(val);
      }
    }
  
    const specPath = `/${pathSpecKeyParts.join("/")}`;
    const finalPathname = `/${pathActualParts.join("/")}`;
  
    const spec = specRoot[specPath];
    if (!spec) throw new Error(`Path not found in spec: ${specPath}`);
  
    const methodSpec = spec[method.toLowerCase() as "get" | "create" | "post" | "delete" | "patch"];
    if (!methodSpec) throw new Error(`Method ${method} not supported for ${specPath}`);
  
    // Validate required path parameters
    const requiredParams = (spec.parameters || []).filter(
      (p: any) => p.in === "path" && p.required
    );
  
    for (const param of requiredParams) {
      if (!(param.name in (options || {}))) {
        throw new Error(`Missing required path parameter: ${param.name}`);
      }
    }
  
    return {
      m: method,
      p: finalPathname
    };
  }
}

interface ClientSettings {
  token: string; // Bot token
  intents: number | number[]; // Intents
  lock: string; // Specification version lock
  api: string; // Base API URL
  ws: string; // WebSocket URL
}

interface ClientSession {
  hb?: number; // Heartbeat interval
  hbt?: Timer; // Heartbeat timer
  seq?: number; // Last sequence number
  start?: number; // Last heartbeat time
  pong?: boolean; // Last heartbeat pong
  ping?: number; // Last heartbeat round-trip time
  s?: Session; // Session
}

interface ClientStore {
  sp?: Promise<Specification>;
}

interface Session {
  v: number; // API Version
  user: any; // Bot user objcet
  guilds: any; // Array of unavailable guilds
  session_id: string; // Used for resuming connections
  resume_gateway_url: string; // Gateway URL for resuming connections
  application: {
    // Partial application object
    id: string;
    flag: string;
  };
}

interface GatewayEvent {
  op: number; // Opcode
  d: Record<string, any>; // Data
  s: number; // Sequence number
  t: string; // Event name
}

type Specification = Record<
  string,
  Record<
    "get" | "post" | "delete" | "create" | "patch",
    {
      operationId: string;
      requestBody?: { content: { "application/json": { schema: string } } };
      responses: Record<
        string,
        {
          content: {
            "application/json": {
              schema: string;
            };
          };
        }
      >;
    }
  > & {
    parameters: {name: string, required: boolean, in: string}[]
  }
>;

function toCamelCase(str: string) {
  return str
    .split("_")
    .map(function (word, index) {
      // If it is the first word make sure to lowercase all the chars.
      if (index == 0) {
        return word.toLowerCase();
      }
      // If it is not the first word only upper case the first char and lowercase the rest.
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
}

export { Snowflake, Snowflake as default, GatewayIntents };
