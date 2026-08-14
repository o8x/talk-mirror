import { useEffect, useState } from 'react'
import {
  Box,
  Card,
  IconButton,
  Snackbar,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { getCode } from '../api/client'

const LANGS = ['javascript', 'python', 'go', 'shell', 'c++']

export default function Access() {
  const [tab, setTab] = useState(0)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    Promise.all(
      LANGS.map((l) =>
        getCode(l)
          .then((r) => [l, r.code] as const)
          .catch(() => [l, ''] as const),
      ),
    ).then((entries) => setCodes(Object.fromEntries(entries)))
  }, [])

  const lang = LANGS[tab]
  const code = codes[lang] ?? ''

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Copy a ready-to-run client snippet. All examples use only the language standard library and
        push frames in the format <code>|2-byte length|json|</code> to the data port (default 3000).
      </Typography>

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
            {LANGS.map((l) => (
              <Tab key={l} label={l} />
            ))}
          </Tabs>
          <Tooltip title="Copy">
            <IconButton
              sx={{ ml: 'auto', mr: 1 }}
              onClick={() => {
                navigator.clipboard.writeText(code)
                setCopied(true)
              }}
            >
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ p: 2, overflow: 'auto' }}>
          <pre
            style={{
              margin: 0,
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              whiteSpace: 'pre',
              lineHeight: 1.5,
            }}
          >
            {code}
          </pre>
        </Box>
      </Card>

      <Snackbar
        open={copied}
        autoHideDuration={1500}
        onClose={() => setCopied(false)}
        message="Copied to clipboard"
      />
    </Box>
  )
}
