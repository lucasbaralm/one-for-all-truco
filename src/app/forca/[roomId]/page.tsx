import ForcaRoom from "@/components/forca/ForcaRoom";

export default async function ForcaRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <div className="h-dvh flex flex-col p-4 pt-3 sm:pt-10 overflow-hidden">
      <ForcaRoom roomId={roomId.toUpperCase()} />
    </div>
  );
}
