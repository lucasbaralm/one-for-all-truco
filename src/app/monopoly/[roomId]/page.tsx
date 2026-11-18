import MonopolyRoom from "@/components/monopoly/MonopolyRoom";
import { parseBotsSetup } from "@/lib/monopoly/setup";

type Search = { bots?: string; level?: string; limit?: string };

export default async function MonopolyRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Search>;
}) {
  const { roomId } = await params;
  // ?bots=3&level=hard&limit=20 → sala "eu contra bots": o dono monta e começa a partida sozinho.
  const setup = parseBotsSetup(await searchParams);
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <MonopolyRoom edition="monopoly" roomId={roomId.toUpperCase()} setup={setup} />
    </div>
  );
}
