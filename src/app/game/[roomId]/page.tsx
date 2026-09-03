import RoomManager from "@/components/game/RoomManager";

export default async function GameRoom({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ test?: string }>;
}) {
  const { roomId } = await params;
  const { test } = await searchParams;
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <RoomManager roomId={roomId.toUpperCase()} testMode={test === "1"} />
    </div>
  );
}
