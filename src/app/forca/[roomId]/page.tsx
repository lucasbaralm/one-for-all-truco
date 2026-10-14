import ForcaRoom from "@/components/forca/ForcaRoom";
import { parseBotsSetup } from "@/lib/forca/setup";

type Search = { bots?: string; level?: string; rounds?: string };

export default async function ForcaRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Search>;
}) {
  const { roomId } = await params;
  // ?bots=3&level=hard&rounds=5 → sala "eu contra bots": o dono monta e começa a partida sozinho.
  const setup = parseBotsSetup(await searchParams);
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <ForcaRoom roomId={roomId.toUpperCase()} setup={setup} />
    </div>
  );
}
