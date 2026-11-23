import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppEditForm } from "@/components/app-edit-form";
import { getOwnListedApp } from "@/data/apps";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Edit app",
  robots: { index: false },
};

type Props = { params: Promise<{ slug: string }> };

/** An app's owner changes how it's listed. Anyone else gets a 404. */
export default async function EditAppPage({ params }: Props) {
  const { slug } = await params;
  const viewer = await requireViewer(`/apps/${slug}/edit`);
  const app = await getOwnListedApp(slug, viewer.id);
  if (!app) notFound();
  return (
    <div className="shell page submit-page">
      <h1 className="page-title">Edit {app.name}</h1>
      <p className="lede">
        Change how your app is listed here and on cursor.directory. Its address
        stays the same.
      </p>
      <AppEditForm app={app} />
    </div>
  );
}
