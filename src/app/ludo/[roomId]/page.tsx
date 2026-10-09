import LudoRoom from "@/components/ludo/LudoRoom";
import { parseBotsSetup } from "@/lib/ludo/setup";

type Search = { bots?: string; level?: string; color?: string };

export default async function LudoRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Search>;
}) {
  const { roomId } = await params;
  // ?bots=3&level=hard&color=blue → sala "eu contra bots": o dono monta e começa a partida sozinho.
  const setup = parseBotsSetup(await searchParams);
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <LudoRoom roomId={roomId.toUpperCase()} setup={setup} />
    </div>
  );
}
