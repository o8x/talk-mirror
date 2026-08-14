import { useState } from 'react'
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useStore } from '../store/store'
import { useT } from '../i18n'

interface Props {
  code: string
  language: string
  title: string
}

export default function CodeBlock({ code, language, title }: Props) {
  const darkMode = useStore((s) => s.darkMode)
  const t = useT()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* ignore */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: darkMode ? '#1c2622' : '#fafafa',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 1.5,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {title}
        </Typography>
        <Tooltip title={t('common.copy')}>
          <IconButton size="small" onClick={copy} color={copied ? 'success' : 'default'}>
            {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      <SyntaxHighlighter
        language={language}
        style={darkMode ? oneDark : oneLight}
        showLineNumbers
        wrapLongLines
        customStyle={{ margin: 0, background: 'transparent', fontSize: 12, lineHeight: 1.6 }}
        lineNumberStyle={{ minWidth: '2.4em', opacity: 0.45, userSelect: 'none' }}
        codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
      >
        {code.trimEnd()}
      </SyntaxHighlighter>
    </Box>
  )
}
