import { useEffect, useState, useCallback } from 'react'
import {
  Card, Button, Select, Space, Tabs, Table, message, Typography, Tag, Spin,
} from 'antd'
import { FilePptOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { reportAPI, type DiffResponse } from '../api/reports'
import { backupAPI, type Backup } from '../api/backup'

const { Text } = Typography

type Mode = 'admin' | 'public'
type DictCategory = 'udic' | 'cndic' | 'thesaurus' | 'category'
type DeltaKind = 'added' | 'removed' | 'modified'

interface Props {
  workspace: string
  currentBackup: string
  domain?: string
  defaultPrevBackup?: string | null
  mode?: Mode
  hasReport?: boolean
}

const DICT_TABS: { key: DictCategory; label: string }[] = [
  { key: 'udic', label: 'UDIC' },
  { key: 'cndic', label: 'CNDIC' },
  { key: 'thesaurus', label: 'THESAURUS' },
  { key: 'category', label: 'CATEGORY' },
]

export default function ReportPanel({
  workspace,
  currentBackup,
  domain,
  defaultPrevBackup,
  mode = 'admin',
  hasReport: hasReportProp = false,
}: Props) {
  const [backupList, setBackupList] = useState<Backup[]>([])
  const [prevBackup, setPrevBackup] = useState<string | null>(defaultPrevBackup ?? null)
  const [generating, setGenerating] = useState(false)
  const [hasReport, setHasReport] = useState(hasReportProp)

  const [dictTab, setDictTab] = useState<DictCategory>('udic')
  const [deltaTab, setDeltaTab] = useState<DeltaKind>('added')
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffData, setDiffData] = useState<DiffResponse | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const loadBackups = useCallback(async () => {
    if (mode !== 'admin' || !domain) return
    try {
      const res = await backupAPI.listBackups(domain)
      const items = (res.data?.backups || []).filter((b) => b.name !== currentBackup)
      setBackupList(items)
    } catch (e: any) {
      console.warn('백업 목록 로드 실패', e?.message)
    }
  }, [mode, domain, currentBackup])

  useEffect(() => { loadBackups() }, [loadBackups])

  const loadDiff = useCallback(async () => {
    if (!workspace || !currentBackup) return
    setDiffLoading(true)
    try {
      const res = await reportAPI.getDiff(workspace, currentBackup, {
        prev_backup: prevBackup,
        category: dictTab,
        page,
        page_size: pageSize,
      })
      setDiffData(res.data)
    } catch (e: any) {
      // 공개 모드에선 조용히, 관리자 모드에선 에러 표시
      if (mode === 'admin') {
        message.error('Diff 로드 실패: ' + (e?.response?.data?.detail || e?.message || ''))
      }
      setDiffData(null)
    } finally {
      setDiffLoading(false)
    }
  }, [workspace, currentBackup, prevBackup, dictTab, page, pageSize, mode])

  useEffect(() => { loadDiff() }, [loadDiff])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await reportAPI.generateReport(workspace, currentBackup, prevBackup)
      setHasReport(true)
      message.success('PPT 리포트가 생성되었습니다')
    } catch (e: any) {
      message.error('리포트 생성 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async () => {
    try {
      const res = await reportAPI.downloadPptFile(workspace, currentBackup)
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' })
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      // Content-Disposition 헤더에서 파일명 추출, 없으면 기본값 사용
      const disposition = res.headers['content-disposition'] || ''
      const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/)
      a.download = match ? decodeURIComponent(match[1]) : `${workspace}_${currentBackup}.pptx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (e: any) {
      message.error('PPT 다운로드 실패: ' + (e?.response?.data?.detail || e?.message || ''))
    }
  }

  const items = (() => {
    if (!diffData) return [] as any[]
    if (deltaTab === 'added') return diffData.added || []
    if (deltaTab === 'removed') return diffData.removed || []
    return diffData.modified || []
  })()
  const total = (() => {
    if (!diffData) return 0
    if (deltaTab === 'added') return diffData.total_added || 0
    if (deltaTab === 'removed') return diffData.total_removed || 0
    return diffData.total_modified || 0
  })()

  const columns: any[] = [
    { title: 'Key', dataIndex: 'key', key: 'key', width: 240, ellipsis: true },
  ]
  if (deltaTab === 'modified') {
    columns.push(
      { title: 'Before', dataIndex: 'before', key: 'before', ellipsis: true,
        render: (v: any) => <Text type="secondary">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}</Text> },
      { title: 'After', dataIndex: 'after', key: 'after', ellipsis: true,
        render: (v: any) => <Text strong>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}</Text> },
    )
  } else {
    columns.push({
      title: 'Value', dataIndex: 'value', key: 'value', ellipsis: true,
      render: (v: any, r: any) => {
        const display = v ?? r.after ?? r.before ?? ''
        return <Text>{typeof display === 'object' ? JSON.stringify(display) : String(display)}</Text>
      },
    })
  }

  return (
    <Card
      size="small"
      title={<><FilePptOutlined /> 리포트</>}
      style={{ marginBottom: 16 }}
      extra={
        <Space>
          {mode === 'admin' && (
            <>
              <Select
                size="small"
                placeholder="이전 백업 선택"
                allowClear
                style={{ width: 260 }}
                value={prevBackup ?? undefined}
                onChange={(v) => setPrevBackup(v ?? null)}
                options={backupList.map((b) => ({ value: b.name, label: b.name }))}
              />
              <Button
                size="small"
                type="primary"
                icon={<FilePptOutlined />}
                loading={generating}
                onClick={handleGenerate}
              >
                리포트 생성
              </Button>
            </>
          )}
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            disabled={mode === 'admin' && !hasReport}
          >
            PPT 다운로드
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={loadDiff}
            loading={diffLoading}
          >
            새로고침
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Text type="secondary">
          현재 백업: <Tag>{currentBackup}</Tag>
          {prevBackup
            ? <>비교 대상: <Tag color="blue">{prevBackup}</Tag></>
            : <Text type="secondary"> (비교 백업 없음 — 전체가 added로 집계)</Text>}
        </Text>

        <Tabs
          activeKey={dictTab}
          onChange={(k) => { setDictTab(k as DictCategory); setPage(1) }}
          size="small"
          items={DICT_TABS.map((t) => ({ key: t.key, label: t.label }))}
        />

        <Tabs
          activeKey={deltaTab}
          onChange={(k) => { setDeltaTab(k as DeltaKind); setPage(1) }}
          size="small"
          items={[
            { key: 'added', label: `추가 ${diffData?.total_added ?? 0}` },
            { key: 'removed', label: `삭제 ${diffData?.total_removed ?? 0}` },
            { key: 'modified', label: `수정 ${diffData?.total_modified ?? 0}` },
          ]}
        />

        <Spin spinning={diffLoading}>
          <Table
            rowKey={(r: any, idx) => `${r.key}-${idx}`}
            dataSource={items}
            columns={columns}
            size="small"
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100, 200],
              onChange: (p, ps) => { setPage(p); setPageSize(ps) },
              showTotal: (t) => `총 ${t}건`,
            }}
          />
        </Spin>
      </Space>
    </Card>
  )
}
