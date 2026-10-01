export const supportedInterfaceLocales = ['en'] as const;
export type InterfaceLocale = typeof supportedInterfaceLocales[number];
export const defaultInterfaceLocale: InterfaceLocale = 'en';
export const interfaceLocaleStorageKey = 'resumestride.interface-locale.v1';

// Never infer interface language from IP or billing/account country. English
// remains the only choice until another complete journey has been translated
// and reviewed; resume content language is a separate explicit setting.
export function parseInterfaceLocale(value: unknown): InterfaceLocale | null {
 return typeof value === 'string' && (supportedInterfaceLocales as readonly string[]).includes(value) ? value as InterfaceLocale : null;
}
export function initialInterfaceLocale(storage: Pick<Storage,'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): InterfaceLocale {
 try { return parseInterfaceLocale(storage?.getItem(interfaceLocaleStorageKey)) ?? defaultInterfaceLocale; }
 catch { return defaultInterfaceLocale; }
}
export function selectInterfaceLocale(locale: InterfaceLocale, storage: Pick<Storage,'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
 if (!parseInterfaceLocale(locale)) throw new Error('Unsupported interface locale');
 try { storage?.setItem(interfaceLocaleStorageKey,locale); } catch { /* selection still applies to this page */ }
 document.documentElement.lang=locale;
 document.documentElement.dir='ltr';
}
export function applyInterfaceLocale(): InterfaceLocale {
 const locale=initialInterfaceLocale();
 document.documentElement.lang=locale;
 document.documentElement.dir='ltr';
 return locale;
}
export const protectedProductIdentifiers = ['APWICO','Free','Premium','Pro','Match Analysis'] as const;
export const localeDate = (value: Date|string|number, options: Intl.DateTimeFormatOptions={dateStyle:'medium'}): string => new Intl.DateTimeFormat(initialInterfaceLocale(),options).format(new Date(value));
export const localeNumber = (value: number, options?: Intl.NumberFormatOptions): string => new Intl.NumberFormat(initialInterfaceLocale(),options).format(value);
