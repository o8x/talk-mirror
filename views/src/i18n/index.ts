import { useStore } from '../store/store'
import { en, type Dict } from './en'
import { zh } from './zh'

export type Lang = 'en' | 'zh'

const dicts: Record<string, Dict> = { en, zh }

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]

export function useLang() {
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  return { lang: lang === 'zh' ? 'zh' : 'en', setLang }
}

// useT returns a translation function. Supports {placeholder} interpolation.
export function useT() {
  const lang = useLang().lang
  const dict = dicts[lang] ?? en
  return (key: string, vars?: Record<string, string | number>) => {
    let text = dict[key as keyof Dict] ?? en[key as keyof Dict] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, String(v))
      }
    }
    return text
  }
}
