import { TvJoinForm } from "@/components/tv/TvJoinForm";

export default async function TvJoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <TvJoinForm initialCode={code ?? ""} />;
}
