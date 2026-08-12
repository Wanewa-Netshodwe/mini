import { exec } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { ToolResult } from './tool.Type.js'
import { resolveLocalPath } from './utils/pathResolver.js'

type WordArguments = {
  taskId: string
  step_number: number
  tool: string
  operation: 'create' | 'edit' | 'read'
  filePath: string
  content?: string
  exportFormat?: string
  //where to save the exported file (if exportFormat is specified). If not provided, defaults to the same directory as filePath with the appropriate extension.
  exportPath?: string
}

/** Word wdSaveFormat constants for the formats Word can export via SaveAs2. */
const WDFORMAT: Record<string, number> = {
  doc: 0,
  dot: 1,
  txt: 2,
  text: 2,
  dos: 4,
  rtf: 6,
  unicode: 7,
  html: 8,
  htm: 8,
  webarchive: 9,
  mht: 9,
  xml: 12,
  docm: 13,
  dotx: 14,
  dotm: 15,
  docx: 16,
  pdf: 17,
  xps: 18,
  odt: 23,
  flatxml: 24
}

const errorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err)
}

/** Write a PowerShell script to a temp file and run it with -File, so
 *  multi-line scripts survive cmd.exe quoting intact. */
const runScriptFile = (
  script: string,
  timeoutMs: number
): Promise<{ success: boolean; stdout: string; stderr: string }> => {
  return new Promise(async (resolve) => {
    try {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wps-'))
      const scriptFile = path.join(tmpDir, 'run.ps1')
      await fs.writeFile(scriptFile, script, 'utf-8')
      exec(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptFile}"`,
        {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          windowsHide: true
        },
        (error, stdout, stderr) => {
          fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
          const out = (stdout ?? '').trim()
          const err = (stderr ?? '').trim()
          if (error) {
            resolve({ success: false, stdout: out, stderr: err || error.message })
          } else {
            resolve({ success: true, stdout: out, stderr: err })
          }
        }
      )
    } catch (err) {
      resolve({ success: false, stdout: '', stderr: errorMessage(err) })
    }
  })
}

/** Check Microsoft Word is installed and usable via COM BEFORE doing any work. */
const checkWordInstalled = async (): Promise<{ ok: boolean; detail: string }> => {
  const probe = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    '  $w = New-Object -ComObject Word.Application',
    "  Write-Output ('VERSION:' + $w.Version)",
    '  $w.Quit()',
    '  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($w) | Out-Null',
    '} catch {',
    "  Write-Output ('MISSING:' + $_.Exception.Message)",
    '  exit 1',
    '}'
  ].join('\n')
  const res = await runScriptFile(probe, 30000)
  if (res.success && /VERSION:/.test(res.stdout)) {
    const version = /VERSION:([^\r\n]+)/.exec(res.stdout)?.[1]?.trim() ?? 'unknown'
    return { ok: true, detail: `Microsoft Word is installed (v${version}).` }
  }
  const detail = (res.stderr || res.stdout || '').replace(/VERSION:/g, '').trim()
  return {
    ok: false,
    detail:
      detail ||
      'Microsoft Word is not installed or its COM automation is unavailable. Install Microsoft Word (Office) and retry.'
  }
}

/**
 * microsoft_word — create/edit/read a real .docx document by driving Microsoft
 * Word through PowerShell COM. Checks Word is installed first. `create` builds
 * a table when content looks like CSV, and can export the document to ANY
 * format Word supports (pdf, doc, rtf, txt, html, odt, xps, xml, ...).
 */
const microsoftWordTool = async (args: WordArguments): Promise<ToolResult> => {
  const fail = (msg: string): ToolResult => ({
    output: msg,
    taskId: args.taskId,
    step_number: args.step_number,
    tool: args.tool,
    success: false,
    error: msg
  })

  if (!args.filePath || typeof args.filePath !== 'string') {
    return fail('filePath is required (an absolute path or a ~/... path).')
  }

  // Pre-flight: confirm Word is installed before touching files or launching.
  const installed = await checkWordInstalled()
  if (!installed.ok) {
    return fail(installed.detail)
  }

  const docPath = resolveLocalPath(args.filePath)

  // Resolve the optional export format. Default to pdf to match the common
  // "save the Word doc as a PDF" request; anything else the planner asks for
  // (doc/rtf/txt/html/odt/xps/xml/...) is supported via the wdSaveFormat table.
  let exportFormat: string | null = null
  let exportFilePath: string | null = null
  if (args.exportFormat || /\.docx$/i.test(args.filePath) === false) {
    const fmt = (args.exportFormat ?? 'pdf').trim().toLowerCase()
    if (!WDFORMAT[fmt]) {
      return fail(
        `Unsupported export format "${fmt}". Supported: ${Object.keys(WDFORMAT).join(', ')}.`
      )
    }
    exportFormat = fmt
    const base = args.filePath.replace(/\.[^/.]+$/, '')
    exportFilePath = resolveLocalPath(args.exportPath ?? `${base}.${fmt}`)
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wordtool-'))
  try {
    // Pass content through a temp file so we never inline user data into the
    // PowerShell command string (quoting/escaping is a foot-gun).
    const contentFile = path.join(tmpDir, 'content.txt')
    if (args.content !== undefined) {
      await fs.writeFile(contentFile, args.content, 'utf-8')
    }

    const script = buildScript({
      operation: args.operation,
      docPath,
      exportFormat,
      exportFilePath,
      contentFile: args.content !== undefined ? contentFile : null
    })
    const result = await runScriptFile(script, 120000)
    if (!result.success) {
      return fail(result.stderr || result.stdout || 'Word automation failed')
    }

    const output: Record<string, unknown> = {
      operation: args.operation,
      filePath: docPath,
      wordVersion: /VERSION:[^\r\n]+/.test(result.stdout)
        ? /VERSION:([^\r\n]+)/.exec(result.stdout)?.[1]?.trim()
        : undefined
    }
    if (exportFormat && exportFilePath) {
      output.exportFormat = exportFormat
      output.exportPath = exportFilePath
    }
    if (args.operation === 'read' && result.stdout) {
      const lines = result.stdout.split(/\r?\n/)
      output.text = lines.filter((l) => !/^VERSION:/.test(l)).join('\n')
    }
    return {
      output,
      taskId: args.taskId,
      step_number: args.step_number,
      tool: args.tool,
      success: true
    }
  } catch (err) {
    return fail(errorMessage(err))
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

const buildScript = (o: {
  operation: 'create' | 'edit' | 'read'
  docPath: string
  exportFormat: string | null
  exportFilePath: string | null
  contentFile: string | null
}): string => {
  const fmt = o.exportFormat ? WDFORMAT[o.exportFormat] : null
  const lines: string[] = [
    "$ErrorActionPreference = 'Stop'",
    '$word = $null',
    '$doc = $null',
    'try {',
    '  $word = New-Object -ComObject Word.Application',
    '  $word.Visible = $false',
    '  $word.DisplayAlerts = 0'
  ]

  if (o.operation === 'read') {
    lines.push(
      `  $doc = $word.Documents.Open(${psQuote(o.docPath)}, $false, $true)`,
      '  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '  Write-Output $doc.Content.Text',
      '  $doc.Close(0)'
    )
  } else if (o.operation === 'create') {
    lines.push('  $doc = $word.Documents.Add()')
    if (o.contentFile) {
      lines.push(
        `  $raw = Get-Content -LiteralPath ${psQuote(o.contentFile)} -Raw`,
        '  $lines = $raw -split "`r?`n" | Where-Object { $_.Trim() -ne \'\' }',
        '  $header = $null',
        '  $rows = New-Object System.Collections.ArrayList',
        '  $first = $true',
        '  foreach ($ln in $lines) {',
        "    $fields = $ln.Split(',') | ForEach-Object { $_.Trim() }",
        '    if ($first) { $header = $fields; $first = $false; continue }',
        '    $isKeyRow = $true',
        "    foreach ($f in $fields) { if ($f -notmatch '^[a-zA-Z_]+$') { $isKeyRow = $false; break } }",
        '    if ($isKeyRow -and $fields.Count -eq $header.Count) { continue }',
        '    [void]$rows.Add($fields)',
        '  }',
        '  $p = $doc.Paragraphs.Add()',
        "  $p.Range.Text = 'Curated List'",
        '  $p.Range.Font.Size = 16',
        '  $p.Range.Font.Bold = $true',
        '  $p.Range.InsertParagraphAfter()',
        '  if ($header -and $rows.Count -gt 0) {',
        '    $tbl = $doc.Tables.Add($doc.Range($doc.Paragraphs($doc.Paragraphs.Count).Range.Start, $doc.Paragraphs($doc.Paragraphs.Count).Range.Start), $rows.Count + 1, $header.Count)',
        '    $tbl.Borders.Enable = $true',
        '    for ($c = 0; $c -lt $header.Count; $c++) { $tbl.Cell(1, $c + 1).Range.Text = [string]$header[$c] }',
        '    for ($r = 0; $r -lt $rows.Count; $r++) {',
        '      for ($c = 0; $c -lt @($rows[$r]).Count; $c++) { $tbl.Cell($r + 2, $c + 1).Range.Text = [string]@($rows[$r])[$c] }',
        '    }',
        '  } else {',
        '    $rng = $doc.Paragraphs($doc.Paragraphs.Count).Range',
        '    $rng.Text = $raw',
        '  }'
      )
    } else {
      lines.push("  $doc.Content.Text = ''")
    }
    lines.push(`  $doc.SaveAs2(${psQuote(o.docPath)}, 16)`)
  } else {
    // edit
    lines.push(`  $doc = $word.Documents.Open(${psQuote(o.docPath)})`)
    if (o.contentFile) {
      lines.push(
        `  $raw = Get-Content -LiteralPath ${psQuote(o.contentFile)} -Raw`,
        '  $rng = $doc.Paragraphs($doc.Paragraphs.Count).Range',
        '  $rng.InsertAfter($raw)',
        '  $rng.InsertParagraphAfter()'
      )
    }
    lines.push('  $doc.Save()')
  }

  if (fmt !== null && o.exportFilePath) {
    lines.push(`  $doc.SaveAs2(${psQuote(o.exportFilePath)}, ${fmt})`)
  }
  if (o.operation !== 'read') {
    lines.push('  $doc.Close(0)')
  }
  lines.push(
    '} finally {',
    '  if ($word) { $word.Quit() }',
    '  if ($doc) { try { [void]$doc.Close(0) } catch {} }',
    '  if ($word) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }',
    '}'
  )
  return lines.join('\n')
}
const psQuote = (s: string): string => {
  const escaped = s.replace(/\\/g, '/').replace(/'/g, "''")
  return `'${escaped}'`
}

export default microsoftWordTool
