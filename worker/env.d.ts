// Os bindings e variáveis que o wrangler.jsonc entrega ao Worker (e o `this.env` dos servidores de sala).
declare namespace Cloudflare {
  interface Env {
    Main: DurableObjectNamespace;
    Ludo: DurableObjectNamespace;
    Dobble: DurableObjectNamespace;
    Uno: DurableObjectNamespace;
    Forca: DurableObjectNamespace;
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    // Só os testes ponta a ponta definem estas (wrangler dev --var UNO_SPEED:8): dividem as esperas dos bots.
    LUDO_SPEED?: string;
    DOBBLE_SPEED?: string;
    UNO_SPEED?: string;
    FORCA_SPEED?: string;
  }
}
