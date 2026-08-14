import { useEffect, useState } from 'react'
import { Box, Card, Grid, Tab, Tabs, Typography } from '@mui/material'
import CodeBlock from '../components/CodeBlock'
import { getCode } from '../api/client'
import { useT } from '../i18n'

const LANGS: { key: string; label: string; prism: string }[] = [
  { key: 'javascript', label: 'JavaScript', prism: 'javascript' },
  { key: 'python', label: 'Python', prism: 'python' },
  { key: 'go', label: 'Go', prism: 'go' },
  { key: 'shell', label: 'Shell', prism: 'bash' },
  { key: 'c++', label: 'C++', prism: 'cpp' },
]

interface CodeSet {
  class: string
  app: string
}

export default function Access() {
  const t = useT()
  const [tab, setTab] = useState(0)
  const [codes, setCodes] = useState<Record<string, CodeSet>>({})

  useEffect(() => {
    Promise.all(
      LANGS.map((l) =>
        getCode(l.key)
          .then((r) => [l.key, { class: r.class, app: r.app }] as const)
          .catch(() => [l.key, { class: '', app: '' }] as const),
      ),
    ).then((entries) => setCodes(Object.fromEntries(entries)))
  }, [])

  const lang = LANGS[tab]
  const code = codes[lang.key] ?? { class: '', app: '' }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('access.description')}
      </Typography>

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
            {LANGS.map((l) => (
              <Tab key={l.key} label={l.label} />
            ))}
          </Tabs>
        </Box>
        <Box sx={{ p: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} lg={6}>
              <CodeBlock code={code.class} language={lang.prism} title={t('access.classMode')} />
            </Grid>
            <Grid item xs={12} lg={6}>
              <CodeBlock code={code.app} language={lang.prism} title={t('access.appMode')} />
            </Grid>
          </Grid>
        </Box>
      </Card>
    </Box>
  )
}
