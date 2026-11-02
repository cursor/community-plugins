import { PageSkeleton } from "@/components/skeletons";

export default function AdminLoading() {
  return <PageSkeleton title="Loading review queue" rows={4} />;
}
