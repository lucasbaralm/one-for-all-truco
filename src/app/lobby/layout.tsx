import { ServiceStatusBanner } from "@/components/ServiceStatus";

// Aviso de PartyKit/Supabase fora do ar vale pro menu e pros lobbies de todos os jogos.
export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceStatusBanner />
      {children}
    </>
  );
}
