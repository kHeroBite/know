import { useState, useEffect, useCallback, useRef } from 'react'
import { Table, Card, Button, Typography, Popconfirm, Progress, Checkbox, Space, message } from 'antd'
import { InboxOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { phase1API } from '../../api/phase1'

const { Text } = Typography

interface FileItem {
  name: string
  size: number
  mtime: string
}

interface FilePanelProps {
  folder: 'popular' | 'fails'
  workspace?: string
}

const 폴더명: Record<string, string> = {
  popular: '인기검색어',
  fails: '실패검색어',
}

export default function FilePanel({ folder, workspace }: FilePanelProps) {
  const [파일목록, set파일목록] = useState<FileItem[]>([])
  const [로딩, set로딩] = useState(false)
  const [업로딩, set업로딩] = useState(false)
  const [업로드진행률, set업로드진행률] = useState(0)
  const [드래그오버, set드래그오버] = useState(false)
  const [선택항목, set선택항목] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const { data } = await phase1API.파일목록(folder, workspace)
      set파일목록(data.files || [])
      set선택항목([])
    } catch {
      message.error('파일 목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  useEffect(() => { 목록조회() }, [folder, workspace])

  const 삭제핸들러 = async (filename: string) => {
    try {
      await phase1API.파일삭제(folder, filename, workspace)
      message.success(`${filename} 삭제 완료`)
      목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '삭제 실패')
    }
  }

  const 일괄삭제핸들러 = async () => {
    for (const name of 선택항목) {
      try {
        await phase1API.파일삭제(folder, name, workspace)
      } catch { /* skip */ }
    }
    message.success(`${선택항목.length}개 파일 삭제 완료`)
    목록조회()
  }

  const 파일업로드처리 = useCallback(async (file: File) => {
    if (file.size > 500 * 1024 * 1024) {
      message.error('파일 크기 500MB 초과')
      return
    }
    set업로딩(true)
    set업로드진행률(0)
    try {
      await phase1API.파일업로드(folder, file, workspace, (percent) => {
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
  }, [folder, workspace])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024 * 1024) {
      message.error('파일 크기 500MB 초과')
      e.target.value = ''
      return
    }
    파일업로드처리(file)
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

  return (
    <Card title={폴더명[folder]}>
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); set드래그오버(true) }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); set드래그오버(false) }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); set드래그오버(false)
          const file = e.dataTransfer?.files?.[0]
          if (file) {
            if (file.size > 500 * 1024 * 1024) { message.error('파일 크기 500MB 초과'); return }
            파일업로드처리(file)
          }
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
          ref={fileInputRef}
          type="file"
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
        <p style={{ margin: 0, color: 'rgba(0,0,0,0.45)', fontSize: 12, pointerEvents: 'none' }}>텍스트 형식 파일 (최대 500MB)</p>
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
        <Button size="small" icon={<ReloadOutlined />} onClick={목록조회} loading={로딩}>새로고침</Button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); set드래그오버(true) }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); set드래그오버(false) }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); set드래그오버(false)
          const file = e.dataTransfer?.files?.[0]
          if (file) 파일업로드처리(file)
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
    </Card>
  )
}
