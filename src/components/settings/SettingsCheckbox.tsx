import { Checkbox } from "@/components/ui/checkbox";

interface SettingsCheckboxProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  "data-testid"?: string;
}

export function SettingsCheckbox({
  id,
  label,
  description,
  checked,
  onChange,
  "data-testid": testId,
}: SettingsCheckboxProps) {
  return (
    <div className="flex items-center gap-x-2">
      <Checkbox
        checked={checked}
        onCheckedChange={(val) => onChange(Boolean(val))}
        id={id}
        data-testid={testId}
      />
      <label htmlFor={id} className="text-sm">
        {label}
        {description && (
          <span className="text-muted-foreground ml-1">({description})</span>
        )}
      </label>
    </div>
  );
}
