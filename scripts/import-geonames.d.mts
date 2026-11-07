// Types for the GeoNames loader, so the tests can import its pure parsers.

export type CityRow = {
  id: number;
  name: string;
  asciiName: string;
  lat: number;
  lng: number;
  featureCode: string;
  countryCode: string;
  admin1: string;
  population: number;
};

export type Admin1Row = { code: string; name: string; asciiName: string };

export const CITIES_URL: string;
export const ADMIN1_URL: string;
export function parseCities(text: string): CityRow[];
export function parseAdmin1(text: string): Admin1Row[];
export function main(argv?: string[]): Promise<void>;
