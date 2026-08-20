// Reference data — ISO 3166-1 alpha-2 countries offered in profile forms and
// used to validate the `country` field. Names come from Intl.DisplayNames.
// This list is intentionally broad but not exhaustive; extend CODES in
// scratchpad/gen-countries.mjs and regenerate if a needed country is missing.

export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: readonly Country[] = [
  {
    "code": "AF",
    "name": "Afghanistan"
  },
  {
    "code": "AL",
    "name": "Albania"
  },
  {
    "code": "DZ",
    "name": "Algeria"
  },
  {
    "code": "AO",
    "name": "Angola"
  },
  {
    "code": "AR",
    "name": "Argentina"
  },
  {
    "code": "AM",
    "name": "Armenia"
  },
  {
    "code": "AU",
    "name": "Australia"
  },
  {
    "code": "AT",
    "name": "Austria"
  },
  {
    "code": "AZ",
    "name": "Azerbaijan"
  },
  {
    "code": "BH",
    "name": "Bahrain"
  },
  {
    "code": "BD",
    "name": "Bangladesh"
  },
  {
    "code": "BY",
    "name": "Belarus"
  },
  {
    "code": "BE",
    "name": "Belgium"
  },
  {
    "code": "BJ",
    "name": "Benin"
  },
  {
    "code": "BO",
    "name": "Bolivia"
  },
  {
    "code": "BA",
    "name": "Bosnia & Herzegovina"
  },
  {
    "code": "BW",
    "name": "Botswana"
  },
  {
    "code": "BR",
    "name": "Brazil"
  },
  {
    "code": "BG",
    "name": "Bulgaria"
  },
  {
    "code": "BF",
    "name": "Burkina Faso"
  },
  {
    "code": "BI",
    "name": "Burundi"
  },
  {
    "code": "KH",
    "name": "Cambodia"
  },
  {
    "code": "CM",
    "name": "Cameroon"
  },
  {
    "code": "CA",
    "name": "Canada"
  },
  {
    "code": "CL",
    "name": "Chile"
  },
  {
    "code": "CN",
    "name": "China"
  },
  {
    "code": "CO",
    "name": "Colombia"
  },
  {
    "code": "CD",
    "name": "Congo - Kinshasa"
  },
  {
    "code": "CR",
    "name": "Costa Rica"
  },
  {
    "code": "CI",
    "name": "Côte d’Ivoire"
  },
  {
    "code": "HR",
    "name": "Croatia"
  },
  {
    "code": "CU",
    "name": "Cuba"
  },
  {
    "code": "CY",
    "name": "Cyprus"
  },
  {
    "code": "CZ",
    "name": "Czechia"
  },
  {
    "code": "DK",
    "name": "Denmark"
  },
  {
    "code": "DO",
    "name": "Dominican Republic"
  },
  {
    "code": "EC",
    "name": "Ecuador"
  },
  {
    "code": "EG",
    "name": "Egypt"
  },
  {
    "code": "SV",
    "name": "El Salvador"
  },
  {
    "code": "EE",
    "name": "Estonia"
  },
  {
    "code": "ET",
    "name": "Ethiopia"
  },
  {
    "code": "FI",
    "name": "Finland"
  },
  {
    "code": "FR",
    "name": "France"
  },
  {
    "code": "GE",
    "name": "Georgia"
  },
  {
    "code": "DE",
    "name": "Germany"
  },
  {
    "code": "GH",
    "name": "Ghana"
  },
  {
    "code": "GR",
    "name": "Greece"
  },
  {
    "code": "GT",
    "name": "Guatemala"
  },
  {
    "code": "HN",
    "name": "Honduras"
  },
  {
    "code": "HK",
    "name": "Hong Kong SAR China"
  },
  {
    "code": "HU",
    "name": "Hungary"
  },
  {
    "code": "IS",
    "name": "Iceland"
  },
  {
    "code": "IN",
    "name": "India"
  },
  {
    "code": "ID",
    "name": "Indonesia"
  },
  {
    "code": "IR",
    "name": "Iran"
  },
  {
    "code": "IQ",
    "name": "Iraq"
  },
  {
    "code": "IE",
    "name": "Ireland"
  },
  {
    "code": "IL",
    "name": "Israel"
  },
  {
    "code": "IT",
    "name": "Italy"
  },
  {
    "code": "JM",
    "name": "Jamaica"
  },
  {
    "code": "JP",
    "name": "Japan"
  },
  {
    "code": "JO",
    "name": "Jordan"
  },
  {
    "code": "KZ",
    "name": "Kazakhstan"
  },
  {
    "code": "KE",
    "name": "Kenya"
  },
  {
    "code": "KW",
    "name": "Kuwait"
  },
  {
    "code": "KG",
    "name": "Kyrgyzstan"
  },
  {
    "code": "LA",
    "name": "Laos"
  },
  {
    "code": "LV",
    "name": "Latvia"
  },
  {
    "code": "LB",
    "name": "Lebanon"
  },
  {
    "code": "LY",
    "name": "Libya"
  },
  {
    "code": "LT",
    "name": "Lithuania"
  },
  {
    "code": "LU",
    "name": "Luxembourg"
  },
  {
    "code": "MO",
    "name": "Macao SAR China"
  },
  {
    "code": "MG",
    "name": "Madagascar"
  },
  {
    "code": "MW",
    "name": "Malawi"
  },
  {
    "code": "MY",
    "name": "Malaysia"
  },
  {
    "code": "ML",
    "name": "Mali"
  },
  {
    "code": "MT",
    "name": "Malta"
  },
  {
    "code": "MU",
    "name": "Mauritius"
  },
  {
    "code": "MX",
    "name": "Mexico"
  },
  {
    "code": "MD",
    "name": "Moldova"
  },
  {
    "code": "MN",
    "name": "Mongolia"
  },
  {
    "code": "ME",
    "name": "Montenegro"
  },
  {
    "code": "MA",
    "name": "Morocco"
  },
  {
    "code": "MZ",
    "name": "Mozambique"
  },
  {
    "code": "MM",
    "name": "Myanmar (Burma)"
  },
  {
    "code": "NP",
    "name": "Nepal"
  },
  {
    "code": "NL",
    "name": "Netherlands"
  },
  {
    "code": "NZ",
    "name": "New Zealand"
  },
  {
    "code": "NI",
    "name": "Nicaragua"
  },
  {
    "code": "NE",
    "name": "Niger"
  },
  {
    "code": "NG",
    "name": "Nigeria"
  },
  {
    "code": "MK",
    "name": "North Macedonia"
  },
  {
    "code": "NO",
    "name": "Norway"
  },
  {
    "code": "OM",
    "name": "Oman"
  },
  {
    "code": "PK",
    "name": "Pakistan"
  },
  {
    "code": "PA",
    "name": "Panama"
  },
  {
    "code": "PY",
    "name": "Paraguay"
  },
  {
    "code": "PE",
    "name": "Peru"
  },
  {
    "code": "PH",
    "name": "Philippines"
  },
  {
    "code": "PL",
    "name": "Poland"
  },
  {
    "code": "PT",
    "name": "Portugal"
  },
  {
    "code": "QA",
    "name": "Qatar"
  },
  {
    "code": "RO",
    "name": "Romania"
  },
  {
    "code": "RW",
    "name": "Rwanda"
  },
  {
    "code": "SA",
    "name": "Saudi Arabia"
  },
  {
    "code": "SN",
    "name": "Senegal"
  },
  {
    "code": "RS",
    "name": "Serbia"
  },
  {
    "code": "SG",
    "name": "Singapore"
  },
  {
    "code": "SK",
    "name": "Slovakia"
  },
  {
    "code": "SI",
    "name": "Slovenia"
  },
  {
    "code": "ZA",
    "name": "South Africa"
  },
  {
    "code": "KR",
    "name": "South Korea"
  },
  {
    "code": "ES",
    "name": "Spain"
  },
  {
    "code": "LK",
    "name": "Sri Lanka"
  },
  {
    "code": "SE",
    "name": "Sweden"
  },
  {
    "code": "CH",
    "name": "Switzerland"
  },
  {
    "code": "SY",
    "name": "Syria"
  },
  {
    "code": "TW",
    "name": "Taiwan"
  },
  {
    "code": "TJ",
    "name": "Tajikistan"
  },
  {
    "code": "TZ",
    "name": "Tanzania"
  },
  {
    "code": "TH",
    "name": "Thailand"
  },
  {
    "code": "TN",
    "name": "Tunisia"
  },
  {
    "code": "TR",
    "name": "Türkiye"
  },
  {
    "code": "TM",
    "name": "Turkmenistan"
  },
  {
    "code": "UG",
    "name": "Uganda"
  },
  {
    "code": "UA",
    "name": "Ukraine"
  },
  {
    "code": "AE",
    "name": "United Arab Emirates"
  },
  {
    "code": "GB",
    "name": "United Kingdom"
  },
  {
    "code": "US",
    "name": "United States"
  },
  {
    "code": "UY",
    "name": "Uruguay"
  },
  {
    "code": "UZ",
    "name": "Uzbekistan"
  },
  {
    "code": "VE",
    "name": "Venezuela"
  },
  {
    "code": "VN",
    "name": "Vietnam"
  },
  {
    "code": "YE",
    "name": "Yemen"
  },
  {
    "code": "ZM",
    "name": "Zambia"
  },
  {
    "code": "ZW",
    "name": "Zimbabwe"
  }
];

export const COUNTRY_CODES: ReadonlySet<string> = new Set(COUNTRIES.map((c) => c.code));

export const countryName = (code: string): string | null =>
  COUNTRIES.find((c) => c.code === code)?.name ?? null;
