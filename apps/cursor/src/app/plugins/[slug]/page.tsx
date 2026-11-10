import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PluginDetailView } from "@/components/plugins/plugin-detail";
import { getPluginBySlug, getPluginListing } from "@/data/queries";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;

  const { data: plugin } = await getPluginBySlug(slug);
  if (plugin?.unavailable_in?.includes("cursor")) {
    return { title: "Plugin Not Found" };
  }
  if (plugin?.active) {
    const title = `${plugin.name} | Cursor Directory`;
    const description = plugin.description ?? undefined;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
      },
      twitter: {
        title,
        description,
      },
    };
  }

  if (plugin && !plugin.active) {
    return {
      title: `${plugin.name} | Cursor Directory`,
      robots: { index: false },
    };
  }

  return { title: "Plugin Not Found" };
}

export async function generateStaticParams() {
  const { data: plugins } = await getPluginListing();
  return (plugins ?? []).map((p) => ({ slug: p.slug }));
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;

  const { data: plugin } = await getPluginBySlug(slug);
  if (!plugin || plugin.unavailable_in?.includes("cursor")) notFound();

  return <PluginDetailView plugin={plugin} />;
}
