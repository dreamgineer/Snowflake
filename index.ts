import { EventEmitter } from "events";

const GatewayIntents: Intents = Object.fromEntries(
  "#S,#_MEMBERS,#_BANS,#_EMOJIS_AND_STICKERS,#_INTEGRATIONS,#_WEBHOOKS,#_INVITES,#_VOICE_STATES,#_PRESENCES,#_$S,#_$_REACTIONS,#_$_TYPING,DIRECT_$S,DIRECT_$_REACTIONS,DIRECT_$_TYPING,$_CONTENT,#_SCHEDULED_EVENTS,AUTO_MODERATION_CONFIGURATION,AUTO_MODERATION_EXECUTION"
    .replace(/#/g, "GUILD")
    .replace(/\$/g, "MESSAGE")
    .split(",")
    .map((e, i) => [e, 1 << i])
) as Intents;
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
  readonly rest: RestCall;
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
            `https://raw.githubusercontent.com/discord/discord-api-spec/${
              settings.lock || "refs/heads/main"
            }/specs/openapi.json`
          )
            .then((e) => e.json())
            .then((e: any) => {
              // Turn list of paths into a nested object of methods
              let spec: Record<string, any> = {};
              for (const [path, method] of Object.entries(e.paths)) {
                // Object.keys(method as Object).filter(e=>e!="parameters")
                let stack: any = spec;
                const parts = path.split("/").slice(1);
                for (let i = 0; i < parts.length; i++) {
                  const part = parts[i] as string;
                  stack[part] = stack[part] || {};
                  if (i === parts.length - 1) {
                    stack[part]._ = Object.keys(method as Object).filter(
                      (e) => e != "parameters"
                    );
                    break;
                  }
                  stack = stack[part];
                }
              }
              return spec;
            })
            .then(
              (e: any) => (cache.write(JSON.stringify(e)).catch(() => {}), e)
            )
    );
    const rest = this.proxy();
    this.rest = rest;
    this.st.sp.then((sp) =>
      // @ts-ignore shut up ts
      Object.keys(sp).forEach((e: string) => (this[e] = rest[e]))
    );
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState < 2) return;
    if (this.se.hbt) clearTimeout(this.se.hbt);
    const ws = (this.ws = new WebSocket(
      this.se.s?.resume_gateway_url || this.s.ws
    ));
    const sid = this.se.s?.session_id;
    const seq = this.se.seq;
    this.se = {};
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data) as GatewayEvent;
      this.emit("debug", { from: "server", data });
      switch (data.op) {
        case 10:
          // Hello
          setTimeout(() => this.hb(), (this.se.hb = data.d.heartbeat_interval));
          this.send({
            op: sid ? 6 : 2,
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
                    intents: this.s.intents,
                  }),
              token: this.s.token,
              seq,
            },
          });
          break;
        case 11:
          // Pong
          this.se.pong = true;
          this.se.ping = Date.now() - Number(this.se.start);
          break;
        //@ts-ignore
        case 1:
          // Ready
          this.se.s = data.d as Session;
        case 0:
          // Events
          if (data.t === "READY")
            return (
              this.st.sp && this.st.sp.finally(() => this.emit("ready", data.d))
            );
          return this.emit(toCamelCase(data.t), data.d);
        case 7:
        case 9:
          // Disconnection
          this.emit("disconnected", data.d);
          if (data.d || data.op == 7) {
            this.ws?.close();
            this.connect();
          } else {
            this.emit(
              "error",
              new Error("Gateway issued disconnection without resume")
            );
            this.emit("close", "Connection closed by gateway!");
            this.destroy();
          }
      }
      data.s && (this.se.seq = data.s);
    };
    ws.onclose = (ev) => (
      setTimeout(() => this.connect(), 5000), this.emit("close", ev.code)
    );
    ws.onerror = (err) => this.emit("error", err);
  }

  private hb() {
    if (!this.ws || this.ws.readyState > 1) return;
    this.se.pong = false;
    this.se.start = Date.now();
    this.send({ op: 1, d: this.se.seq });
    setTimeout(() => this.hb(), this.se.hb);
  }

  private send(data: any) {
    this.emit("debug", { from: "client", data });
    return this.ws?.send?.(stringify(data));
  }

  get ping(): number {
    return this.se.ping || 0;
  }

  destroy(): void {
    if (this.se.hbt) clearTimeout(this.se.hbt);
    if (this.ws) this.ws.close();
  }

  private proxy(path: string[] = []): RestCall {
    const send = async (payload: Record<string, any>, p: string[] = path) => {
      const parsed = this.parse(p, (await this.st.sp) as Specification);
      if (!parsed) throw new Error(`Invalid path: ${p.join("/")}`);
      const { m: method, p: pathname } = parsed;
      const url = `${this.s.api}/${pathname}`;
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bot ${this.s.token}`,
          "Content-Type": "application/json",
        },
        body: method === "GET" ? undefined : JSON.stringify(payload),
      });
      const data: any = await res.json();
      if (res.status === 429 && data.retry_after) {
        await new Promise((r) => setTimeout(r, data.retry_after));
        return send(payload, p);
      }
      if (res.ok) return data;
      throw data;
    };
    return new Proxy(send, {
      // Use arrow function to fix this scope
      get: (_, p) => {
        return this.proxy([...path, String(p)]);
      },
      set(t, p, v) {
        t(v, [...path, String(p), "post"]);
        return true;
      },
      deleteProperty(t, p) {
        t({}, [...path, String(p)]);
        return true;
      },
    }) as unknown as RestCall;
  }

  parse(
    path: string[],
    spec: Specification,
    options: Record<string, any> = {}
  ): { m: string; p: string } | undefined {
    try {
      const parts = [...path];
      const method = methods[`${parts.at(-1)}` as keyof typeof methods];
      if (method) parts.pop();
      // Create a path mapping to extract from spec
      let stack = spec;
      const parsed: string[] = [];
      const urlParams: Record<string, string> = {};

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] as string;

        // Check if the part is an ID
        if (
          /^\d+$/.test(part) ||
          (i > 0 && Object.keys(stack).some((k) => k.startsWith("{")))
        ) {
          // Find placeholder key in the spec
          const placeholder = Object.keys(stack).find((k) => k.startsWith("{"));

          if (placeholder) {
            // Extract the param name without braces
            const paramName = placeholder.slice(1, -1);
            urlParams[paramName] = part;
            parsed.push(placeholder);
            stack = stack[placeholder] as Specification;
            continue;
          }
        }

        // Regular path segment
        if (part in stack) {
          parsed.push(part);
          stack = stack[part] as Specification;
        } else {
          // Try to find it in options and remove it
          const optionKey = `${part}_id`;
          if (options && optionKey in options) {
            const value = options[optionKey];
            delete options[optionKey];

            // Find the placeholder in the stack
            const placeholder = Object.keys(stack).find((k) =>
              k.startsWith("{")
            );
            if (placeholder) {
              parsed.push(placeholder);
              urlParams[placeholder.slice(1, -1)] = value;
              stack = stack[placeholder] as Specification;
            } else {
              throw new Error(`No placeholder found for ${optionKey}`);
            }
          } else {
            throw new Error(`Missing path segment: ${part}`);
          }
        }
      }

      // Replace placeholders in the final path
      let finalPath = parsed.join("/");
      for (const [param, value] of Object.entries(urlParams)) {
        finalPath = finalPath.replace(`{${param}}`, value);
      }
      console.log(method, finalPath, parsed);
      return {
        m: method || "GET",
        p: finalPath,
      };
    } catch (e) {
      console.error(e);
      return undefined;
    }
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
  sp?: Promise<typeof import("./specification.json") & Specification>; // Specification
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

interface Specification {
  [path: string | number]:
    | Specification
    | { _: ("get" | "post" | "delete" | "create" | "patch")[] };
}

interface RestCall {
  [path: string | number]: RestCall | ((args: any) => Promise<any>);
}

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

type Intents = Record<string, number>;

export { Snowflake, Snowflake as default, GatewayIntents };