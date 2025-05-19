class Snowflake {
  private ws: WebSocket | undefined;
  constructor(settings: ClientSettings) {
  }
  
  async connect() {
    if()
  }
}

interface ClientSettings {
  token: string;
  intents: number;
}

function parseEndpoint(endpoint: string[], options?: Record<string, any>) {}