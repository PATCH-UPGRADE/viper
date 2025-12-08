import { RecommendationsPage } from "@/features/recommendations/components/recommendations";
import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();

  return <RecommendationsPage />;
};

export default Page;
