"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { editMyApp } from "@/actions/my-submissions";
import type { OwnApp } from "@/data/apps";
import type { EditAppOutcome } from "@/lib/app-owner";
import { AppLogo } from "./app-logo";

const ERRORS: Partial<Record<EditAppOutcome, string>> = {
  unchanged: "Nothing has changed.",
  not_listed: "This app isn’t listed any more, so it can’t be edited.",
  invalid_details:
    "Add a name (2–80 characters) and a description (at least 10 characters). Logo and website must be https:// links.",
  bad_logo:
    "That logo link didn’t load as an image. Use a direct link to a PNG, JPG or SVG.",
  name_taken: "Another listing already has that name.",
  rate_limited: "You’ve made a lot of changes recently. Try again later.",
};

/** An https link, or nothing. */
function linkOk(value: string) {
  const text = value.trim();
  if (!text) return true;
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
}

/** The owner's form for one of their listed apps. */
export function AppEditForm({ app }: { app: OwnApp }) {
  const router = useRouter();
  const fromRepo = app.source === "repo";
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description);
  const [logo, setLogo] = useState(app.logo ?? "");
  const [homepage, setHomepage] = useState(app.homepage ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new name or description goes back through the security check.
  const rechecked =
    !fromRepo &&
    (name.trim() !== app.name || description.trim() !== app.description);
  const changed =
    rechecked ||
    logo.trim() !== (app.logo ?? "") ||
    homepage.trim() !== (app.homepage ?? "");
  const valid =
    name.trim().length >= 2 &&
    description.trim().length >= 10 &&
    linkOk(logo) &&
    linkOk(homepage);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!changed || !valid || saving) return;
    setSaving(true);
    setError(null);
    const result = await editMyApp(app.id, {
      name,
      description,
      logo,
      homepage,
    }).catch(() => null);
    if (
      result?.ok &&
      (result.outcome === "updated" || result.outcome === "checking")
    ) {
      router.push(`/my-bots?submitted=${encodeURIComponent(app.slug)}`);
      router.refresh();
      return;
    }
    setError(
      result?.ok
        ? (ERRORS[result.outcome] ?? "Something went wrong.")
        : "That didn’t work. Try again.",
    );
    setSaving(false);
  }

  return (
    <form
      className="form edit-form"
      onSubmit={onSubmit}
      noValidate
      data-testid="app-edit-form"
    >
      <div className="field">
        <label htmlFor="edit-name">Name</label>
        <input
          id="edit-name"
          value={name}
          maxLength={80}
          disabled={saving || fromRepo}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-description">Description</label>
        <textarea
          id="edit-description"
          rows={4}
          maxLength={2000}
          value={description}
          disabled={saving || fromRepo}
          onChange={(e) => setDescription(e.target.value)}
        />
        {fromRepo && (
          <div className="hint" data-testid="from-repo">
            The name and description come from{" "}
            <a href={app.repository ?? "#"} target="_blank" rel="noopener">
              your repository
            </a>
            . Change <code>displayName</code> and <code>description</code> in
            its plugin.json, then use Refresh on Your submissions.
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="edit-logo">Logo URL</label>
        <input
          id="edit-logo"
          type="url"
          value={logo}
          disabled={saving}
          onChange={(e) => setLogo(e.target.value)}
          placeholder="https://…/logo.png"
          aria-invalid={!linkOk(logo)}
        />
        <div className="hint">
          A direct link to a square image. Leave it empty to show the app’s
          initials.
        </div>
      </div>
      <div className="field">
        <label htmlFor="edit-homepage">Website</label>
        <input
          id="edit-homepage"
          type="url"
          value={homepage}
          disabled={saving}
          onChange={(e) => setHomepage(e.target.value)}
          placeholder="https://…"
          aria-invalid={!linkOk(homepage)}
        />
      </div>

      <div className="submit-preview edit-preview" data-testid="app-preview">
        <div className="head">
          <AppLogo
            name={name.trim() || "?"}
            logo={linkOk(logo) ? logo.trim() || null : null}
            size={56}
          />
          <div style={{ minWidth: 0 }}>
            <h2>{name.trim() || "Your app"}</h2>
            <p className="desc">{description.trim()}</p>
          </div>
        </div>
        <div className="meta">
          <span className="meta-link">
            <code>grok-bot.directory/apps/{app.slug}</code>
          </span>
        </div>
      </div>

      {rechecked && (
        <div className="already" role="status" data-testid="recheck-notice">
          <span>
            A new name or description goes through the security check again. The
            app is hidden while it runs, usually a few minutes.
          </span>
        </div>
      )}

      <div className="edit-actions">
        <button
          type="submit"
          className="btn btn-lg edit-save"
          disabled={!changed || !valid || saving}
        >
          {saving ? "Saving…" : rechecked ? "Save and re-check" : "Save"}
        </button>
        <Link href="/my-bots" className="btn btn-gray btn-lg">
          Cancel
        </Link>
      </div>
      {error && (
        <div className="form-error" role="alert" data-testid="edit-error">
          {error}
        </div>
      )}
    </form>
  );
}
