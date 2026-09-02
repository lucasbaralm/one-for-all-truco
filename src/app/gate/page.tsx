import GateForm from "./GateForm";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <GateForm next={next && next.startsWith("/") ? next : "/"} />;
}
