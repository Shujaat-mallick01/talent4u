import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LOGO_ACCEPT, LOGO_MAX_BYTES } from "@/lib/validations/recruiter";

/**
 * The photo/logo change block both editors share: current mark, a file input,
 * one Ink button. Its own form on purpose — a multipart upload failing must
 * never cost the person a page of unsaved text edits, and a photo change is
 * its own gesture on every product people already know.
 */
export function PhotoForm({
  name,
  src,
  shape,
  action,
  fieldName,
  label,
}: {
  name: string;
  src: string | null;
  shape: "person" | "company";
  action: (formData: FormData) => Promise<void>;
  fieldName: string;
  label: string;
}) {
  const inputId = `${fieldName}-file`;
  const maxMb = Math.round(LOGO_MAX_BYTES / (1024 * 1024));

  return (
    <form
      action={action}
      className="mb-6 flex flex-wrap items-center gap-4 border border-border p-4"
    >
      <Avatar name={name} src={src} size="lg" shape={shape} />
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="block text-[15px] font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
          PNG, JPEG or WebP, under {maxMb} MB. It shows everywhere your name does.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            name={fieldName}
            type="file"
            accept={LOGO_ACCEPT}
            required
            className="max-w-full text-[14px] file:mr-3 file:h-8 file:cursor-pointer file:rounded-[2px] file:border file:border-foreground file:bg-transparent file:px-3 file:text-[14px] file:font-semibold"
          />
          <Button type="submit" size="sm" variant="secondary">
            Upload photo
          </Button>
        </div>
      </div>
    </form>
  );
}
