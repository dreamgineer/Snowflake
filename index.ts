import { EventEmitter } from "events";

class Snowflake extends EventEmitter {
  private ws: WebSocket | undefined;
  private settings: ClientSettings;
  constructor(settings: ClientSettings) {
    super();
    settings.api ??= "https://discord.com/api/";
    this.settings = settings;
    if (!this.settings.ws)
      fetch(this.settings.api + "gateway")
        .then((e) => e.text())
        .then((e) => (this.settings.ws = e,this.connect()));
    else this.connect();
  }

  async connect() {
    if (this.ws && this.ws.readyState < 2) return;
    const ws = (this.ws = new WebSocket("wss://"));
  }
}

interface ClientSettings {
  token: string;
  intents: number;
  api: string;
  ws: string;
}

function parseEndpoint(endpoint: string[], options?: Record<string, any>) {}
