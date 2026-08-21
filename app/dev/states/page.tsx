import { notFound } from "next/navigation";

import { RoleChoice } from "@/components/auth/role-choice";
import { MatchMeter } from "@/components/brand/match-meter";
import { Orbit, OrbitSpinner } from "@/components/brand/orbit";
import { ProfileBadge } from "@/components/profile/profile-badge";
import { StarRating } from "@/components/profile/star-rating";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceRow, Radio } from "@/components/ui/choice";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, fieldControlProps } from "@/components/ui/field";
import {
  IconAlert,
  IconArrowRight,
  IconBriefcase,
  IconBuilding,
  IconCheck,
  IconClock,
  IconClose,
  IconExternal,
  IconFilter,
  IconFlag,
  IconGauge,
  IconHandshakeless,
  IconLogout,
  IconMenu,
  IconPin,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShield,
  IconUser,
} from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { Steps } from "@/components/ui/steps";
import { Textarea } from "@/components/ui/textarea";
import {
  applicationStatusBadge,
  engagementStateBadge,
  freelancerVerificationBadge,
  jobStatusBadge,
  recruiterTierBadge,
} from "@/lib/profile/badges";

/**
 * The component states harness. Development only — 404s in production.
 *
 * Every variant of every primitive, in every state it can hold, on one page.
 * The rule this enforces: a component is only correct when every variant ×
 * state renders right, not just the resting default. Hover and focus are the
 * two that are never checked otherwise, because nobody screenshots them.
 *
 * Open http://localhost:3000/dev/states
 */
export const metadata = { robots: { index: false, follow: false } };

const BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const SIZES = ["sm", "default", "lg"] as const;

const ICONS = [
  ["Search", IconSearch],
  ["Briefcase", IconBriefcase],
  ["Building", IconBuilding],
  ["User", IconUser],
  ["Engagements", IconHandshakeless],
  ["Shield", IconShield],
  ["Gauge", IconGauge],
  ["Settings", IconSettings],
  ["Logout", IconLogout],
  ["Plus", IconPlus],
  ["Check", IconCheck],
  ["Close", IconClose],
  ["ArrowRight", IconArrowRight],
  ["Filter", IconFilter],
  ["Clock", IconClock],
  ["Pin", IconPin],
  ["Menu", IconMenu],
  ["Alert", IconAlert],
  ["Flag", IconFlag],
  ["External", IconExternal],
] as const;

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-8">
      <h2 className="t-heading">{title}</h2>
      {note ? <p className="mt-1 measure text-[15px] text-muted-foreground">{note}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="t-label text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function StatesHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main id="main" className="flex-1">
      <div className="mx-auto w-full max-w-[1240px] px-6 py-12">
        <header>
          <p className="t-label text-muted-foreground">Development only</p>
          <h1 className="t-display-2 mt-2">Component states</h1>
          <p className="mt-3 measure t-body text-[color:var(--color-foreground)]/70">
            Every primitive in every state. Tab through this page to check focus rings, and hover
            each row to check the Mist fill. If a state looks wrong here, it is wrong everywhere.
          </p>
        </header>

        <Section
          title="Type scale"
          note="Each line is a named token from the brand guide, not an ad-hoc size. Resize the window: display and heading sizes step down at 640px."
        >
          <div className="space-y-4">
            <p className="t-display-1">Hire faster</p>
            <p className="t-display-2">Four thousand vetted specialists</p>
            <p className="t-heading">Shortlist review</p>
            <p className="t-subhead">A subhead carries a section</p>
            <p className="t-body measure">
              Body copy is set in Inter at 17px on light surfaces and capped at 62 characters,
              because a line that runs the full container width is the fastest way to make a
              considered layout look unconsidered.
            </p>
            <p className="t-body-dense">Body dense, 15px, for product tables only.</p>
            <p className="t-label text-muted-foreground">Contract · Remote · Karachi</p>
            <p className="t-data">$74.00/hr · 98% · 12,480</p>
          </div>
        </Section>

        <Section title="Buttons" note="Hover deepens Signal Red to Deep Red. Tab to see the 2px Info ring at 2px offset.">
          <div className="space-y-6">
            {BUTTON_VARIANTS.map((variant) => (
              <Cell key={variant} label={variant}>
                <Button variant={variant}>Send offer</Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
                <Button variant={variant} aria-busy>
                  Saving…
                </Button>
                <Button variant={variant}>
                  <IconPlus />
                  With icon
                </Button>
              </Cell>
            ))}
            <Cell label="sizes">
              {SIZES.map((size) => (
                <Button key={size} size={size}>
                  {size}
                </Button>
              ))}
              <Button size="icon" aria-label="Add">
                <IconPlus />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Dismiss">
                <IconClose />
              </Button>
            </Cell>
          </div>
        </Section>

        <Section title="Form controls" note="Border goes Ink on focus with the Info ring outside it. No control carries a shadow.">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Rate" htmlFor="h-rate" hint="Whole dollars, per hour." required>
              <Input {...fieldControlProps("h-rate", { hint: "x" })} type="number" defaultValue={74} />
            </Field>
            <Field label="With an error" htmlFor="h-err" error="Enter a rate of $25/hr or more.">
              <Input {...fieldControlProps("h-err", { error: "x" })} defaultValue="12" />
            </Field>
            <Field label="Disabled" htmlFor="h-dis">
              <Input id="h-dis" disabled defaultValue="Not editable" />
            </Field>
            <Field label="Category" htmlFor="h-sel" optional>
              <Select id="h-sel" defaultValue="eng">
                <option value="eng">Engineering</option>
                <option value="des">Design</option>
              </Select>
            </Field>
            <Field label="Large input" htmlFor="h-lg" hint="44px, the touch minimum.">
              <Input id="h-lg" inputSize="lg" placeholder="Search jobs, skills, companies" />
            </Field>
            <Field label="Cover letter" htmlFor="h-ta">
              <Textarea id="h-ta" rows={3} placeholder="What makes you right for this one?" />
            </Field>
            <div className="space-y-1">
              <p className="t-label text-muted-foreground">Checkbox / radio — 44px rows</p>
              <ChoiceRow>
                <Checkbox defaultChecked /> Remote only
              </ChoiceRow>
              <ChoiceRow>
                <Checkbox /> Full time
              </ChoiceRow>
              <ChoiceRow>
                <Checkbox disabled /> Disabled
              </ChoiceRow>
              <ChoiceRow>
                <Radio name="h-r" defaultChecked /> Freelancer
              </ChoiceRow>
              <ChoiceRow>
                <Radio name="h-r" /> Company
              </ChoiceRow>
            </div>
          </div>
        </Section>

        <Section title="Notices" note="Each leads with a word, so the state survives greyscale. Errors use role=alert so they are announced after a redirect.">
          <div className="space-y-2">
            <Notice tone="success">Published. Your post is live and visible to Pro members now.</Notice>
            <Notice tone="warning">3 applications left in your rolling 30-day window.</Notice>
            <Notice tone="error">That rate is below the minimum for this category. Try $25/hr or more.</Notice>
            <Notice tone="info">New posts are visible to Pro members for the first 6 hours.</Notice>
          </div>
        </Section>

        <Section title="Status pills" note="Never colour alone — the label always carries the meaning.">
          <div className="space-y-3">
            <Cell label="recruiter tier">
              {(["UNVERIFIED", "VERIFIED", "TRUSTED"] as const).map((t) => (
                <ProfileBadge key={t} spec={recruiterTierBadge(t)} />
              ))}
            </Cell>
            <Cell label="job status">
              {(["DRAFT", "PENDING_REVIEW", "ACTIVE", "CLOSED", "REMOVED"] as const).map((s) => (
                <ProfileBadge key={s} spec={jobStatusBadge(s)} />
              ))}
            </Cell>
            <Cell label="application status">
              {(["SUBMITTED", "VIEWED", "SHORTLISTED", "REJECTED", "WITHDRAWN"] as const).map((s) => (
                <ProfileBadge key={s} spec={applicationStatusBadge(s)} />
              ))}
            </Cell>
            <Cell label="engagement state">
              {(["PENDING", "CONFIRMED", "DECLINED", "UNCLAIMED"] as const).map((s) => (
                <ProfileBadge key={s} spec={engagementStateBadge(s)} />
              ))}
            </Cell>
            <Cell label="freelancer verification">
              {(["NONE", "ID_VERIFIED", "ID_AND_WORK_VERIFIED"] as const).map((v) => (
                <ProfileBadge key={v} spec={freelancerVerificationBadge(v)} />
              ))}
            </Cell>
          </div>
        </Section>

        <Section title="Match Meter" note="The signature element: the logo's dot taper turned into a scale. Dots are aria-hidden; the score is read as text.">
          <div className="flex flex-wrap items-end gap-8">
            {[0, 12, 38, 55, 74, 91, 100].map((n) => (
              <MatchMeter key={n} score={n} />
            ))}
          </div>
        </Section>

        <Section title="Orbit" note="The brand's one animated asset, and the loading state. Never spin the full lockup.">
          <div className="flex flex-wrap items-center gap-10 text-primary">
            <Orbit className="size-10" />
            <Orbit className="size-20" />
            <Orbit className="size-40" />
            <OrbitSpinner className="size-10" />
          </div>
        </Section>

        <Section title="Icons" note="One family: 24px grid, 1.5px stroke, square caps, monochrome, inheriting text colour.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {ICONS.map(([name, Icon]) => (
              <div key={name} className="flex items-center gap-2 border border-border px-3 py-2">
                <Icon />
                <span className="truncate text-[13px] text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Record rows" note="The atom of the product: one shared hairline, no gaps, no cards. Hover fills Mist, numbers are tabular and right aligned.">
          <div className="rowset">
            {[
              ["Ayesha Khan", "Senior React Engineer · Karachi", 74, "SHORTLISTED"],
              ["Daniyal Memon", "Product Designer · Lahore", 58, "VIEWED"],
              ["Sana Raza", "Data Engineer · Remote", 81, "SUBMITTED"],
            ].map(([name, meta, rate, status]) => (
              <div key={name as string} className="row-hover flex items-center gap-4 px-4 py-3">
                <MatchMeter score={(rate as number) + 12} showValue={false} className="w-14" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{name}</p>
                  <p className="truncate text-[15px] text-muted-foreground">{meta}</p>
                </div>
                <span className="t-data">${rate}/hr</span>
                <ProfileBadge
                  spec={applicationStatusBadge(status as "SHORTLISTED" | "VIEWED" | "SUBMITTED")}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Loading and empty" note="A slow opacity pulse, never a shimmer sweep. Empty states name the thing to change and always carry one action.">
          <div className="space-y-6">
            <SkeletonRows rows={3} />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="size-10 rounded-full" />
            </div>
            <EmptyState
              title="No matches yet"
              guidance="Nothing fits “React” in Karachi under $30/hr. Widen the location or drop the rate filter to see more."
              action={
                <Button variant="outline">
                  Clear the rate filter
                  <IconArrowRight />
                </Button>
              }
            />
          </div>
        </Section>

        <Section title="Star rating" note="Display only here. The input form lives on the engagements screen.">
          <div className="space-y-2">
            {[5, 4, 3, null].map((v, i) => (
              <StarRating key={i} value={v} count={v ? 12 : 0} />
            ))}
          </div>
        </Section>

        <Section
          title="Steps"
          note="Numbering encodes a real sequence here, so ordinals carry information rather than decorating. State is marked by rule, weight and a tick — never colour alone."
        >
          <div className="space-y-6">
            {[0, 1, 2].map((current) => (
              <Steps key={current} steps={["About you", "Work details", "Skills"]} current={current} />
            ))}
          </div>
        </Section>

        <Section title="Role choice" note="The signup decision that cannot be undone. The whole card is the hit area.">
          <form className="max-w-md">
            <RoleChoice />
          </form>
        </Section>
      </div>
    </main>
  );
}
