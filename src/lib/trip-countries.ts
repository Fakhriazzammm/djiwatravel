/**
 * Every country a traveller can plan a trip to, with Indonesian names and flags.
 *
 * Names come from the platform's `Intl.DisplayNames` (id-ID), so the list needs no hand-kept
 * translations. Flags are the two regional-indicator letters of the ISO code. The list is sorted
 * by name for the search picker.
 */

// ISO 3166-1 alpha-2 codes (sovereign states and common territories).
const ISO_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
  "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR",
  "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT",
  "JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
  "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ",
  "OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
  "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","YE","YT","ZA","ZM","ZW",
];

export type TripCountry = { code: string; name: string; flag: string };

const regionNames =
  typeof Intl !== "undefined" && Intl.DisplayNames
    ? new Intl.DisplayNames(["id-ID"], { type: "region" })
    : null;

export function flagFor(code: string): string {
  return [...code.toUpperCase()]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

export const TRIP_COUNTRIES: readonly TripCountry[] = ISO_CODES.map((code) => ({
  code,
  name: regionNames?.of(code) ?? code,
  flag: flagFor(code),
})).sort((a, b) => a.name.localeCompare(b.name, "id-ID"));

/** Case- and accent-insensitive match on the Indonesian name, the English name or the code. */
export function searchCountries(query: string, list: readonly TripCountry[] = TRIP_COUNTRIES) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (country) =>
      country.name.toLowerCase().includes(q) || country.code.toLowerCase() === q,
  );
}

/** Currency the server accepts for a trip; countries without one keep IDR (the trip default). */
const CURRENCY_BY_COUNTRY: Record<string, "IDR" | "JPY" | "USD" | "SGD" | "KRW"> = {
  ID: "IDR",
  JP: "JPY",
  US: "USD",
  SG: "SGD",
  KR: "KRW",
};
export function tripCurrencyFor(code: string): "IDR" | "JPY" | "USD" | "SGD" | "KRW" {
  return CURRENCY_BY_COUNTRY[code.toUpperCase()] ?? "IDR";
}
