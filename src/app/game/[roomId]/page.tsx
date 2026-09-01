import RoomManager from "@/components/game/RoomManager";

export default async function GameRoom({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <div className="min-h-screen p-4 pt-10">
      <RoomManager roomId={roomId.toUpperCase()} />
    </div>
  );
}
