import { GameApp } from "@/components/GameApp";

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return <GameApp gameId={gameId} />;
}
