import RoomManager from "@/components/game/RoomManager";

export default async function GameRoom({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <RoomManager roomId={roomId.toUpperCase()} />
    </div>
  );
}
