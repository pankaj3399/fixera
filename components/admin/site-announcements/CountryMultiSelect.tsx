import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { SITE_ANNOUNCEMENT_COUNTRY_OPTIONS } from "@/lib/constants/siteAnnouncements";

interface CountryMultiSelectProps {
  value: string[];
  onChange: (countries: string[]) => void;
}

export function CountryMultiSelect({ value, onChange }: CountryMultiSelectProps) {
  return (
    <MultiSelectCombobox
      options={SITE_ANNOUNCEMENT_COUNTRY_OPTIONS}
      value={value}
      onChange={onChange}
      emptySelectionLabel="Everywhere"
      searchPlaceholder="Search countries…"
      ariaLabel="Countries"
    />
  );
}
