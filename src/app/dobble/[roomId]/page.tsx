import DobbleRoom from "@/components/dobble/DobbleRoom";
import { parseBotsSetup } from "@/lib/dobble/setup";

type Search = { bots?: string; level?: string; mode?: string };

export default async function DobbleRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Search>;
}) {
  const { roomId } = await params;
  // ?bots=3&level=hard&mode=well → sala "eu contra bots": o dono monta e começa a partida sozinho.
  const setup = parseBotsSetup(await searchParams);
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <DobbleRoom roomId={roomId.toUpperCase()} setup={setup} />
    </div>
  );
}
