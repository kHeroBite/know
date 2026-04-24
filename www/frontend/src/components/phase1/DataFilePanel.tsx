import { useState, useEffect, useCallback } from 'react'
import { Table, Card, Button, Typography, Popconfirm, Progress, Checkbox, Space, message } from 'antd'
import { InboxOutlined, DeleteOutlined, ReloadOutlined, ScanOutlined } from '@ant-design/icons'
import { phase1DataAPI, type ColumnSpec } from '../../api/phase1Data'
import ColumnSelectModal from './ColumnSelectModal'

const { Text } = Typography

interface FileItem {
  name: string
  size: number
  mtime: string
}

interface DataFilePanelProps {
  workspace?: string
  domain?: string
  selectedColumns: ColumnSpec[]
  onFilesChange?: (count: number, filenames: string[]) => void
  onColumnsConfigured?: (columns: ColumnSpec[]) => void
}

export default function DataFilePanel({
  workspace,
  domain,
  selectedColumns,
  onFilesChange,
  onColumnsConfigured,
}: DataFilePanelProps) {
  const [파일목록, set파일목록] = useState<FileItem[]>([])
  const [로딩, set로딩] = useState(false)
  const [업로딩, set업로딩] = useState(false)
  const [업로드진행률, set업로드진행률] = useState(0)
  const [드래그오버, set드래그오버] = useState(false)
  const [선택항목, set선택항목] = useState<string[]>([])
  const [모달열림, set모달열림] = useState(false)

  const 목록조회 = useCallback(async () => {
    set로딩(true)
    try {
      const { data } = await phase1DataAPI.파일목록(workspace)
      const files: FileItem[] = data.files || []
      set파일목록(files)
      set선택항목([])
      onFilesChange?.(files.length, files.map(f => f.name))
    } catch {
      message.error('파일 목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }, [workspace, onFilesChange])

  useEffect(() => { 목록조회() }, [workspace])

  const 삭제핸들러 = async (filename: string) => {
    try {
      await phase1DataAPI.파일삭제(filename, workspace)
      message.success(`${filename} 삭제 완료`)
      목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '삭제 실패')
    }
  }

  const 일괄삭제핸들러 = async () => {
    for (const name of 선택항목) {
      try {
        await phase1DataAPI.파일삭제(name, workspace)
      } catch { /* skip */ }
    }
    message.success(`${선택항목.length}개 파일 삭제 완료`)
    목록조회()
  }

  const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB

  const 파일업로드처리 = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      message.error(`${file.name}: 파일 크기 1GB 초과`)
      return
    }
    set업로딩(true)
    set업로드진행률(0)
    try {
      await phase1DataAPI.파일업로드(file, workspace, (percent) => {
        set업로드진행률(percent)
      })
      message.success(`${file.name} 업로드 완료`)
      목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '업로드 실패')
    } finally {
      set업로딩(false)
      set업로드진행률(0)
    }
  }, [workspace, 목록조회])

  const 다중파일업로드처리 = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files)
    for (const file of fileArr) {
      await 파일업로드처리(file)
    }
  }, [파일업로드처리])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    다중파일업로드처리(files)
    e.target.value = ''
  }

  const 전체선택 = 선택항목.length === 파일목록.length && 파일목록.length > 0

  const 컬럼 = [
    {
      title: (
        <Checkbox
          checked={전체선택}
          indeterminate={선택항목.length > 0 && !전체선택}
          onChange={e => set선택항목(e.target.checked ? 파일목록.map(f => f.name) : [])}
        />
      ),
      key: 'check',
      width: 36,
      render: (_: any, record: FileItem) => (
        <Checkbox
          checked={선택항목.includes(record.name)}
          onChange={e => {
            set선택항목(prev => e.target.checked ? [...prev, record.name] : prev.filter(n => n !== record.name))
          }}
        />
      ),
    },
    {
      title: '파일',
      dataIndex: 'name',
      key: 'name',
      render: (_: any, record: FileItem) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2, wordBreak: 'break-all' as const }}>{record.name}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#888', fontSize: 12 }}>
              {(record.size / 1024).toFixed(1)}KB &nbsp;&middot;&nbsp; {record.mtime?.slice(0, 19).replace('T', ' ')}
            </span>
            <Popconfirm
              title={`${record.name} 삭제하시겠습니까?`}
              onConfirm={() => 삭제핸들러(record.name)}
              okText="삭제"
              cancelText="취소"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </div>
        </div>
      ),
    },
  ]

  const 파일없음 = 파일목록.length === 0

  return (
    <Card title="데이터 파일">
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); set드래그오버(true) }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); set드래그오버(false) }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); set드래그오버(false)
          const files = e.dataTransfer?.files
          if (files && files.length > 0) 다중파일업로드처리(files)
        }}
        style={{
          position: 'relative',
          marginBottom: 16,
          padding: '16px 0',
          border: `1px dashed ${드래그오버 ? '#4f46e5' : '#d9d9d9'}`,
          borderRadius: 8,
          background: 드래그오버 ? '#f5f3ff' : '#fafafa',
          textAlign: 'center',
          cursor: 업로딩 ? 'not-allowed' : 'pointer',
          transition: 'border-color 0.3s, background 0.3s',
          opacity: 업로딩 ? 0.5 : 1,
        }}
      >
        <input
          type="file"
          multiple
          onChange={handleFileInputChange}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 업로딩 ? 'not-allowed' : 'pointer',
            zIndex: 1,
          }}
          disabled={업로딩}
        />
        <p style={{ fontSize: 32, color: '#40a9ff', marginBottom: 8, pointerEvents: 'none' }}><InboxOutlined /></p>
        <p style={{ margin: '0 0 4px', color: 'rgba(0,0,0,0.88)', pointerEvents: 'none' }}>파일을 드래그하거나 클릭하여 업로드</p>
        <p style={{ margin: 0, color: 'rgba(0,0,0,0.45)', fontSize: 12, pointerEvents: 'none' }}>SGML 등 텍스트 형식 파일 (최대 1GB, 다중 선택 가능)</p>
      </div>

      {업로딩 && (
        <Progress
          percent={업로드진행률}
          status="active"
          strokeColor={{ from: '#4f46e5', to: '#818cf8' }}
          style={{ marginBottom: 12 }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space size={8}>
          <Text type="secondary">{파일목록.length}개 파일</Text>
          {선택항목.length > 0 && (
            <Popconfirm
              title={`선택한 ${선택항목.length}개 파일을 삭제하시겠습니까?`}
              onConfirm={일괄삭제핸들러}
              okText="삭제"
              cancelText="취소"
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                {선택항목.length}개 삭제
              </Button>
            </Popconfirm>
          )}
        </Space>
        <Space size={8}>
          <Button
            size="small"
            type="primary"
            icon={<ScanOutlined />}
            disabled={파일없음}
            onClick={() => set모달열림(true)}
          >
            컬럼 분석
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => 목록조회()} loading={로딩}>
            새로고침
          </Button>
        </Space>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); set드래그오버(true) }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); set드래그오버(false) }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); set드래그오버(false)
          const files = e.dataTransfer?.files
          if (files && files.length > 0) 다중파일업로드처리(files)
        }}
        style={{
          border: 드래그오버 ? '2px dashed #4f46e5' : '2px dashed transparent',
          borderRadius: 8,
          background: 드래그오버 ? 'rgba(79, 70, 229, 0.04)' : 'transparent',
          transition: 'all 0.2s ease',
        }}
      >
        <Table
          rowKey="name"
          dataSource={파일목록}
          columns={컬럼}
          size="small"
          loading={로딩}
          pagination={{ pageSize: 10, size: 'small' }}
        />
      </div>

      <ColumnSelectModal
        open={모달열림}
        onClose={() => set모달열림(false)}
        workspace={workspace}
        domain={domain}
        filenames={파일목록.map(f => f.name)}
        initialColumns={selectedColumns}
        onSave={(cols) => {
          onColumnsConfigured?.(cols)
        }}
      />
    </Card>
  )
}
