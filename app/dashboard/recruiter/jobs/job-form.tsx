"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SkillCategoryGroup } from "@/lib/db/freelancer";
import { jobEngagementTypes } from "@/lib/validations/job";

import { submitJob, type JobFormState } from "./actions";

const initialJobFormState: JobFormState = { fieldErrors: {}, formError: null };

const ENGAGEMENT_LABEL: Record<(typeof jobEngagementTypes)[number], string> = {
  HOURLY: "Hourly",
  FIXED: "Fixed price",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

export type JobFormInitial = {
  jobId: string;
  title: string;
  description: string;
  categorySlug: string;
  engagementType: (typeof jobEngagementTypes)[number];
  budgetMinUsd: number | null;
  budgetMaxUsd: number | null;
  isRemote: boolean;
  location: string | null;
  skillSlugs: string[];
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] leading-[18px] text-destructive">
      {message}
    </p>
  );
}

export function JobForm({
  categories,
  skillGroups,
  initial,
}: {
  categories: { slug: string; name: string }[];
  skillGroups: SkillCategoryGroup[];
  initial?: JobFormInitial;
}) {
  const [state, formAction, isPending] = useActionState(submitJob, initialJobFormState);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categorySlug, setCategorySlug] = useState(initial?.categorySlug ?? "");
  const [engagementType, setEngagementType] = useState<string>(initial?.engagementType ?? "FIXED");
  const [budgetMin, setBudgetMin] = useState(initial?.budgetMinUsd?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(initial?.budgetMaxUsd?.toString() ?? "");
  const [isRemote, setIsRemote] = useState(initial?.isRemote ?? true);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [skills, setSkills] = useState<Set<string>>(new Set(initial?.skillSlugs ?? []));

  const toggleSkill = (slug: string) =>
    setSkills((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const err = state.fieldErrors;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6">
        <h1 className="t-heading">
          {initial ? "Edit draft" : "Post a job"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Publishing uses one of your plan&apos;s active post slots. Drafts are free and unlimited.
        </p>
      </header>

      {state.formError ? (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.formError}
        </p>
      ) : null}

      <form action={formAction} noValidate className="space-y-5">
        {initial ? <input type="hidden" name="jobId" value={initial.jobId} /> : null}

        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={Boolean(err.title)}
            placeholder="Senior Shopify developer for checkout migration"
          />
          <FieldError message={err.title} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="categorySlug">Category</Label>
            <Select
              id="categorySlug"
              name="categorySlug"
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              aria-invalid={Boolean(err.categorySlug)}
              
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
            <FieldError message={err.categorySlug} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="engagementType">Engagement</Label>
            <Select
              id="engagementType"
              name="engagementType"
              value={engagementType}
              onChange={(e) => setEngagementType(e.target.value)}
              
            >
              {jobEngagementTypes.map((t) => (
                <option key={t} value={t}>
                  {ENGAGEMENT_LABEL[t]}
                </option>
              ))}
            </Select>
            <FieldError message={err.engagementType} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={Boolean(err.description)}
            rows={9}
            placeholder="The work, the context, the stack, how success is measured, and how you like to collaborate. Specific posts attract specific people."
          />
          <p className="text-[13px] leading-[18px] text-muted-foreground">{description.trim().length} characters (100 minimum)</p>
          <FieldError message={err.description} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="budgetMinUsd">Budget min (USD, optional)</Label>
            <Input
              id="budgetMinUsd"
              name="budgetMinUsd"
              type="number"
              inputMode="numeric"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
              aria-invalid={Boolean(err.budgetMinUsd)}
              placeholder="3000"
            />
            <FieldError message={err.budgetMinUsd} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budgetMaxUsd">Budget max (USD, optional)</Label>
            <Input
              id="budgetMaxUsd"
              name="budgetMaxUsd"
              type="number"
              inputMode="numeric"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              aria-invalid={Boolean(err.budgetMaxUsd)}
              placeholder="6000"
            />
            <FieldError message={err.budgetMaxUsd} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="isRemote"
              checked={isRemote}
              onChange={(e) => setIsRemote(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Fully remote
          </label>
          {!isRemote ? (
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                aria-invalid={Boolean(err.location)}
                placeholder="Hamburg, Germany (hybrid)"
              />
              <FieldError message={err.location} />
            </div>
          ) : (
            <input type="hidden" name="location" value="" />
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Skills (1–10)</p>
          <FieldError message={err.skillSlugs} />
          <div className="space-y-4">
            {skillGroups.map((group) => (
              <div key={group.slug}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.name}
                </h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {group.skills.map((skill) => (
                    <label key={skill.slug} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        name="skillSlugs"
                        value={skill.slug}
                        checked={skills.has(skill.slug)}
                        onChange={() => toggleSkill(skill.slug)}
                        className="size-4 rounded border-border"
                      />
                      {skill.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="submit" name="intent" value="draft" variant="outline" disabled={isPending}>
            {isPending ? "Saving…" : "Save draft"}
          </Button>
          <Button type="submit" name="intent" value="publish" disabled={isPending}>
            {isPending ? "Working…" : "Publish"}
          </Button>
        </div>
      </form>
    </div>
  );
}
