import { memo, useMemo } from 'react'
import { useTheme } from '@mui/material'

type JsonTokenType = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'ws'

interface JsonToken {
  text: string
  type: JsonTokenType
}

// tokenizeJson splits a compact JSON document into syntax tokens. It is a
// lightweight regex tokenizer tuned for inline highlighting of many rows; it
// intentionally avoids the cost of a full parser or syntax tree.
export function tokenizeJson(input: string): JsonToken[] {
  const tokens: JsonToken[] = []
  // Groups: 1 = string, 2 = number, 3 = true/false/null, 4 = punctuation, 5 = whitespace
  const re =
    /("(?:\\.|[^"\\])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:])|(\s+)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) {
      tokens.push({ text: input.slice(last, m.index), type: 'punct' })
    }
    last = re.lastIndex
    if (m[1] !== undefined) tokens.push({ text: m[1], type: 'string' })
    else if (m[2] !== undefined) tokens.push({ text: m[2], type: 'number' })
    else if (m[3] !== undefined)
      tokens.push({ text: m[3], type: m[3] === 'true' || m[3] === 'false' ? 'boolean' : 'null' })
    else if (m[4] !== undefined) tokens.push({ text: m[4], type: 'punct' })
    else tokens.push({ text: m[5], type: 'ws' })
  }
  if (last < input.length) {
    tokens.push({ text: input.slice(last), type: 'punct' })
  }
  // Mark object keys: a string whose next non-whitespace token is ':'.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'string') continue
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].type === 'ws') continue
      if (tokens[j].type === 'punct' && tokens[j].text === ':') tokens[i].type = 'key'
      break
    }
  }
  return tokens
}

// Small result cache keyed by the JSON text so rows that share the same data
// (e.g. across 1s live polls) do not re-tokenize on every render.
const cache = new Map<string, JsonToken[]>()

function tokenizeCached(input: string): JsonToken[] {
  let tokens = cache.get(input)
  if (!tokens) {
    tokens = tokenizeJson(input)
    if (cache.size >= 500) cache.clear()
    cache.set(input, tokens)
  }
  return tokens
}

interface Props {
  value: unknown
  style?: React.CSSProperties
}

// JsonHighlight renders a JSON value as inline colorized tokens without
// pulling in a full syntax highlighter, keeping large tables responsive.
function JsonHighlight({ value, style }: Props) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'

  const text = useMemo(() => {
    if (value === null || value === undefined) return ''
    return JSON.stringify(value)
  }, [value])

  const tokens = useMemo(() => tokenizeCached(text), [text])

  const colors = useMemo(() => {
    if (dark) {
      return {
        key: '#7ec8e3',
        string: '#a5d6a7',
        number: '#ffb74d',
        boolean: '#ce93d8',
        null: '#ce93d8',
        punct: '#9e9e9e',
      }
    }
    return {
      key: '#0b7285',
      string: '#2e7d32',
      number: '#e65100',
      boolean: '#6a1b9a',
      null: '#6a1b9a',
      punct: '#757575',
    }
  }, [dark])

  return (
    <span style={style}>
      {tokens.map((tk, i) => (
        <span key={i} style={tk.type === 'ws' ? undefined : { color: colors[tk.type] }}>
          {tk.text}
        </span>
      ))}
    </span>
  )
}

export default memo(JsonHighlight)
