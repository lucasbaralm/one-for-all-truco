import { ServiceStatusBanner, ServiceStatusProvider } from "@/components/ServiceStatus";

// Aviso de servidor de jogo/Supabase fora do ar vale pro menu e pros lobbies de todos os jogos
// (e o menu marca os cartões dos jogos com o mesmo resultado).
export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return (
    <ServiceStatusProvider>
      <ServiceStatusBanner />
      {children}
    </ServiceStatusProvider>
  );
}
