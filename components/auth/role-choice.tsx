import { IconBriefcase, IconSearch } from "@/components/ui/icon";

/**
 * The role choice, as two real options rather than two bare radios.
 *
 * This decision is permanent — role is written once, on the row's only insert,
 * and there is no path that changes it afterwards. The old markup said
 * "Freelancer — I want to find work" and nothing else, so people were making
 * an irreversible choice with no idea it was irreversible and no idea what
 * either side actually gets. Both are now stated, and the permanence is said
 * plainly rather than buried.
 *
 * Still native radios inside a fieldset: keyboard behaviour, grouping and form
 * semantics all come free, and a div-with-role reimplementation loses them.
 */

const OPTIONS = [
  {
    value: "FREELANCER",
    icon: <IconSearch className="size-5" />,
    title: "I'm looking for work",
    body: "Browse and apply free. 12 applications every 30 days, and you keep 100% of what you earn.",
  },
  {
    value: "RECRUITER",
    icon: <IconBriefcase className="size-5" />,
    title: "I'm hiring",
    body: "Post a role free and receive applications. Verification unlocks unlimited posts and candidate search.",
  },
] as const;

export function RoleChoice({ legend = "How will you use Talent4u?" }: { legend?: string }) {
  return (
    <fieldset>
      <legend className="text-[15px] font-medium">{legend}</legend>
      <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
        This one cannot be changed later — you would need a second account.
      </p>

      <div className="mt-3 grid gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={[
              "group relative flex cursor-pointer gap-3 border border-border p-4",
              "transition-colors duration-[120ms] ease-out",
              "hover:bg-muted",
              // The whole card reacts to the input's state, so the control and
              // its hit area cannot disagree about what is selected.
              "has-[:checked]:border-foreground has-[:checked]:bg-muted",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            ].join(" ")}
          >
            <input
              type="radio"
              name="role"
              value={option.value}
              required
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="mt-0.5 shrink-0 text-muted-foreground group-has-[:checked]:text-primary"
            >
              {option.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">{option.title}</span>
              <span className="mt-0.5 block text-[14px] leading-[20px] text-muted-foreground">
                {option.body}
              </span>
            </span>
            {/* The selected marker: a 3px Signal Red edge, the same device the
                nav rail uses for "you are here". */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px] bg-transparent group-has-[:checked]:bg-primary"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
