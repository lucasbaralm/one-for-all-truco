import UnoRoom from "@/components/uno/UnoRoom";
import { parseBotsSetup } from "@/lib/uno/setup";

type Search = { bots?: string; level?: string };

export default async function UnoRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Search>;
}) {
  const { roomId } = await params;
  // ?bots=3&level=hard → sala "eu contra bots": o dono monta e começa a partida sozinho.
  const setup = parseBotsSetup(await searchParams);
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <UnoRoom roomId={roomId.toUpperCase()} setup={setup} />
    </div>
  );
}
