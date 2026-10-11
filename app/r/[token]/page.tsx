import { Rejoin } from "@/components/Rejoin";

export default async function RejoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Rejoin token={decodeURIComponent(token)} />;
}
