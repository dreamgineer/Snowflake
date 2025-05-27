import { EventEmitter } from "events";

const GatewayIntents: Intents = Object.fromEntries(
  "#S,#_MEMBERS,#_BANS,#_EMOJIS_AND_STICKERS,#_INTEGRATIONS,#_WEBHOOKS,#_INVITES,#_VOICE_STATES,#_PRESENCES,#_$S,#_$_REACTIONS,#_$_TYPING,DIRECT_$S,DIRECT_$_REACTIONS,DIRECT_$_TYPING,$_CONTENT,#_SCHEDULED_EVENTS,AUTO_MODERATION_CONFIGURATION,AUTO_MODERATION_EXECUTION"
    .replace(/#/g, "GUILD")
    .replace(/\$/g, "MESSAGE")
    .split(",")
    .map((e, i) => [e, 1 << i])
) as Intents;
enum ActivityType {
  GAME = 0,
  STREAMING = 1,
  LISTENING = 2,
  WATCHING = 3,
  CUSTOM = 4,
  COMPETING = 5,
}
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
  private st: ClientStore = {
    pr: { activities: [], status: "online", afk: false },
  };
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
              return sortSpecification(spec);
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

  private async connect(): Promise<void> {
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
    this.send({ op: 1, d: this.se.seq || null });
    setTimeout(() => this.hb(), this.se.hb);
  }

  private send(data: any) {
    this.emit("debug", { from: "client", data });
    return this.ws?.send?.(stringify(data));
  }

  /**
   *  Get the ping of the last heartbeat in millisecond
   */
  get ping(): number {
    return this.se.ping || 0;
  }

  /**
   * Destroy the client and close the connection to the Discord Gateway.
   */
  destroy(): void {
    if (this.se.hbt) clearTimeout(this.se.hbt);
    if (this.ws) this.ws.close();
  }

  private proxy(path: string[] = []): RestCall {
    const send = async (payload: Record<string, any>, p: string[] = path) => {
      const parsed = this.parse(
        p,
        (await this.st.sp) as Specification,
        payload
      );
      if (!parsed) throw new Error(`Invalid path: ${p.join("/")}`);
      console.log(parsed);
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

  private parse(
    path: string[],
    spec: Specification,
    options: Record<string, any> = {}
  ): { m: string; p: string } | undefined {
    // Traverse specification with pieces of path
    // like a maze, go through all path and gradually filter them out
    // if it reach and end, go back and use another path
    // prioritize static path over path params
    // path params can also be skipped. That's the last priority
    const parts = [...path];
    let m = methods[`${parts.at(-1)}` as keyof typeof methods];
    if (m) parts.pop();
    else m = "GET";

    if (!parts.length) {
      return { m, p: "" };
    }

    for (const sub of Object.keys(spec)) {
      if (sub === "_") continue; // Skip method list
      if (sub === parts[0]) {
        return {
          m,
          p: "/" + sub + this.parse(parts.slice(1), spec[sub]!, options)?.p,
        };
      }
      if (sub.startsWith("{")) {
        const param = sub.slice(1, -1);
        if (param in options) {
          const option = options[param];
          delete options[param];
          return {
            m,
            p: "/" + option + this.parse(parts, spec[sub]!, options)?.p,
          };
        } else {
          // If the parameter is already provided in the input path, append and skip
          return {
            m,
            p:
              "/" +
              parts[0] +
              this.parse(parts.slice(1), spec[sub]!, options)?.p,
          };
        }
      }
    }
    throw new Error(`Invalid path: ${path.join("/")}`);
  }

  presence(presence: Presence): void {
    if (!this.ws || this.ws.readyState > 1) return;
    presence.since ??= Math.floor(Date.now() / 1000);
    presence.afk ??= false;
    this.st.pr = { ...presence, ...this.st.pr };
    this.send({
      op: 3,
      d: this.st.pr,
    });
  }
  activity(activities: Activity[]): void {
    if (!this.ws || this.ws.readyState > 1) return;
    this.st.pr.activities = activities;
    this.send({
      op: 3,
      d: this.st.pr,
    });
  }
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

function sortSpecification(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortSpecification);
  } else if (obj && typeof obj === "object" && obj.constructor === Object) {
    const entries = Object.entries(obj);

    entries.sort(([keyA], [keyB]) => {
      const score = (key: string): number => {
        if (key === "_") return 2;
        if (key.startsWith("{")) return 1;
        return 0;
      };

      return score(keyA) - score(keyB);
    });

    const sortedObj: any = {};
    for (const [key, value] of entries) {
      sortedObj[key] = sortSpecification(value);
    }
    return sortedObj;
  } else {
    return obj;
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
  pr: Presence; // Presence
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

type Activity = {
  name: string; // Activity name
  type: ActivityType; // Activity type
  url?: string; // Activity URL (optional)
};

type Presence = {
  activities?: Activity[]; // Array of activities
  status: "online" | "idle" | "dnd" | "invisible"; // User status
  afk: boolean; // Whether the user is AFK
  since?: number; // Timestamp of when the status was set
};

type Specification = {
  [path: string | number]: Specification;
} & { _: ("get" | "post" | "delete" | "create" | "patch")[] };

interface RestCall {
  [path: string | number]: RestCall | ((args: any) => Promise<any>);
}

type Intents = Record<string, number>;

export { Snowflake, Snowflake as default, GatewayIntents, ActivityType };
