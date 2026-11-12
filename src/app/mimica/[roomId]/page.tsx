import MimicaRoom from "@/components/mimica/MimicaRoom";

export default async function MimicaRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <MimicaRoom roomId={roomId.toUpperCase()} />
    </div>
  );
}
