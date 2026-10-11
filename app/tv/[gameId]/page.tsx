import { TvApp } from "@/components/tv/TvApp";

export default async function TvPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <TvApp gameId={gameId} />;
}
