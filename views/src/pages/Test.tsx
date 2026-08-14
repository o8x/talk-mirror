import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  Grid,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import SendIcon from '@mui/icons-material/Send'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import CodeBlock from '../components/CodeBlock'
import { getStoredKey, sendTestMessage } from '../api/client'
import { useT } from '../i18n'
import { useStore } from '../store/store'

interface Field {
  key: string
  value: string
}

interface FormState {
  address: string
  talkPort: string
  key: string
  message: string
  fields: Field[]
}

interface Result {
  ok: boolean
  ms: number
  error?: string
  ip?: string
  port?: number
}

const FORM_KEY = 'talk-mirror-test-form'
const TAG = ['test']

function loadForm(): Partial<FormState> {
  try {
    const raw = localStorage.getItem(FORM_KEY)
    if (raw) return JSON.parse(raw) as Partial<FormState>
  } catch {
    /* ignore */
  }
  return {}
}

function genGo(address: string, talkPort: string, message: string, data: Record<string, string>): string {
  const msgLit = JSON.stringify(message)
  const entries = Object.entries(data)
  const dataLit = entries.length
    ? 'map[string]any{\n' +
      entries.map(([k, v]) => `            "${k}": ${JSON.stringify(v)},`).join('\n') +
      '\n        }'
    : 'map[string]any{}'
  return [
    'package main',
    '',
    'import (',
    '    "encoding/binary"',
    '    "encoding/json"',
    '    "fmt"',
    '    "net"',
    '    "time"',
    ')',
    '',
    'func main() {',
    `    conn, err := net.Dial("tcp", ${JSON.stringify(address + ':' + talkPort)})`,
    '    if err != nil {',
    '        panic(err)',
    '    }',
    '    defer conn.Close()',
    '',
    '    msg := map[string]any{',
    '        "time_nano": time.Now().UnixNano(),',
    '        "tag":       []string{"test"},',
    `        "message":   ${msgLit},`,
    `        "data":      ${dataLit},`,
    '    }',
    '    body, _ := json.Marshal(msg)',
    '    buf := make([]byte, 2+len(body))',
    '    binary.BigEndian.PutUint16(buf[:2], uint16(len(body)))',
    '    copy(buf[2:], body)',
    '    _, _ = conn.Write(buf)',
    '    fmt.Println("sent")',
    '}',
    '',
  ].join('\n')
}

function genPython(address: string, talkPort: string, message: string, data: Record<string, string>): string {
  const msgLit = JSON.stringify(message)
  const port = parseInt(talkPort, 10) || 3000
  const dataLit =
    '{' +
    Object.entries(data)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(', ') +
    '}'
  return [
    'import json',
    'import socket',
    'import struct',
    'import time',
    '',
    `sock = socket.create_connection((${JSON.stringify(address)}, ${port}))`,
    'msg = {',
    '    "time_nano": time.time_ns(),',
    '    "tag": ["test"],',
    `    "message": ${msgLit},`,
    `    "data": ${dataLit},`,
    '}',
    'payload = json.dumps(msg).encode("utf-8")',
    'sock.sendall(struct.pack(">H", len(payload)) + payload)',
    'sock.close()',
    '',
  ].join('\n')
}

function genCpp(address: string, talkPort: string, message: string, data: Record<string, string>): string {
  const port = parseInt(talkPort, 10) || 3000
  const entries = Object.entries(data)
  const dataStr = entries.length
    ? '{' + entries.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',') + '}'
    : '{}'
  const cppLit = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  const msgLit = cppLit(JSON.stringify(message))
  const dataLit = cppLit(dataStr)
  return [
    '// C++17 (stdlib only) - TalkMirror test client',
    '#include <arpa/inet.h>',
    '#include <netinet/in.h>',
    '#include <sys/socket.h>',
    '#include <unistd.h>',
    '',
    '#include <chrono>',
    '#include <cstdint>',
    '#include <sstream>',
    '#include <string>',
    '',
    'int main() {',
    '    int sock = socket(AF_INET, SOCK_STREAM, 0);',
    '    sockaddr_in addr{};',
    '    addr.sin_family = AF_INET;',
    `    addr.sin_port = htons(${port});`,
    `    inet_pton(AF_INET, ${JSON.stringify(address)}, &addr.sin_addr);`,
    '    connect(sock, (sockaddr*)&addr, sizeof(addr));',
    '',
    '    auto now = std::chrono::duration_cast<std::chrono::nanoseconds>(',
    '        std::chrono::system_clock::now().time_since_epoch()).count();',
    '',
    '    std::ostringstream json;',
    '    json << R"({"time_nano":)" << now;',
    '    json << R"(,"tag":["test"])";',
    '    json << R"(,"message":)" << ' + msgLit + ';',
    '    json << R"(,"data":)" << ' + dataLit + ';',
    '    json << R"(})";',
    '',
    '    const std::string body = json.str();',
    '    uint16_t len = htons((uint16_t)body.size());',
    '    send(sock, &len, 2, 0);',
    '    send(sock, body.data(), body.size(), 0);',
    '',
    '    close(sock);',
    '    return 0;',
    '}',
    '',
  ].join('\n')
}

export default function Test() {
  const t = useT()
  const darkMode = useStore((s) => s.darkMode)
  const saved = loadForm()
  const [address, setAddress] = useState(() => saved.address ?? window.location.hostname ?? '127.0.0.1')
  const [talkPort, setTalkPort] = useState(() => saved.talkPort ?? '3000')
  const [key, setKey] = useState(() => saved.key ?? getStoredKey())
  const [message, setMessage] = useState(() => saved.message ?? 'hello')
  const [fields, setFields] = useState<Field[]>(() =>
    saved.fields?.length ? saved.fields : [{ key: '', value: '' }],
  )
  const [result, setResult] = useState<Result | null>(null)
  const [running, setRunning] = useState(false)
  const [lang, setLang] = useState<'go' | 'python' | 'cpp'>('go')
  const apiPort = window.location.port || '443'

  useEffect(() => {
    localStorage.setItem(FORM_KEY, JSON.stringify({ address, talkPort, key, message, fields }))
  }, [address, talkPort, key, message, fields])

  const setField = (i: number, k: 'key' | 'value', v: string) => {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, [k]: v } : f)))
  }

  const addField = () => setFields((prev) => [...prev, { key: '', value: '' }])
  const removeField = (i: number) =>
    setFields((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))

  const data = useMemo(() => {
    const d: Record<string, string> = {}
    for (const f of fields) {
      if (f.key.trim()) d[f.key.trim()] = f.value
    }
    return d
  }, [fields])

  const preview = useMemo(() => JSON.stringify({ tag: TAG, message, data }, null, 2), [message, data])

  const generated = useMemo(() => {
    if (lang === 'go') return genGo(address, talkPort, message, data)
    if (lang === 'cpp') return genCpp(address, talkPort, message, data)
    return genPython(address, talkPort, message, data)
  }, [lang, address, talkPort, message, data])

  const run = async () => {
    setRunning(true)
    setResult(null)
    const baseUrl = `https://${address.trim()}:${apiPort}`
    const started = performance.now()
    try {
      const res = await sendTestMessage(baseUrl, { tag: TAG, message, data }, key.trim())
      setResult({ ok: true, ms: Math.round(performance.now() - started), ip: res.ip, port: res.port })
    } catch (e) {
      setResult({ ok: false, ms: Math.round(performance.now() - started), error: String(e) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Box>
      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Card sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('test.hint')}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  size="small"
                  label={t('test.server')}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  size="small"
                  label={t('test.talkPort')}
                  value={talkPort}
                  onChange={(e) => setTalkPort(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  label={t('test.key')}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label={t('test.message')}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  multiline
                  minRows={2}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('test.data')}
                </Typography>
                <Stack spacing={1}>
                  {fields.map((f, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small"
                        label={t('test.fieldKey')}
                        value={f.key}
                        onChange={(e) => setField(i, 'key', e.target.value)}
                        sx={{ width: 200 }}
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label={t('test.value')}
                        value={f.value}
                        onChange={(e) => setField(i, 'value', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                      <IconButton size="small" onClick={() => removeField(i)}>
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
                <Button size="small" startIcon={<AddIcon />} onClick={addField} sx={{ mt: 1 }}>
                  {t('test.addField')}
                </Button>
              </Grid>
            </Grid>

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('test.preview')}
              </Typography>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'auto' }}>
                <SyntaxHighlighter
                  language="json"
                  style={darkMode ? oneDark : oneLight}
                  customStyle={{ margin: 0, background: 'transparent', fontSize: 12, lineHeight: 1.5 }}
                  codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
                >
                  {preview}
                </SyntaxHighlighter>
              </Box>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Button variant="contained" startIcon={<SendIcon />} onClick={run} disabled={running}>
                {t('test.run')}
              </Button>
            </Box>

            {result && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: result.ok ? 'success.main' : 'error.main',
                  bgcolor: 'background.paper',
                }}
              >
                <Alert severity={result.ok ? 'success' : 'error'} sx={{ mb: 1 }}>
                  {result.ok ? t('test.success') : `${t('test.failed')}: ${result.error}`}
                </Alert>
                <Stack direction="row" spacing={3}>
                  <Typography variant="body2">
                    {t('test.duration')}: <strong>{result.ms} ms</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {t('test.localIp')}: {result.ip ?? '-'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {t('test.port')}: {result.port ?? '-'}
                  </Typography>
                </Stack>
              </Box>
            )}
          </Card>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Card sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('test.generatedCode')}
              </Typography>
              <Tabs value={lang} onChange={(_, v) => setLang(v)}>
                <Tab label="Go" value="go" />
                <Tab label="Python" value="python" />
                <Tab label="C++" value="cpp" />
              </Tabs>
            </Box>
            <CodeBlock code={generated} language={lang} title="" />
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
