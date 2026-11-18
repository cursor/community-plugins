"use client";

import {
  COMPONENT_TYPE_LABELS_PLURAL,
  type ComponentType,
  type PluginComponent,
} from "@directories/plugins/types";
import { Card, CardContent } from "@/components/ui/card";
import { AddToCursorOrCopy } from "./add-to-cursor-or-copy";
import { CopyButton } from "./copy-button";

export function GenericComponentSection({
  components,
  type,
  onInstall,
  installable,
}: {
  components: PluginComponent[];
  type: ComponentType;
  onInstall: () => void;
  installable: boolean;
}) {
  return (
    <div>
      <h2 className="section-eyebrow mb-4">
        {components.length} {COMPONENT_TYPE_LABELS_PLURAL[type].toLowerCase()}
      </h2>
      <div className="space-y-3">
        {components.map((comp) => (
          <Card key={comp.slug} className="border-border bg-transparent">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-medium">{comp.name}</h3>
                {installable &&
                  comp.content &&
                  (type === "command" ? (
                    <AddToCursorOrCopy
                      kind="command"
                      slug={comp.slug}
                      content={comp.content}
                      onInstall={onInstall}
                    />
                  ) : (
                    <CopyButton text={comp.content} onCopy={onInstall} />
                  ))}
              </div>
              {comp.description && (
                <p className="text-xs leading-5 text-muted-foreground">
                  {comp.description}
                </p>
              )}
              {comp.content && (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-editor p-4 font-mono text-xs leading-6 text-muted-foreground">
                  <code className="block whitespace-pre-wrap">
                    {comp.content}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
