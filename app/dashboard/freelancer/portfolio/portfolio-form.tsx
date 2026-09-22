"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconImage, IconPlus } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";

import { addPortfolioItemAction, type PortfolioFormState } from "./actions";

const initialState: PortfolioFormState = { fieldErrors: {}, formError: null };

export function PortfolioForm({ remaining }: { remaining: number }) {
  const [state, formAction, isPending] = useActionState(addPortfolioItemAction, initialState);
  const [preview, setPreview] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  if (remaining <= 0) {
    return (
      <div className="surface-card p-5 text-center text-muted-foreground">
        <p className="text-[15px] font-medium">You have reached the maximum of 12 portfolio items.</p>
        <p className="mt-1 text-[13px]">Delete an existing item below if you wish to add new work.</p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="surface-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="t-subhead">Add a project or sample</h3>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Showcase your best deliverables with high-resolution screenshots and case study details.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setIsOpen(true)}
          className="shrink-0"
        >
          <IconPlus className="size-4 mr-1.5" />
          Add portfolio item
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-card p-6 sm:p-8">
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div>
          <h2 className="t-subhead text-[18px]">Add new portfolio item</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {remaining} slot{remaining === 1 ? "" : "s"} remaining
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsOpen(false);
            setPreview(null);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>

      {state.formError ? (
        <Notice tone="error" className="mt-5">
          {state.formError}
        </Notice>
      ) : null}

      <form action={formAction} className="mt-6 space-y-6">
        {/* Cover image upload */}
        <Field
          label="Cover image"
          htmlFor="portfolio-image"
          hint="PNG, JPEG, or WebP up to 5 MB. Displays at 16:10 aspect ratio on profile & directory."
          error={state.fieldErrors.image}
          required
        >
          <div className="mt-2 flex flex-col sm:flex-row items-center gap-5">
            <div className="relative aspect-[16/10] w-full sm:w-56 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40 flex items-center justify-center">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Selected portfolio preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
                  <IconImage className="size-8 opacity-60 mb-2" />
                  <span className="text-[12px] font-medium">Image preview</span>
                </div>
              )}
            </div>

            <div className="w-full space-y-2">
              <input
                id="portfolio-image"
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-foreground hover:file:bg-secondary/80 cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setPreview(url);
                  } else {
                    setPreview(null);
                  }
                }}
              />
              <p className="text-[12px] text-muted-foreground">
                High-contrast screenshots or mockups work best. SVG is not allowed.
              </p>
            </div>
          </div>
        </Field>

        {/* Title */}
        <Field
          label="Project title"
          htmlFor="portfolio-title"
          hint="Keep it specific and descriptive (3 to 80 characters)."
          error={state.fieldErrors.title}
          required
        >
          <Input
            id="portfolio-title"
            name="title"
            placeholder="e.g. Real-Time Logistics Dashboard or High-Converting Shopify Store"
            maxLength={80}
            required
            aria-invalid={Boolean(state.fieldErrors.title)}
          />
        </Field>

        {/* Description */}
        <Field
          label="Description"
          htmlFor="portfolio-description"
          hint="Explain the problem, your exact role, technologies used, and the measurable outcome (up to 600 characters)."
          error={state.fieldErrors.description}
          optional
        >
          <Textarea
            id="portfolio-description"
            name="description"
            rows={4}
            maxLength={600}
            placeholder="Describe what was built, challenges solved, and results delivered..."
            aria-invalid={Boolean(state.fieldErrors.description)}
          />
        </Field>

        {/* Link URL */}
        <Field
          label="External link"
          htmlFor="portfolio-linkUrl"
          hint="Optional public link (https:// required) to live demo, GitHub repo, or case study."
          error={state.fieldErrors.linkUrl}
          optional
        >
          <Input
            id="portfolio-linkUrl"
            name="linkUrl"
            type="url"
            placeholder="https://example.com/project"
            aria-invalid={Boolean(state.fieldErrors.linkUrl)}
          />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setIsOpen(false);
              setPreview(null);
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Uploading and saving..." : "Save item"}
          </Button>
        </div>
      </form>
    </div>
  );
}
